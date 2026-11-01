const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {laboratorioSqlcmd}=require('./sqlComercialCli');
const {consultaFronteraUsuarios}=require('../../src/security/comercial/FronteraSqlComercial');
test('SQL18: rol fijo, auditoría/rollback, replay y permisos de identidades locales',{
  skip:process.env.HOSTFLOW_AUTHCOM_ALTA_SQL_TEST!=='1',timeout:90000,
},async()=>laboratorioSqlcmd(async({ejecutar,propuesta,runId})=>{
  const s=runId.replaceAll('-','').slice(0,10),owner='hf_owner_'+s,legacy='hf_legacy_'+s;
  const perfiles={Ingreso:'hf_ingreso_'+s,WorkerIngreso:'hf_worker_'+s,Cuentas:'hf_cuentas_'+s,Correo:'hf_correo_'+s};
  const tipo={Ingreso:'ingresoHttp',WorkerIngreso:'workerIngreso',Cuentas:'cuentas',Correo:'correo'};
  const marcar=n=>`EXEC sys.sp_addextendedproperty @name=N'HostFlowTestRun',@value=N'${runId}',@level0type=N'USER',@level0name=N'${n}';`;
  const exacta=(t,a,b)=>{assert.equal(t.split(a).length,2,a);return t.replace(a,b);};
  const usuarios=[...Object.values(perfiles),legacy,owner];
  let etapa='inicio';
  try{
    await ejecutar(`BEGIN TRANSACTION;CREATE USER [${owner}] WITHOUT LOGIN;${marcar(owner)}CREATE USER [${legacy}] WITHOUT LOGIN;${marcar(legacy)}
      ALTER AUTHORIZATION ON SCHEMA::authcom TO [${owner}];DENY SELECT,INSERT,UPDATE,DELETE,EXECUTE,ALTER,REFERENCES,TAKE OWNERSHIP ON SCHEMA::authcom TO [${legacy}];
      ${Object.entries(perfiles).map(([p,n])=>`CREATE USER [${n}] WITHOUT LOGIN;${marcar(n)}EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthPerfil',@value=N'${tipo[p]}',@level0type=N'USER',@level0name=N'${n}';`).join('\n')}COMMIT;`);
    let grants=propuesta('17_perfiles_minimos_bloqueados.sql').replaceAll('hostflow_authcom_owner',owner).replaceAll('hostflow_app',legacy);
    for(const [p,n]of Object.entries(perfiles))grants=exacta(grants,`@${p} sysname=NULL`,`@${p} sysname=N'${n}'`);
    grants=exacta(grants,"u.type<>N'E' OR u.authentication_type<>4","u.type<>N'S' OR u.authentication_type<>0");
    grants=exacta(grants,"SERVERPROPERTY('EngineEdition'))<>5","SERVERPROPERTY('EngineEdition'))<>3");
    await ejecutar(grants);etapa='guardas18';
    const fuente=fs.readFileSync(path.join(__dirname,'../../sql/proposals/autenticacion_comercial/18_alta_operador_restringida_bloqueada.sql'),'utf8');
    await assert.rejects(ejecutar(fuente),e=>e.codigosSQL.includes(51950));
    await assert.rejects(ejecutar(fuente.replace('@Aplicar bit=0','@Aplicar bit=NULL')),e=>e.codigosSQL.includes(51950));
    let instalar=propuesta('18_alta_operador_restringida_bloqueada.sql').replaceAll('hostflow_authcom_owner',owner);
    instalar=exacta(instalar,'@AutorizarDDL bit=0','@AutorizarDDL bit=1');instalar=exacta(instalar,'@AutorizarDCL bit=0','@AutorizarDCL bit=1');
    instalar=exacta(instalar,'@Cuentas sysname=NULL',`@Cuentas sysname=N'${perfiles.Cuentas}'`);
    instalar=exacta(instalar,"SERVERPROPERTY('EngineEdition'))<>5","SERVERPROPERTY('EngineEdition'))<>3");
    instalar=exacta(instalar,' COMMIT;',` EXEC sys.sp_addextendedproperty @name=N'HostFlowTestRun',@value=N'${runId}',@level0type=N'SCHEMA',@level0name=N'authcom',@level1type=N'PROCEDURE',@level1name=N'CrearOperadorInvitado';\n COMMIT;`);
    etapa='propietario-excesivo';await ejecutar(`ALTER ROLE db_datareader ADD MEMBER [${owner}];`);
    await assert.rejects(ejecutar(instalar),e=>e.codigosSQL.includes(51952));
    await ejecutar(`ALTER ROLE db_datareader DROP MEMBER [${owner}];`);
    etapa='instalar18';await ejecutar(instalar);await assert.rejects(ejecutar(instalar),e=>e.codigosSQL.includes(51952));
    etapa='fixtures';
    await ejecutar(`DECLARE @Admin int,@Ahora datetime2(3)=SYSUTCDATETIME();
      INSERT dbo.Usuarios(Nombre,Email,PasswordHash,IdRol,DebeCambiarPassword) SELECT N'Admin ficticio',N'admin@example.invalid',REPLICATE('x',60),IdRol,0 FROM dbo.Roles WHERE Nombre=N'Administrador';SET @Admin=SCOPE_IDENTITY();
      INSERT authcom.Desafios(Id,Hash,Proposito,IdEmpresa,Email,IdInvitador,Documento,CreadaEn,ExpiraEn,ConsumidaEn,RevocadaEn,Pendiente)
      SELECT v.Id,HASHBYTES('SHA2_256',CONVERT(varchar(36),v.Id)),'invitacion',1,v.Email,@Admin,
       N'{"nombre":"Operador ficticio","rol":"'+v.Rol+N'","versionInvitador":1}',DATEADD(minute,-1,@Ahora),DATEADD(hour,1,@Ahora),@Ahora,NULL,0
      FROM(VALUES(CONVERT(uniqueidentifier,'10000000-0000-4000-8000-000000000001'),N'aceptado@example.invalid',N'Operador'),
       (CONVERT(uniqueidentifier,'10000000-0000-4000-8000-000000000002'),N'escalada@example.invalid',N'Administrador'),
       (CONVERT(uniqueidentifier,'10000000-0000-4000-8000-000000000003'),N'rollback@example.invalid',N'Operador'))v(Id,Email,Rol);`);
    const invocar=id=>`DECLARE @Fecha datetime2(3)=(SELECT ConsumidaEn FROM authcom.Desafios WHERE Id='10000000-0000-4000-8000-00000000000${id}');
      EXEC authcom.CrearOperadorInvitado @DesafioId='10000000-0000-4000-8000-00000000000${id}',@IdEmpresa=1,@ConsumidaEn=@Fecha,@PasswordHash='$2b$04$.....................................................';`;
    const bloquear=`DECLARE @L int;EXEC @L=sys.sp_getapplock @Resource=N'HostFlow:Seguridad:AdministradoresActivos',@LockMode='Exclusive',@LockOwner='Transaction',@DbPrincipal='public';IF @L NOT IN(0,1) THROW 51959,'Lock ausente.',1;`;
    etapa='permisos';
    for(const [p,n]of Object.entries(perfiles)){
      const q=consultaFronteraUsuarios(tipo[p]);
      await ejecutar(`EXECUTE AS USER=N'${n}';DECLARE @F TABLE(excesivo int);INSERT @F EXEC(N'${q.replaceAll("'","''")}');
        IF NOT EXISTS(SELECT 1 FROM @F WHERE excesivo=0) THROW 51958,'Frontera de columnas no acreditada.',1;REVERT;`);
    }
    const fronteraCorreo=consultaFronteraUsuarios('correo');
    await ejecutar(`GRANT UPDATE ON OBJECT::dbo.Usuarios(Estado) TO [${perfiles.Correo}];EXECUTE AS USER=N'${perfiles.Correo}';
      DECLARE @F TABLE(excesivo int);INSERT @F EXEC(N'${fronteraCorreo.replaceAll("'","''")}');IF NOT EXISTS(SELECT 1 FROM @F WHERE excesivo=1) THROW 51958,'No detectó UPDATE ajeno.',1;
      REVERT;REVOKE UPDATE ON OBJECT::dbo.Usuarios(Estado) FROM [${perfiles.Correo}];`);
    await ejecutar(`EXECUTE AS USER=N'${perfiles.Cuentas}';IF ISNULL(HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','INSERT'),1)<>0 THROW 51958,'INSERT amplio.',1;
      IF HAS_PERMS_BY_NAME(N'authcom.CrearOperadorInvitado','OBJECT','EXECUTE')<>1 THROW 51958,'EXEC ausente.',1;REVERT;`);
    for(const n of [perfiles.Ingreso,perfiles.WorkerIngreso,perfiles.Correo,legacy])await assert.rejects(ejecutar(`EXECUTE AS USER=N'${n}';${invocar(1)}`),e=>e.codigosSQL.some(c=>[229,208].includes(c)));
    etapa='sinTransaccion';await assert.rejects(ejecutar(`EXECUTE AS USER=N'${perfiles.Cuentas}';${invocar(1)}`),e=>e.codigosSQL.includes(51954));
    etapa='escalada';await assert.rejects(ejecutar(`EXECUTE AS USER=N'${perfiles.Cuentas}';BEGIN TRANSACTION;${bloquear}${invocar(2)}`),e=>e.codigosSQL.includes(51956));
    etapa='rollback';await ejecutar(`EXECUTE AS USER=N'${perfiles.Cuentas}';BEGIN TRANSACTION;${bloquear}${invocar(3)}ROLLBACK;REVERT;
      IF EXISTS(SELECT 1 FROM dbo.Usuarios WHERE Email=N'rollback@example.invalid') OR EXISTS(SELECT 1 FROM authcom.Auditoria WHERE DesafioId='10000000-0000-4000-8000-000000000003') THROW 51958,'Rollback incompleto.',1;`);
    etapa='alta';await ejecutar(`EXECUTE AS USER=N'${perfiles.Cuentas}';BEGIN TRANSACTION;${bloquear}${invocar(1)}COMMIT;REVERT;
      IF (SELECT COUNT(*) FROM dbo.Usuarios u JOIN dbo.Roles r ON r.IdRol=u.IdRol WHERE u.Email=N'aceptado@example.invalid' AND r.Nombre=N'Operador')<>1
       OR (SELECT COUNT(*) FROM authcom.Auditoria WHERE DesafioId='10000000-0000-4000-8000-000000000001' AND Tipo='INVITACION_ACEPTADA')<>1 THROW 51958,'Alta/auditoría incorrecta.',1;`);
    etapa='replay';await assert.rejects(ejecutar(`EXECUTE AS USER=N'${perfiles.Cuentas}';BEGIN TRANSACTION;${bloquear}${invocar(1)}`),e=>e.codigosSQL.includes(51956));
  }catch(e){e.message=`Ensayo local falló en ${etapa}; códigos SQL: ${(e.codigosSQL||[]).join(',')}`;throw e;}finally{
    await ejecutar(`IF USER_NAME()<>N'dbo' REVERT;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name IN(${usuarios.map(n=>`N'${n}'`).join(',')}) AND principal_id NOT IN
       (SELECT major_id FROM sys.extended_properties WHERE class=4 AND name=N'HostFlowTestRun' AND CONVERT(nvarchar(100),value)=N'${runId}')) THROW 51940,'Principal ajeno.',1;
      BEGIN TRANSACTION;ALTER AUTHORIZATION ON SCHEMA::authcom TO dbo;${usuarios.map(n=>`IF DATABASE_PRINCIPAL_ID(N'${n}') IS NOT NULL DROP USER [${n}];`).join('\n')}COMMIT;`);
  }
}));
