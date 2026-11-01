const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {laboratorioSqlcmd}=require('./sqlComercialCli');
const {randomUUID}=require('node:crypto');
const {ContactosVerificadosSql}=require('../../src/repositories/ContactosVerificadosSql');
// Compilar los parámetros capturados del adaptador para SQLCMD NO acredita TDS.
function compilar({q,p}){
  const literal=v=>"N'"+String(v).replaceAll("'","''")+"'";
  const tipo=v=>Buffer.isBuffer(v)?'varbinary(32)':v instanceof Date?'datetime2(3)':typeof v==='number'?'int':'nvarchar(max)';
  const valor=v=>Buffer.isBuffer(v)?'0x'+v.toString('hex'):v instanceof Date?literal(v.toISOString().replace('Z','')):typeof v==='number'?String(v):literal(v);
  return `EXEC sys.sp_executesql ${literal(q)},${literal(Object.entries(p).map(([n,v])=>'@'+n+' '+tipo(v)).join(','))},${Object.entries(p).map(([n,v])=>'@'+n+'='+valor(v)).join(',')};`;
}
test('SQL20 local: guardas, extensión de CHECK, contacto sin backfill y restricciones confiables',{
  skip:process.env.HOSTFLOW_AUTHCOM_CONTACTO_SQL_TEST!=='1',timeout:90000,
},async()=>laboratorioSqlcmd(async({ejecutar,propuesta,runId})=>{
  const sufijo=runId.replaceAll('-','').slice(0,10),owner='hf_owner_'+sufijo,legacy='hf_legacy_'+sufijo,cuentas='hf_contacto_'+sufijo;
  const marcar=n=>`EXEC sys.sp_addextendedproperty @name=N'HostFlowTestRun',@value=N'${runId}',@level0type=N'USER',@level0name=N'${n}';`;
  try{
    await ejecutar(`BEGIN TRANSACTION;CREATE USER [${owner}] WITHOUT LOGIN;${marcar(owner)}CREATE USER [${legacy}] WITHOUT LOGIN;${marcar(legacy)}CREATE USER [${cuentas}] WITHOUT LOGIN;${marcar(cuentas)}
      EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthPerfil',@value=N'cuentas',@level0type=N'USER',@level0name=N'${cuentas}';
      ALTER AUTHORIZATION ON SCHEMA::authcom TO [${owner}];DENY SELECT,INSERT,UPDATE,DELETE,EXECUTE,ALTER,REFERENCES,TAKE OWNERSHIP ON SCHEMA::authcom TO [${legacy}];
      INSERT dbo.Usuarios(Nombre,Email,PasswordHash,IdRol,DebeCambiarPassword) SELECT N'Contacto ficticio',N'contacto@example.invalid',REPLICATE('x',60),IdRol,0 FROM dbo.Roles WHERE Nombre=N'Operador';COMMIT;`);
    const fuente=fs.readFileSync(path.join(__dirname,'../../sql/proposals/autenticacion_comercial/20_verificacion_contacto_bloqueada.sql'),'utf8');
    await assert.rejects(ejecutar(fuente),e=>e.codigosSQL.includes(51980));
    let instalar=propuesta('20_verificacion_contacto_bloqueada.sql').replaceAll('hostflow_authcom_owner',owner).replaceAll('hostflow_app',legacy).replace("SERVERPROPERTY('EngineEdition'))<>5","SERVERPROPERTY('EngineEdition'))<>3");
    await ejecutar(instalar);await assert.rejects(ejecutar(instalar),e=>e.codigosSQL.includes(51983));
    await ejecutar(`IF EXISTS(SELECT 1 FROM authcom.Contactos) THROW 51985,'No debe haber backfill.',1;
      IF EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id IN(OBJECT_ID(N'authcom.Desafios'),OBJECT_ID(N'authcom.Auditoria')) AND (is_disabled=1 OR is_not_trusted=1)) THROW 51985,'CHECK no confiable.',1;
      DECLARE @id int=(SELECT IdUsuario FROM dbo.Usuarios WHERE Email=N'contacto@example.invalid');
      INSERT authcom.Desafios(Id,Hash,Proposito,IdEmpresa,Email,IdUsuario,Documento,CreadaEn,ExpiraEn,Pendiente)
      VALUES(NEWID(),HASHBYTES('SHA2_256','ficticio'),'contacto',1,N'contacto@example.invalid',@id,N'{"versionSesion":1}',SYSUTCDATETIME(),DATEADD(minute,15,SYSUTCDATETIME()),0);
      INSERT authcom.Auditoria(Tipo,UsuarioId,IdEmpresa,Fecha) VALUES('CONTACTO_SOLICITADO',@id,1,SYSUTCDATETIME());`);
    await assert.rejects(ejecutar(`INSERT authcom.Desafios(Id,Hash,Proposito,IdEmpresa,Email,IdInvitador,Documento,CreadaEn,ExpiraEn,Pendiente)
      SELECT NEWID(),HASHBYTES('SHA2_256','invalido'),'contacto',1,Email,IdUsuario,N'{}',SYSUTCDATETIME(),DATEADD(minute,15,SYSUTCDATETIME()),0 FROM dbo.Usuarios;`),e=>e.codigosSQL.includes(547));
    const dcl=fs.readFileSync(path.join(__dirname,'../../sql/proposals/autenticacion_comercial/21_permiso_contacto_bloqueado.sql'),'utf8');
    await assert.rejects(ejecutar(dcl),e=>e.codigosSQL.includes(51986));
    // Dependencia17 simulada solo para este perfil sin login del laboratorio.
    await ejecutar(`EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthPermisos',@value=N'authcom-perfiles-v1',@level0type=N'SCHEMA',@level0name=N'authcom';`);
    const permisos=propuesta('21_permiso_contacto_bloqueado.sql').replaceAll('hostflow_authcom_owner',owner).replaceAll('hostflow_app',legacy)
      .replace('@Cuentas sysname=NULL',`@Cuentas sysname=N'${cuentas}'`)
      .replace("u.type=N'E' AND u.authentication_type=4","u.type=N'S' AND u.authentication_type=0")
      .replace("SERVERPROPERTY('EngineEdition'))<>5","SERVERPROPERTY('EngineEdition'))<>3");
    await ejecutar(permisos);
    await ejecutar(`GRANT SELECT,INSERT ON OBJECT::authcom.Contactos TO [${cuentas}];
      EXECUTE AS USER=N'${cuentas}';INSERT authcom.Contactos(IdUsuario,Email,VersionContacto,VerificadoEn) VALUES(1,N'contacto@example.invalid',1,SYSUTCDATETIME());
      UPDATE authcom.Contactos SET VersionContacto=2,VerificadoEn=SYSUTCDATETIME() WHERE IdUsuario=1;REVERT;`);
    await assert.rejects(ejecutar(`EXECUTE AS USER=N'${cuentas}';UPDATE authcom.Contactos SET IdUsuario=1;`),e=>e.codigosSQL.some(c=>[229,230].includes(c)));
    await assert.rejects(ejecutar(`EXECUTE AS USER=N'${cuentas}';DELETE authcom.Contactos;`),e=>e.codigosSQL.includes(229));
    // Consultas nuevas del adaptador real, ejecutadas por SQLCMD en fixtures propios.
    const capturadas=[],contactos=new ContactosVerificadosSql({habilitado:true,repository:{transaccion:fn=>fn({idEmpresa:1,
      revocarRecuperaciones:async()=>{},q:async(q,p={})=>{capturadas.push({q,p});return {recordset:q.includes('extended_properties')?[{modelo:'authcom-contacto-v1'}]:q.startsWith('SELECT VersionContacto')?[{VersionContacto:2}]:[],rowsAffected:[1]};}})}});
    await contactos.transaccion(async tx=>{
      await tx.insertarVerificacionContacto({id:randomUUID(),hash:'a'.repeat(64),idEmpresa:1,email:'contacto@example.invalid',usuarioId:1,versionSesion:1,creadaEn:Date.now(),expiraEn:Date.now()+900000});
      await tx.verificarContacto({usuarioId:1,email:'contacto@example.invalid',ahora:Date.now()});
    });
    const cambios=capturadas.filter(c=>/^(INSERT authcom.Desafios|UPDATE authcom.Contactos)/.test(c.q)).map(compilar).join('\n');
    await ejecutar(`EXECUTE AS USER=N'${cuentas}';BEGIN TRANSACTION;${compilar(capturadas.find(c=>c.q.startsWith('UPDATE authcom.Contactos')))}ROLLBACK;REVERT;
      IF NOT EXISTS(SELECT 1 FROM authcom.Contactos WHERE IdUsuario=1 AND VersionContacto=2) THROW 51985,'Rollback de contacto no acreditado.',1;`);
    await ejecutar(`BEGIN TRANSACTION;${cambios}COMMIT;
      IF NOT EXISTS(SELECT 1 FROM authcom.Contactos WHERE IdUsuario=1 AND VersionContacto=3) THROW 51985,'Persistencia de contacto no acreditada.',1;`);
    const outboxId=randomUUID(),lease=randomUUID();
    const fuenteRepo=fs.readFileSync(path.join(__dirname,'../../src/repositories/AutenticacionComercialSql.js'),'utf8');
    const q=fuenteRepo.match(/async marcarEntregaEnCurso\(\{id,lease\}\)\{\s+const r=await this\.q\(`([\s\S]+?)`,\{id,lease\}\)/)[1];
    const marca=compilar({q,p:{id:outboxId,lease}});
    await ejecutar(`INSERT authcom.Outbox(Id,ExpiraEn,Sobre,Estado,Proxima,Lease,LeaseHasta) VALUES('${outboxId}',DATEADD(hour,1,SYSUTCDATETIME()),N'{}','procesando',SYSUTCDATETIME(),'${lease}',DATEADD(minute,2,SYSUTCDATETIME()));
      BEGIN TRANSACTION;${marca}COMMIT;
      IF NOT EXISTS(SELECT 1 FROM authcom.Outbox WHERE Id='${outboxId}' AND CodigoFallo='RESULTADO_INCIERTO' AND Sobre IS NOT NULL) THROW 51985,'Marca durable no acreditada.',1;`);
  }finally{
    await ejecutar(`IF USER_NAME()<>N'dbo' REVERT;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name IN(N'${owner}',N'${legacy}',N'${cuentas}') AND principal_id NOT IN(SELECT major_id FROM sys.extended_properties WHERE class=4 AND name=N'HostFlowTestRun' AND CONVERT(nvarchar(100),value)=N'${runId}')) THROW 51940,'Principal ajeno.',1;
      BEGIN TRANSACTION;ALTER AUTHORIZATION ON SCHEMA::authcom TO dbo;DROP USER [${cuentas}];DROP USER [${legacy}];DROP USER [${owner}];COMMIT;`);
  }
}));
