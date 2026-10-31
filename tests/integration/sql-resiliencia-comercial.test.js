const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {laboratorioSqlcmd}=require('./sqlComercialCli');
const {IngresoComercialSql}=require('../../src/repositories/IngresoComercialSql');
test('SQL local NUEVO: resiliencia08 y perfiles restringidos; no repite siete casos previos',{
  skip:process.env.HOSTFLOW_AUTHCOM_RESILIENCIA_SQL_TEST!=='1',timeout:90000,
},async t=>laboratorioSqlcmd(async({ejecutar,runId,propuesta})=>{
  const id=randomUUID(),correcto=randomUUID();
  await t.test('migración08 confiable; cola ignora cuarentena y reintentos futuros sin borrar sobres',async()=>{
    await ejecutar(`INSERT authcom.Ingresos(Id,CreadaEn,ExpiraEn,Sobre,Estado) VALUES
      ('${id}',DATEADD(minute,-2,SYSUTCDATETIME()),DATEADD(minute,10,SYSUTCDATETIME()),N'{}','pendiente'),
      ('${correcto}',DATEADD(minute,-1,SYSUTCDATETIME()),DATEADD(minute,10,SYSUTCDATETIME()),N'{}','pendiente');
      IF COL_LENGTH(N'authcom.Outbox',N'EnCuarentena') IS NULL THROW 51900,'Falta resiliencia.',1;`);
    const consultas=[];
    const repo=new IngresoComercialSql({habilitado:true,repository:{transaccion:fn=>fn({q:async(q,p)=>{consultas.push({q,p});return{recordset:[{modelo:q.includes('HostFlowAuthResiliencia')?'authcom-resiliencia-v1':'authcom-ingreso-v1'}],rowsAffected:[0]};}})}});
    await repo.transaccion(async tx=>{await tx.reservarIngreso({lease:randomUUID()});await tx.finalizarIngreso(correcto,Date.now(),randomUUID());});
    const seleccion=consultas.find(c=>c.q.includes(';WITH siguiente AS')).q;
    const obtener=()=>ejecutar('SET NOCOUNT ON;DECLARE @lease uniqueidentifier=NEWID();'+seleccion);
    await ejecutar(`INSERT authcom.IngresoFallos(Id,Intentos,Proxima,Estado,Codigo,ActualizadaEn) VALUES('${id}',1,DATEADD(minute,1,SYSUTCDATETIME()),'reintento','TRANSITORIO',SYSUTCDATETIME());`);
    const espera=await obtener();assert.ok(espera.toLowerCase().includes(correcto));assert.ok(!espera.toLowerCase().includes(id));
    assert.ok(!(await obtener()).toLowerCase().includes(correcto));
    await ejecutar(`IF NOT EXISTS(SELECT 1 FROM authcom.Ingresos WHERE Id='${correcto}' AND Intentos=1 AND LeaseHasta>SYSUTCDATETIME()) THROW 51912,'Lease no durable.',1;`);
    const confirmar=consultas.find(c=>c.q.includes("SET Estado='procesada'")).q;
    await ejecutar(`DECLARE @id uniqueidentifier='${correcto}',@lease uniqueidentifier=NEWID();${confirmar}
      IF @@ROWCOUNT<>0 OR NOT EXISTS(SELECT 1 FROM authcom.Ingresos WHERE Id=@id AND Estado='pendiente' AND Sobre IS NOT NULL) THROW 51913,'Se aceptó otro propietario.',1;`);
    await ejecutar(`UPDATE authcom.IngresoFallos SET Estado='cuarentena' WHERE Id='${id}';UPDATE authcom.Ingresos SET ExpiraEn=DATEADD(second,-1,SYSUTCDATETIME()) WHERE Id='${id}';`);
    await ejecutar(propuesta('07_mantenimiento_bloqueado.sql'));
    await ejecutar(`IF NOT EXISTS(SELECT 1 FROM authcom.Ingresos WHERE Id='${id}' AND Sobre IS NOT NULL AND Estado='pendiente') THROW 51901,'Cuarentena perdida.',1;`);
    const agotamiento=consultas.find(c=>c.q.includes('INSERT authcom.IngresoFallos')).q;
    await ejecutar(`UPDATE authcom.Ingresos SET Intentos=3,LeaseHasta=DATEADD(second,-1,SYSUTCDATETIME()) WHERE Id='${correcto}';${agotamiento}
      IF NOT EXISTS(SELECT 1 FROM authcom.IngresoFallos WHERE Id='${correcto}' AND Estado='cuarentena' AND Intentos=3) THROW 51914,'Caídas no acotadas.',1;`);
    const retry=randomUUID(),leaseRetry=randomUUID(),fallos=[];
    const puerto=new IngresoComercialSql({habilitado:true,repository:{transaccion:fn=>fn({q:async(q,p)=>{
      fallos.push({q,p});return{recordset:q.includes('extended_properties')?[{modelo:q.includes('HostFlowAuthResiliencia')?'authcom-resiliencia-v1':'authcom-ingreso-v1'}]:q.includes('SELECT Id,Intentos')?[{Id:retry,Intentos:1}]:[],rowsAffected:[1]};}})}});
    assert.equal((await puerto.transaccion(tx=>tx.registrarFalloIngreso({id:retry,lease:leaseRetry,codigo:'TRANSITORIO'}))).estado,'reintento-programado');
    await ejecutar(`INSERT authcom.Ingresos(Id,CreadaEn,ExpiraEn,Sobre,Estado,Intentos,Lease,LeaseHasta) VALUES('${retry}',SYSUTCDATETIME(),DATEADD(minute,15,SYSUTCDATETIME()),N'{}','pendiente',1,'${leaseRetry}',DATEADD(minute,2,SYSUTCDATETIME()));
      DECLARE @id uniqueidentifier='${retry}',@lease uniqueidentifier='${leaseRetry}',@intentos int=1,@codigo varchar(24)='TRANSITORIO',@estado varchar(12)='reintento',@segundos int=60;
      BEGIN TRANSACTION;${fallos.filter(c=>!c.q.includes('extended_properties')).map(c=>c.q).join('\n')}COMMIT;
      IF NOT EXISTS(SELECT 1 FROM authcom.IngresoFallos WHERE Id=@id AND Estado='reintento' AND Proxima>SYSUTCDATETIME()) OR NOT EXISTS(SELECT 1 FROM authcom.Ingresos WHERE Id=@id AND Lease IS NULL AND Sobre IS NOT NULL) THROW 51915,'Backoff/lease incoherentes.',1;`);
  });
  await t.test('SQL exacto de finalización conserva evidencia y excluye entregas en cuarentena',async()=>{
    const fuente=fs.readFileSync(path.join(__dirname,'../../src/repositories/AutenticacionComercialSql.js'),'utf8');
    const finalizar=fuente.match(/const r = await this\.q\(`(UPDATE authcom.Outbox SET Estado=@estado[\s\S]+?)`,\s*\{/)[1];
    const cte=fuente.match(/const r = await this\.q\(`(;WITH siguiente[\s\S]+?)`, \{ lease \}\);/)[1];
    const entrega=randomUUID(),lease=randomUUID();
    await ejecutar(`INSERT authcom.Outbox(Id,ExpiraEn,Sobre,Estado,Proxima,Intentos,Lease,LeaseHasta,PrimerIntentoEn)
      VALUES('${entrega}',DATEADD(day,1,SYSUTCDATETIME()),N'{}','procesando',SYSUTCDATETIME(),3,'${lease}',DATEADD(minute,2,SYSUTCDATETIME()),SYSUTCDATETIME());
      DECLARE @id uniqueidentifier='${entrega}',@lease uniqueidentifier='${lease}',@exito bit=0,@estado varchar(16)='fallida',@segundos int=300,@cuarentena bit=0,@codigo varchar(32)='RESULTADO_INCIERTO';${finalizar}
      IF NOT EXISTS(SELECT 1 FROM authcom.Outbox WHERE Id=@id AND EnCuarentena=1 AND Sobre IS NOT NULL AND CodigoFallo='RESULTADO_INCIERTO') THROW 51902,'Evidencia no conservada.',1;`);
    const r=await ejecutar(`DECLARE @lease uniqueidentifier=NEWID();${cte}`);assert.ok(!r.toLowerCase().includes(entrega));
    await ejecutar(propuesta('07_mantenimiento_bloqueado.sql'));
    await ejecutar(`IF NOT EXISTS(SELECT 1 FROM authcom.Outbox WHERE Id='${entrega}' AND Sobre IS NOT NULL) THROW 51903,'Mantenimiento borró cuarentena.',1;`);
    const incierta=randomUUID();
    await ejecutar(`INSERT authcom.Outbox(Id,ExpiraEn,Sobre,Estado,Proxima,Intentos,PrimerIntentoEn,CodigoFallo)
      VALUES('${incierta}',DATEADD(minute,-1,SYSUTCDATETIME()),N'{}','fallida',SYSUTCDATETIME(),1,DATEADD(minute,-2,SYSUTCDATETIME()),'RESULTADO_INCIERTO');`);
    await ejecutar(propuesta('07_mantenimiento_bloqueado.sql'));
    await ejecutar(`IF NOT EXISTS(SELECT 1 FROM authcom.Outbox WHERE Id='${incierta}' AND Sobre IS NOT NULL) THROW 51910,'Se perdió resultado incierto vencido.',1;`);
  });
  await t.test('perfiles HTTP/cuentas acotados: ingreso no crea usuarios y cuentas no cambia roles',async()=>{
    const nombre='hf_authcom_'+runId.replaceAll('-','');
    await ejecutar(`SET XACT_ABORT OFF;BEGIN TRY BEGIN TRANSACTION;
      CREATE USER [${nombre}] WITHOUT LOGIN;
      GRANT INSERT ON OBJECT::authcom.Ingresos TO [${nombre}];
      GRANT SELECT,INSERT,UPDATE ON OBJECT::authcom.Cuotas TO [${nombre}];
      GRANT VIEW DEFINITION ON SCHEMA::authcom TO [${nombre}];
      EXECUTE AS USER=N'${nombre}';
      INSERT authcom.Ingresos(Id,CreadaEn,ExpiraEn,Sobre,Estado) VALUES(NEWID(),SYSUTCDATETIME(),DATEADD(minute,15,SYSUTCDATETIME()),N'{}','pendiente');
      IF HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','INSERT')<>0 THROW 51904,'Privilegio excesivo.',1;
      DECLARE @denegado bit=0;BEGIN TRY INSERT dbo.Usuarios(Nombre,Email,PasswordHash,IdRol) VALUES(N'No crear',N'no@example.invalid',REPLICATE('x',60),3);END TRY BEGIN CATCH IF ERROR_NUMBER()=229 SET @denegado=1;ELSE THROW;END CATCH;
      REVERT;IF @denegado<>1 THROW 51905,'No hubo denegación esperada.',1;
      ROLLBACK;END TRY BEGIN CATCH IF USER_NAME()=N'${nombre}' REVERT;IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'${nombre}') THROW 51906,'Principal temporal residual.',1;`);
    const cuentas=nombre+'_cuentas';
    await ejecutar(`SET XACT_ABORT OFF;BEGIN TRY BEGIN TRANSACTION;CREATE USER [${cuentas}] WITHOUT LOGIN;
      GRANT SELECT,INSERT ON OBJECT::dbo.Usuarios TO [${cuentas}];GRANT SELECT ON OBJECT::dbo.Roles TO [${cuentas}];
      GRANT UPDATE ON OBJECT::dbo.Usuarios(PasswordHash,DebeCambiarPassword,VersionSesion,FechaCambioPassword,FechaActualizacion,IdUsuarioActualizacion) TO [${cuentas}];
      EXECUTE AS USER=N'${cuentas}';
      INSERT dbo.Usuarios(Nombre,Email,PasswordHash,IdRol) VALUES(N'Cuenta local descartable',N'cuenta@example.invalid',REPLICATE('x',60),3);DECLARE @id int=CONVERT(int,SCOPE_IDENTITY());
      UPDATE dbo.Usuarios SET PasswordHash=REPLICATE('y',60),DebeCambiarPassword=0,VersionSesion=VersionSesion+1,FechaCambioPassword=SYSUTCDATETIME(),FechaActualizacion=SYSUTCDATETIME(),IdUsuarioActualizacion=@id WHERE IdUsuario=@id;
      IF (SELECT VersionSesion FROM dbo.Usuarios WHERE IdUsuario=@id)<>2 OR (SELECT DATALENGTH(PasswordHash) FROM dbo.Usuarios WHERE IdUsuario=@id)<>60 THROW 51916,'Contrato de actualización mínimo incompleto.',1;
      DECLARE @denegado bit=0;BEGIN TRY UPDATE dbo.Usuarios SET IdRol=1 WHERE IdUsuario=@id;END TRY BEGIN CATCH IF ERROR_NUMBER() IN (229,230) SET @denegado=1;ELSE THROW;END CATCH;
      REVERT;IF @denegado<>1 THROW 51917,'Cuentas puede escalar roles.',1;
      ROLLBACK;END TRY BEGIN CATCH IF USER_NAME()=N'${cuentas}' REVERT;IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'${cuentas}') THROW 51918,'Principal residual.',1;`);
  });
  await t.test('perfil de correo reserva con SQL real sin permiso de alterar usuarios',async()=>{
    const nombre='hf_authcom_'+runId.replaceAll('-','')+'_correo',entrega=randomUUID();
    const fuente=fs.readFileSync(path.join(__dirname,'../../src/repositories/AutenticacionComercialSql.js'),'utf8');
    const cte=fuente.match(/const r = await this\.q\(`(;WITH siguiente[\s\S]+?)`, \{ lease \}\);/)[1];
    const r=await ejecutar(`SET XACT_ABORT OFF;BEGIN TRY BEGIN TRANSACTION;
      INSERT authcom.Outbox(Id,ExpiraEn,Sobre,Estado,Proxima) VALUES('${entrega}',DATEADD(day,1,SYSUTCDATETIME()),N'{}','pendiente',SYSUTCDATETIME());
      CREATE USER [${nombre}] WITHOUT LOGIN;
      GRANT SELECT,UPDATE ON OBJECT::authcom.Outbox TO [${nombre}];GRANT SELECT ON OBJECT::authcom.Desafios TO [${nombre}];
      GRANT SELECT,INSERT,UPDATE ON OBJECT::authcom.Cuotas TO [${nombre}];GRANT VIEW DEFINITION ON SCHEMA::authcom TO [${nombre}];
      EXECUTE AS USER=N'${nombre}';
      DECLARE @r int,@lease uniqueidentifier=NEWID();EXEC @r=sys.sp_getapplock @Resource=N'HostFlow:Seguridad:AdministradoresActivos',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000,@DbPrincipal='public';
      IF @r NOT IN (0,1) THROW 51907,'Bloqueo no disponible para perfil mínimo.',1;
      ${cte}
      DECLARE @denegado bit=0;BEGIN TRY UPDATE dbo.Usuarios SET VersionSesion=VersionSesion+1 WHERE IdUsuario=-1;END TRY BEGIN CATCH IF ERROR_NUMBER()=229 SET @denegado=1;ELSE THROW;END CATCH;
      REVERT;IF @denegado<>1 THROW 51908,'Correo obtuvo privilegio de cuentas.',1;
      ROLLBACK;END TRY BEGIN CATCH IF USER_NAME()=N'${nombre}' REVERT;IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'${nombre}') THROW 51909,'Principal residual.',1;`);
    assert.ok(r.toLowerCase().includes(entrega));
  });
  await t.test('worker ingreso puede releer cuenta verificada sin permiso para leer PasswordHash',async()=>{
    let consulta;
    const {AutenticacionComercialSql}=require('../../src/repositories/AutenticacionComercialSql');
    class Transaction{async begin(){}async commit(){}async rollback(){}}
    class Request{input(){return this;}async query(q){
      if(q.includes('SELECT DB_NAME'))return{recordset:[{base:'Test',servidor:'local',modelo:'authcom-v1'}]};
      if(q.includes('sp_getapplock'))return{recordset:[{resultado:0}]};consulta=q;return{recordset:[]};}}
    const repo=new AutenticacionComercialSql({pool:{},driver:{Transaction,Request,ISOLATION_LEVEL:{SERIALIZABLE:1}},baseEsperada:'Test',servidorEsperado:'local',idEmpresa:1,habilitado:true,perfil:'worker-ingreso'});
    await repo.transaccion(tx=>tx.usuario(-1));assert.ok(!consulta.includes('u.PasswordHash'));
    const nombre='hf_authcom_'+runId.replaceAll('-','')+'_worker';
    await ejecutar(`SET XACT_ABORT OFF;BEGIN TRY BEGIN TRANSACTION;CREATE USER [${nombre}] WITHOUT LOGIN;
      GRANT SELECT ON OBJECT::dbo.Usuarios(IdUsuario,Nombre,Email,IdRol,Estado,DebeCambiarPassword,VersionSesion,VersionRegistro) TO [${nombre}];
      GRANT SELECT ON OBJECT::dbo.Roles TO [${nombre}];GRANT SELECT ON OBJECT::authcom.Contactos TO [${nombre}];
      EXECUTE AS USER=N'${nombre}';DECLARE @id int=-1;${consulta}
      DECLARE @denegado bit=0;BEGIN TRY SELECT PasswordHash FROM dbo.Usuarios WHERE IdUsuario=-1;END TRY BEGIN CATCH IF ERROR_NUMBER() IN (229,230) SET @denegado=1;ELSE THROW;END CATCH;
      REVERT;IF @denegado<>1 THROW 51911,'Worker puede leer credenciales.',1;
      ROLLBACK;END TRY BEGIN CATCH IF USER_NAME()=N'${nombre}' REVERT;IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;`);
  });
}));
