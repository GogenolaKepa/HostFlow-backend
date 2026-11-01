const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {laboratorioSqlcmd}=require('./sqlComercialCli');
test('SQL nuevo: vigencia antes de enviar, permisos correo y conservación de incertidumbre',{
  skip:process.env.HOSTFLOW_AUTHCOM_VIGENCIA_SQL_TEST!=='1',timeout:90000,
},async()=>laboratorioSqlcmd(async({ejecutar,runId})=>{
  const fuente=fs.readFileSync(path.join(__dirname,'../../src/repositories/AutenticacionComercialSql.js'),'utf8');
  const select=fuente.match(/const r=await this\.q\(`(SELECT o.Id FROM authcom.Outbox[\s\S]+?)`,\{id,lease\}\)/)[1];
  const update=fuente.match(/await this\.q\(`(UPDATE authcom.Outbox SET Sobre=NULL,Estado='descartada'[\s\S]+?)`,\{id,lease\}\)/)[1];
  const cuarentena=fuente.match(/await this\.q\(`(UPDATE authcom.Outbox SET Estado='fallida'[\s\S]+?)`\);/)[1];
  const descartar=fuente.match(/await this\.q\(`(UPDATE o SET Sobre=NULL,Estado='descartada'[\s\S]+?)`\);/)[1];
  const id=randomUUID(),lease=randomUUID(),d=randomUUID(),nombre='hf_vigencia_'+runId.replaceAll('-','').slice(0,12);
  try{
    await ejecutar(`CREATE USER [${nombre}] WITHOUT LOGIN;
      EXEC sys.sp_addextendedproperty @name=N'HostFlowTestRun',@value=N'${runId}',@level0type=N'USER',@level0name=N'${nombre}';
      GRANT SELECT,UPDATE ON OBJECT::authcom.Outbox TO [${nombre}];GRANT SELECT ON OBJECT::authcom.Desafios TO [${nombre}];
      DECLARE @Actor int;INSERT dbo.Usuarios(Nombre,Email,PasswordHash,IdRol,DebeCambiarPassword) SELECT N'Ficticio',N'ficticio@example.invalid',REPLICATE('x',60),IdRol,0 FROM dbo.Roles WHERE Nombre=N'Administrador';SET @Actor=SCOPE_IDENTITY();
      INSERT authcom.Desafios(Id,Hash,Proposito,IdEmpresa,Email,IdInvitador,Documento,CreadaEn,ExpiraEn,Pendiente)
      VALUES('${d}',HASHBYTES('SHA2_256','${d}'),'invitacion',1,N'ficticio@example.invalid',@Actor,N'{}',DATEADD(minute,-1,SYSUTCDATETIME()),DATEADD(minute,10,SYSUTCDATETIME()),1);
      INSERT authcom.Outbox(Id,DesafioId,ExpiraEn,Sobre,Estado,Proxima,Lease,LeaseHasta)
      VALUES('${id}','${d}',DATEADD(hour,1,SYSUTCDATETIME()),N'{}','procesando',SYSUTCDATETIME(),'${lease}',DATEADD(minute,2,SYSUTCDATETIME()));`);
    const consultar=(l=lease)=>ejecutar(`EXECUTE AS USER=N'${nombre}';DECLARE @id uniqueidentifier='${id}',@lease uniqueidentifier='${l}';BEGIN TRANSACTION;${select}COMMIT;REVERT;`);
    assert.match((await consultar()).toLowerCase(),new RegExp(id));
    assert.ok(!(await consultar(randomUUID())).toLowerCase().includes(id));
    await ejecutar(`UPDATE authcom.Desafios SET ExpiraEn=DATEADD(second,-1,SYSUTCDATETIME()) WHERE Id='${d}';`);
    assert.ok(!(await consultar()).toLowerCase().includes(id));
    await ejecutar(`EXECUTE AS USER=N'${nombre}';DECLARE @id uniqueidentifier='${id}',@lease uniqueidentifier='${lease}';${update}REVERT;
      IF NOT EXISTS(SELECT 1 FROM authcom.Outbox WHERE Id='${id}' AND Estado='descartada' AND Sobre IS NULL AND Lease IS NULL) THROW 51960,'Descarte no acreditado.',1;`);
    await ejecutar(`UPDATE authcom.Outbox SET Sobre=N'{}',Estado='procesando',Lease='${lease}',LeaseHasta=DATEADD(minute,2,SYSUTCDATETIME()),CodigoFallo='RESULTADO_INCIERTO' WHERE Id='${id}';
      EXECUTE AS USER=N'${nombre}';DECLARE @id uniqueidentifier='${id}',@lease uniqueidentifier='${lease}';${update}REVERT;
      IF NOT EXISTS(SELECT 1 FROM authcom.Outbox WHERE Id='${id}' AND Sobre IS NOT NULL AND CodigoFallo='RESULTADO_INCIERTO') THROW 51960,'Incertidumbre perdida.',1;`);
    await ejecutar(`UPDATE authcom.Outbox SET LeaseHasta=DATEADD(second,-1,SYSUTCDATETIME()) WHERE Id='${id}';
      EXECUTE AS USER=N'${nombre}';BEGIN TRANSACTION;${cuarentena}${descartar}COMMIT;REVERT;
      IF NOT EXISTS(SELECT 1 FROM authcom.Outbox WHERE Id='${id}' AND EnCuarentena=1 AND Sobre IS NOT NULL AND CodigoFallo='RESULTADO_INCIERTO') THROW 51960,'Reserva borró evidencia incierta.',1;`);
  }finally{
    await ejecutar(`IF USER_NAME()<>N'dbo' REVERT;IF DATABASE_PRINCIPAL_ID(N'${nombre}') IS NOT NULL BEGIN
      IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=4 AND major_id=DATABASE_PRINCIPAL_ID(N'${nombre}') AND name=N'HostFlowTestRun' AND CONVERT(nvarchar(100),value)=N'${runId}') THROW 51940,'Principal ajeno.',1;
      DROP USER [${nombre}];END;`);
  }
}));
