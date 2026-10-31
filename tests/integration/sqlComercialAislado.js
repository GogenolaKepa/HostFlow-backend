const fs=require('node:fs'),path=require('node:path');
const base=require('./sqlAislado');
const TABLAS=['dbo.Roles','dbo.Usuarios','dbo.Empresas','authcom.Contactos','authcom.Desafios','authcom.Cuotas','authcom.Outbox','authcom.Auditoria','authcom.Ingresos','authcom.IngresoFallos'];
const nombres=TABLAS.map(n=>`ISNULL(OBJECT_ID(N'${n}',N'U'),-1)`).join(',');
function guardas(runId){
  base.validarTablas([],{runId});
  return `IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'${base.BASE}' OR DATALENGTH(DB_NAME())<>DATALENGTH(N'${base.BASE}')
    OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>N'${base.EQUIPO}'
    OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>3 OR SERVERPROPERTY('InstanceName') IS NOT NULL
    OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')),N'')<>N'Shared memory'
    OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('auth_scheme')),N'') NOT IN (N'NTLM',N'KERBEROS')
    THROW 51880,'Destino de laboratorio no acreditado.',1;
    IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'HostFlowTestIsolation' AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'${base.MARCA}') THROW 51881,'Marca local ausente.',1;
    IF EXISTS(SELECT 1 FROM sys.objects WHERE is_ms_shipped=0 AND parent_object_id=0 AND object_id NOT IN (${nombres})) THROW 51882,'Objetos ajenos: detener.',1;
    IF EXISTS(SELECT 1 FROM sys.tables t LEFT JOIN sys.extended_properties p ON p.class=1 AND p.major_id=t.object_id AND p.minor_id=0 AND p.name=N'HostFlowTestRun'
      WHERE t.is_ms_shipped=0 AND ISNULL(CONVERT(nvarchar(100),p.value),N'') COLLATE Latin1_General_100_BIN2<>N'${runId}') THROW 51883,'Tablas ajenas: no modificar.',1;
    IF SCHEMA_ID(N'authcom') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowTestRun' AND CONVERT(nvarchar(100),value)=N'${runId}') THROW 51884,'Esquema ajeno.',1;
    SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
    SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;\n`;
}
function marcar(nombre,runId){const [s,t]=nombre.split('.');if(!TABLAS.includes(nombre))throw Error('Objeto ajeno.');return `EXEC sys.sp_addextendedproperty @name=N'HostFlowTestRun',@value=N'${runId}',@level0type=N'SCHEMA',@level0name=N'${s}',@level1type=N'TABLE',@level1name=N'${t}';`;}
function propuesta(nombre,runId){
  let sql=fs.readFileSync(path.join(__dirname,'../../sql/proposals/autenticacion_comercial',nombre),'utf8');
  const cambios=[['@Aplicar bit=0','@Aplicar bit=1'],['@InventarioRevisado bit=0','@InventarioRevisado bit=1'],['@BaseEsperada sysname=NULL',`@BaseEsperada sysname=N'${base.BASE}'`],['@ServidorEsperado sysname=NULL',`@ServidorEsperado sysname=N'${base.EQUIPO}'`]];
  for(const [a,b] of cambios){if(sql.split(a).length!==2)throw Error('Cambió una guarda de la propuesta.');sql=sql.replace(a,b);}
  if(nombre.startsWith('07')){
    if(sql.split('@RetencionAprobada bit=0').length!==2)throw Error('Cambió la autorización de retención.');
    sql=sql.replace('@RetencionAprobada bit=0','@RetencionAprobada bit=1');
  }
  let marcas='';
  if(nombre.startsWith('01'))marcas=TABLAS.filter(n=>n.startsWith('authcom.')&&!['authcom.Ingresos','authcom.IngresoFallos'].includes(n)).map(n=>marcar(n,runId)).join('\n')+`\nEXEC sys.sp_addextendedproperty @name=N'HostFlowTestRun',@value=N'${runId}',@level0type=N'SCHEMA',@level0name=N'authcom';`;
  if(nombre.startsWith('04'))marcas=marcar('authcom.Ingresos',runId);
  if(nombre.startsWith('08'))marcas=marcar('authcom.IngresoFallos',runId);
  if(sql.split(' COMMIT;').length!==2)throw Error('Cambió la transacción de la propuesta.');
  return sql.replace(' COMMIT;',marcas+'\n COMMIT;');
}
function driverProtegido(driver,runId){
  class Request extends driver.Request {
    proteger(sql){
      if(typeof sql!=='string'||/\bUSE\b|\b(?:CREATE|ALTER|DROP)\s+DATABASE\b|\b(?:OPENROWSET|OPENQUERY|OPENDATASOURCE)\b/i.test(sql))throw Error('Operación fuera del laboratorio.');
      return guardas(runId)+sql;
    }
    query(sql){return super.query(this.proteger(sql));}
    batch(sql){return super.batch(this.proteger(sql));}
    execute(){throw Error('Procedimientos fuera del harness.');}
    bulk(){throw Error('Bulk fuera del harness.');}
  }
  return {...driver,Request};
}
async function ejecutar(pool,driver,runId,fn){
  let validado=false;
  // No se crea una base ni se toma posesión de tablas preexistentes.
  await base.verificarAislamiento(pool,{runId,vacia:true});
  if((await pool.request().query("SELECT SCHEMA_ID(N'authcom') AS id;")).recordset[0].id!==null)throw Error('Esquema preexistente: no usar.');
  validado=true;
  const protegido=driverProtegido(driver,runId);
  const request=()=>new protegido.Request(pool);
  try {
    await request().batch(base.fixtureRoles(runId));
    await request().batch(base.migracionParaPruebas(base.BASE,runId));
    await request().batch(`SET XACT_ABORT ON; BEGIN TRANSACTION; CREATE TABLE dbo.Empresas(IdEmpresa int IDENTITY PRIMARY KEY,Activo bit NOT NULL DEFAULT 1);${marcar('dbo.Empresas',runId)} INSERT dbo.Empresas DEFAULT VALUES; COMMIT;`);
    for(const n of ['01_modelo_bloqueado.sql','04_ingreso_bloqueado.sql','06_ventana_correo_bloqueada.sql','08_resiliencia_bloqueada.sql'])await request().batch(propuesta(n,runId));
    return await fn(protegido,request);
  }finally{
    if(validado){
      // Guardas de identidad y propiedad en la misma transacción de limpieza.
      const orden=['authcom.Outbox','authcom.Auditoria','authcom.Desafios','authcom.Contactos','authcom.Cuotas','authcom.IngresoFallos','authcom.Ingresos','dbo.Empresas','dbo.Usuarios','dbo.Roles'];
      await request().batch(`SET XACT_ABORT ON; BEGIN TRY BEGIN TRANSACTION;${orden.map(n=>`IF OBJECT_ID(N'${n}',N'U') IS NOT NULL DROP TABLE ${n};`).join('\n')}
        IF SCHEMA_ID(N'authcom') IS NOT NULL EXEC(N'DROP SCHEMA authcom;');COMMIT;END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;`);
      await base.verificarAislamiento(pool,{runId,vacia:true});
    }
  }
}
module.exports={ejecutar,guardas,propuesta,marcar};
