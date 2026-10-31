const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const base=require('./sqlAislado');
const {guardas,propuesta,marcar}=require('./sqlComercialAislado');
const sqlcmd='C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/180/Tools/Binn/SQLCMD.EXE';
test('SQLCMD real: DDL authcom, consumo concurrente, rollback y limpieza local',{
  skip:process.env.HOSTFLOW_AUTHCOM_SQL_TEST!=='1'||!fs.existsSync(sqlcmd),timeout:90000,
},async t=>{
  base.exigirEscritura({HOSTFLOW_SQL_TEST_ENABLED:'1',HOSTFLOW_SQL_TEST_WRITE_APPROVED:process.env.HOSTFLOW_SQL_TEST_WRITE_APPROVED});
  const runId=randomUUID(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'hf-authcom-sqlcmd-'));let validado=false;
  async function ejecutar(sql){
    const archivo=path.join(temp,randomUUID()+'.sql');fs.writeFileSync(archivo,guardas(runId)+sql,'utf8');
    try{return await new Promise((resolve,reject)=>{
      const p=spawn(sqlcmd,['-S','lpc:localhost','-E','-C','-d',base.BASE,'-b','-l','3','-t','30','-f','65001','-i',archivo],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      let salida='';p.stdout.on('data',b=>{salida+=String(b);});p.stderr.on('data',()=>{});
      p.once('error',()=>reject(Error('SQLCMD no pudo iniciarse.')));
      p.once('exit',codigo=>{if(codigo===0)resolve(salida);else{const errores=[...salida.matchAll(/Msg (\d+)/g)].map(m=>Number(m[1]));reject(Object.assign(Error('SQL local falló; no se exponen datos ni SQL de la consulta.'),{codigosSQL:errores}));}});
    });}finally{fs.rmSync(archivo,{force:true});}
  }
  try{
    await ejecutar("IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0) OR SCHEMA_ID(N'authcom') IS NOT NULL THROW 51885,'Base no vacía: detener.',1;");validado=true;
    await ejecutar(base.fixtureRoles(runId));await ejecutar(base.migracionParaPruebas(base.BASE,runId));
    await ejecutar(`SET XACT_ABORT ON;BEGIN TRANSACTION;CREATE TABLE dbo.Empresas(IdEmpresa int IDENTITY PRIMARY KEY,Activo bit NOT NULL DEFAULT 1);${marcar('dbo.Empresas',runId)} INSERT dbo.Empresas DEFAULT VALUES;COMMIT;`);
    await t.test('propuestas 01/04/06/08 compilan y producen siete tablas y restricciones confiables',async()=>{
      for(const n of ['01_modelo_bloqueado.sql','04_ingreso_bloqueado.sql','06_ventana_correo_bloqueada.sql','08_resiliencia_bloqueada.sql'])await ejecutar(propuesta(n,runId));
      await ejecutar("IF (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID(N'authcom'))<>7 THROW 51886,'Cantidad incorrecta.',1; IF EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id IN (SELECT object_id FROM sys.tables WHERE schema_id=SCHEMA_ID(N'authcom')) AND (is_disabled=1 OR is_not_trusted=1)) THROW 51887,'Restricciones no confiables.',1; IF COL_LENGTH(N'authcom.Outbox',N'PrimerIntentoEn') IS NULL THROW 51888,'Falta ventana de correo.',1;");
    });
    const desafio=randomUUID();
    await ejecutar(`INSERT dbo.Usuarios(Nombre,Email,PasswordHash,IdRol) VALUES(N'Ficticio SQLCMD',N'operador@example.invalid',REPLICATE('x',60),3);
      INSERT authcom.Desafios(Id,Hash,Proposito,IdEmpresa,Email,IdUsuario,Documento,CreadaEn,ExpiraEn,Pendiente)
      VALUES('${desafio}',HASHBYTES('SHA2_256',CONVERT(varchar(36),NEWID())),'recuperacion',1,N'operador@example.invalid',1,N'{}',DATEADD(second,-5,SYSUTCDATETIME()),DATEADD(minute,15,SYSUTCDATETIME()),0);`);
    await t.test('dos conexiones compiten: un único consumo con bloqueo serializable',async()=>{
      const codigo=`SET NOCOUNT ON;SET XACT_ABORT ON;SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;BEGIN TRANSACTION;
        SELECT Id FROM authcom.Desafios WITH(UPDLOCK,HOLDLOCK) WHERE Id='${desafio}';
        UPDATE authcom.Desafios SET ConsumidaEn=SYSUTCDATETIME(),Pendiente=0 WHERE Id='${desafio}' AND ConsumidaEn IS NULL AND RevocadaEn IS NULL AND ExpiraEn>SYSUTCDATETIME();
        SELECT CONCAT('CONSUMO=',@@ROWCOUNT);COMMIT;`;
      const r=await Promise.all([ejecutar(codigo),ejecutar(codigo)]);assert.deepEqual(r.map(s=>Number(/CONSUMO=(\d)/.exec(s)[1])).sort(),[0,1]);
    });
    await t.test('rollback restaura password, sesión y consumo conjuntamente',async()=>{
      await ejecutar(`DECLARE @version int=(SELECT VersionSesion FROM dbo.Usuarios WHERE IdUsuario=1);
        BEGIN TRANSACTION;UPDATE dbo.Usuarios SET VersionSesion=VersionSesion+1,PasswordHash=REPLICATE('y',60) WHERE IdUsuario=1;
        UPDATE authcom.Desafios SET ConsumidaEn=NULL WHERE Id='${desafio}';ROLLBACK;
        IF (SELECT VersionSesion FROM dbo.Usuarios WHERE IdUsuario=1)<>@version OR (SELECT PasswordHash FROM dbo.Usuarios WHERE IdUsuario=1)<>REPLICATE('x',60) OR NOT EXISTS(SELECT 1 FROM authcom.Desafios WHERE Id='${desafio}' AND ConsumidaEn IS NOT NULL) THROW 51889,'Rollback incoherente.',1;`);
    });
    await t.test('unicidad de invitación pendiente y cuotas rechaza duplicados en el motor',async()=>{
      await ejecutar(`INSERT authcom.Desafios(Id,Hash,Proposito,IdEmpresa,Email,IdInvitador,Documento,CreadaEn,ExpiraEn,Pendiente)
        VALUES(NEWID(),HASHBYTES('SHA2_256',CONVERT(varchar(36),NEWID())),'invitacion',1,N'invitado@example.invalid',1,N'{}',SYSUTCDATETIME(),DATEADD(day,1,SYSUTCDATETIME()),1);`);
      await assert.rejects(ejecutar(`INSERT authcom.Desafios(Id,Hash,Proposito,IdEmpresa,Email,IdInvitador,Documento,CreadaEn,ExpiraEn,Pendiente)
        VALUES(NEWID(),HASHBYTES('SHA2_256',CONVERT(varchar(36),NEWID())),'invitacion',1,N'invitado@example.invalid',1,N'{}',SYSUTCDATETIME(),DATEADD(day,1,SYSUTCDATETIME()),1);`),e=>e.codigosSQL.some(n=>[2601,2627].includes(n)));
      await ejecutar("INSERT authcom.Cuotas(Proposito,Clave,Inicio,Ultima,Cuenta) VALUES('prueba','global',SYSUTCDATETIME(),SYSUTCDATETIME(),1);");
      await assert.rejects(ejecutar("INSERT authcom.Cuotas(Proposito,Clave,Inicio,Ultima,Cuenta) VALUES('prueba','global',SYSUTCDATETIME(),SYSUTCDATETIME(),1);"),e=>e.codigosSQL.some(n=>[2601,2627].includes(n)));
    });
    await t.test('SQL exacto de lease y vencimiento del adaptador: una entrega y sin reenvío fuera de ventana',async()=>{
      const fuente=fs.readFileSync(path.join(__dirname,'../../src/repositories/AutenticacionComercialSql.js'),'utf8');
      const cte=fuente.match(/const r = await this\.q\(`(;WITH siguiente[\s\S]+?)`, \{ lease \}\);/);
      const descarte=fuente.match(/await this\.q\(`(UPDATE o SET Sobre=NULL[\s\S]+?)`\);/);
      const cuarentena=fuente.match(/await this\.q\(`(UPDATE authcom.Outbox SET Estado='fallida'[\s\S]+?)`\);/);
      assert.ok(cte&&descarte&&cuarentena,'Revisar extracción al cambiar el adaptador.');
      const id=randomUUID();await ejecutar(`INSERT authcom.Outbox(Id,ExpiraEn,Sobre,Estado,Proxima) VALUES('${id}',DATEADD(day,3,SYSUTCDATETIME()),N'{}','pendiente',SYSUTCDATETIME());`);
      const tomar=()=>ejecutar(`SET XACT_ABORT ON;SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;DECLARE @lease uniqueidentifier=NEWID();BEGIN TRANSACTION;${cte[1]}COMMIT;`);
      const r=await Promise.all([tomar(),tomar()]);assert.equal(r.filter(s=>s.toLowerCase().includes(id)).length,1);
      await ejecutar(`UPDATE authcom.Outbox SET Lease=NULL,LeaseHasta=NULL,PrimerIntentoEn=DATEADD(day,-1,SYSUTCDATETIME()) WHERE Id='${id}';${cuarentena[1]}${descarte[1]}
        IF NOT EXISTS(SELECT 1 FROM authcom.Outbox WHERE Id='${id}' AND EnCuarentena=1 AND Sobre IS NOT NULL) THROW 51892,'Ventana de correo incorrecta.',1;`);
    });
    await t.test('mantenimiento acotado borra ciphertext vencido y preserva cuotas vigentes e historial',async()=>{
      await ejecutar("INSERT authcom.Ingresos(Id,CreadaEn,ExpiraEn,Sobre,Estado) VALUES(NEWID(),DATEADD(minute,-20,SYSUTCDATETIME()),DATEADD(minute,-5,SYSUTCDATETIME()),N'{}','pendiente'); INSERT authcom.Cuotas(Proposito,Clave,Inicio,Ultima,Cuenta) VALUES('antigua','global',DATEADD(day,-3,SYSUTCDATETIME()),DATEADD(day,-3,SYSUTCDATETIME()),1);");
      await ejecutar(propuesta('07_mantenimiento_bloqueado.sql',runId));
      await ejecutar("IF EXISTS(SELECT 1 FROM authcom.Ingresos WHERE Sobre IS NOT NULL) OR EXISTS(SELECT 1 FROM authcom.Cuotas WHERE Proposito='antigua') OR NOT EXISTS(SELECT 1 FROM authcom.Cuotas WHERE Proposito='prueba') OR (SELECT COUNT(*) FROM dbo.Usuarios)<>1 OR (SELECT COUNT(*) FROM authcom.Desafios)<>2 THROW 51891,'Mantenimiento fuera de alcance.',1;");
    });
  }finally{
    if(validado){
      const orden=['authcom.Outbox','authcom.Auditoria','authcom.Desafios','authcom.Contactos','authcom.Cuotas','authcom.IngresoFallos','authcom.Ingresos','dbo.Empresas','dbo.Usuarios','dbo.Roles'];
      await ejecutar(`SET XACT_ABORT ON;BEGIN TRY BEGIN TRANSACTION;${orden.map(n=>`IF OBJECT_ID(N'${n}',N'U') IS NOT NULL DROP TABLE ${n};`).join('\n')} IF SCHEMA_ID(N'authcom') IS NOT NULL EXEC(N'DROP SCHEMA authcom;');COMMIT;END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;`);
      await ejecutar("IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0) OR SCHEMA_ID(N'authcom') IS NOT NULL THROW 51890,'Limpieza pendiente.',1;");
    }
    const resolved=path.resolve(temp);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('hf-authcom-sqlcmd-'))throw Error('Temporal inválido.');fs.rmSync(resolved,{recursive:true,force:true});
  }
});
