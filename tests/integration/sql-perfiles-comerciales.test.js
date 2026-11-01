const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {laboratorioSqlcmd}=require('./sqlComercialCli');
test('nuevos16/17: perfiles sin login y permisos positivos/negativos reales',{
  skip:process.env.HOSTFLOW_AUTHCOM_PERFILES_SQL_TEST!=='1',timeout:90000,
},async()=>laboratorioSqlcmd(async({ejecutar,runId,propuesta})=>{
  const s=runId.replaceAll('-','').slice(0,12),owner='hf_owner_'+s,legacy='hf_legacy_'+s;
  const nombres={Ingreso:'hf_ingreso_'+s,WorkerIngreso:'hf_worker_'+s,Cuentas:'hf_cuentas_'+s,Correo:'hf_correo_'+s};
  const marca=n=>`EXEC sys.sp_addextendedproperty @name=N'HostFlowTestRun',@value=N'${runId}',@level0type=N'USER',@level0name=N'${n}';`;
  let crear=propuesta('16_identidades_entra_bloqueadas.sql'),grants=propuesta('17_perfiles_minimos_bloqueados.sql');
  const exacta=(t,a,b)=>{assert.equal(t.split(a).length,2,a);return t.replace(a,b);};
  for(const [clave,nombre] of Object.entries(nombres)){
    crear=exacta(crear,`@${clave} sysname=NULL`,`@${clave} sysname=N'${nombre}'`);
    grants=exacta(grants,`@${clave} sysname=NULL`,`@${clave} sysname=N'${nombre}'`);
  }
  for(const [i,clave] of ['Ingreso','Worker','Cuentas','Correo'].entries())crear=exacta(crear,`@${clave}ObjectId uniqueidentifier=NULL`,`@${clave}ObjectId uniqueidentifier='00000000-0000-0000-0000-00000000000${i+1}'`);
  crear=exacta(crear,'@DirectorioRevisado bit=0','@DirectorioRevisado bit=1');
  const linea="SET @SQL=N'CREATE USER '+QUOTENAME(@Nombre)+N' WITH SID = '+CONVERT(varchar(34),CONVERT(varbinary(16),@ObjectId),1)+N', TYPE = E;';";
  // Adaptación estrictamente local: no existe ni se consulta directorio Entra.
  crear=exacta(crear,linea,"SET @SQL=N'CREATE USER '+QUOTENAME(@Nombre)+N' WITHOUT LOGIN;';");
  grants=exacta(grants,"u.type<>N'E' OR u.authentication_type<>4","u.type<>N'S' OR u.authentication_type<>0");
  crear=exacta(crear,"SERVERPROPERTY('EngineEdition'))<>5","SERVERPROPERTY('EngineEdition'))<>3");
  grants=exacta(grants,"SERVERPROPERTY('EngineEdition'))<>5","SERVERPROPERTY('EngineEdition'))<>3");
  crear=crear.replaceAll('hostflow_authcom_owner',owner);
  grants=grants.replaceAll('hostflow_authcom_owner',owner).replaceAll('hostflow_app',legacy);
  // Otros perfiles tienen VIEW DEFINITION sobre owner: eliminarlos antes del owner.
  const usuarios=[...Object.values(nombres),legacy,owner];
  try{
    for(const [nombre,codigo] of [['16_identidades_entra_bloqueadas.sql',51891],['17_perfiles_minimos_bloqueados.sql',51930]]){
      const fuente=fs.readFileSync(path.join(__dirname,'../../sql/proposals/autenticacion_comercial',nombre),'utf8');
      await assert.rejects(ejecutar(fuente),e=>e.codigosSQL.includes(codigo));
      await assert.rejects(ejecutar(fuente.replace('@Aplicar bit=0','@Aplicar bit=NULL')),e=>e.codigosSQL.includes(codigo));
    }
    await ejecutar(`BEGIN TRANSACTION;CREATE USER [${owner}] WITHOUT LOGIN;${marca(owner)}CREATE USER [${legacy}] WITHOUT LOGIN;${marca(legacy)}
      ALTER ROLE db_datareader ADD MEMBER [${legacy}];ALTER ROLE db_datawriter ADD MEMBER [${legacy}];
      ALTER AUTHORIZATION ON SCHEMA::authcom TO [${owner}];DENY SELECT,INSERT,UPDATE,DELETE,EXECUTE,ALTER,REFERENCES,TAKE OWNERSHIP ON SCHEMA::authcom TO [${legacy}];COMMIT;`);
    await ejecutar(crear+Object.values(nombres).map(marca).join('\n'));
    await ejecutar(`ALTER ROLE db_datareader ADD MEMBER [${nombres.Correo}];`);
    await assert.rejects(ejecutar(grants),e=>e.codigosSQL.includes(51933));
    await ejecutar(`ALTER ROLE db_datareader DROP MEMBER [${nombres.Correo}];`);
    await ejecutar(grants);await assert.rejects(ejecutar(grants),e=>e.codigosSQL.includes(51932));
    const fuenteIntegracion=fs.readFileSync(path.join(__dirname,'../../src/services/IntegracionComercialPreparada.js'),'utf8');
    const autoridad=fuenteIntegracion.match(/const autoridad=await tx\.q\(`([\s\S]+?)`\);/)[1].replaceAll('hostflow_authcom_owner',owner);
    for(const [clave,nombre] of Object.entries(nombres)){
      const positivos=clave==='Ingreso'?[['authcom.Ingresos','INSERT']]:clave==='WorkerIngreso'?[['authcom.Ingresos','UPDATE'],['authcom.IngresoFallos','UPDATE'],['authcom.Outbox','INSERT']]:clave==='Cuentas'?[['dbo.Usuarios','INSERT'],['authcom.Desafios','UPDATE']]:[['authcom.Outbox','UPDATE'],['authcom.Desafios','SELECT']];
      const comprobar=positivos.map(([o,p])=>`IF HAS_PERMS_BY_NAME(N'${o}',N'OBJECT',N'${p}')<>1 THROW 51935,'Falta positivo.',1;`).join('\n');
      const q=`EXECUTE AS USER=N'${nombre}';${comprobar}
        DECLARE @Autoridad TABLE(excesivo int);INSERT @Autoridad EXEC(N'${autoridad.replaceAll("'","''")}');
        IF NOT EXISTS(SELECT 1 FROM @Autoridad WHERE excesivo=0) THROW 51943,'Guarda de runtime no acreditada.',1;
        IF ISNULL(IS_ROLEMEMBER(N'db_datareader'),1)<>0 OR ISNULL(IS_ROLEMEMBER(N'db_datawriter'),1)<>0 THROW 51936,'Rol excesivo.',1;
        IF ISNULL(HAS_PERMS_BY_NAME(N'${owner}',N'USER',N'IMPERSONATE'),1)<>0 OR ISNULL(HAS_PERMS_BY_NAME(N'authcom',N'SCHEMA',N'ALTER'),1)<>0
         OR ISNULL(HAS_PERMS_BY_NAME(N'authcom.Auditoria',N'OBJECT',N'DELETE'),1)<>0 THROW 51937,'Negativo no acreditado.',1;
        IF ISNULL(HAS_PERMS_BY_NAME(N'dbo.Usuarios',N'OBJECT',N'UPDATE',N'IdRol',N'COLUMN'),1)<>0 THROW 51938,'Cambio de rol permitido.',1;
        ${clave!=='Cuentas'?"IF ISNULL(HAS_PERMS_BY_NAME(N'dbo.Usuarios',N'OBJECT',N'SELECT',N'PasswordHash',N'COLUMN'),1)<>0 THROW 51939,'Credencial visible.',1;":''}
        ${['Cuentas','WorkerIngreso'].includes(clave)?"BEGIN TRANSACTION;DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource=N'HostFlow:PruebaPerfil',@LockMode='Exclusive',@LockOwner='Transaction',@DbPrincipal='public',@LockTimeout=1000;IF @r NOT IN(0,1) THROW 51942,'Bloqueo no disponible.',1;SELECT u.IdUsuario,r.Nombre,c.VersionContacto FROM dbo.Usuarios u WITH(UPDLOCK,HOLDLOCK) JOIN dbo.Roles r WITH(HOLDLOCK) ON r.IdRol=u.IdRol LEFT JOIN authcom.Contactos c WITH(UPDLOCK,HOLDLOCK) ON c.IdUsuario=u.IdUsuario WHERE u.IdUsuario=-1;ROLLBACK;":''}
        REVERT;SELECT N'PERFIL_${clave}_OK' AS Evidencia;`;
      assert.match(await ejecutar(q),new RegExp('PERFIL_'+clave+'_OK'));
    }
  }finally{
    // Solo los principales marcados por este run; no asumir propiedad por el nombre.
    await ejecutar(`IF USER_NAME()<>N'dbo' REVERT;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name IN(${usuarios.map(n=>`N'${n}'`).join(',')}) AND principal_id NOT IN
       (SELECT major_id FROM sys.extended_properties WHERE class=4 AND name=N'HostFlowTestRun' AND CONVERT(nvarchar(100),value)=N'${runId}')) THROW 51940,'Principal ajeno: no limpiar.',1;
      BEGIN TRANSACTION;IF EXISTS(SELECT 1 FROM sys.schemas WHERE name=N'authcom' AND principal_id=DATABASE_PRINCIPAL_ID(N'${owner}')) ALTER AUTHORIZATION ON SCHEMA::authcom TO dbo;
      ${usuarios.map(n=>`IF DATABASE_PRINCIPAL_ID(N'${n}') IS NOT NULL DROP USER [${n}];`).join('\n')}COMMIT;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name IN(${usuarios.map(n=>`N'${n}'`).join(',')})) THROW 51941,'Principal residual.',1;`);
  }
}));
