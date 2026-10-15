// PREPARADO, no ejecutado en esta tanda. No crea bases/usuarios/tablas/roles,
// no concede permisos, no ejecuta repositorios de negocio ni limpia objetos.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {MATRIZ,filasPerfilCompleto}=require('../../scripts/lib/permisosMinimos');
const {validarConexion,EQUIPO}=require('./sqlAislado');
const BASE='HostFlow_Test_Permisos',MARCA='hostflow-permissions-disposable-v1';

function configuracion(env={}) {
  if(env.HOSTFLOW_SQL_MINIMOS_TEST_ENABLED!=='1' || env.HOSTFLOW_SQL_MINIMOS_READ_APPROVED!=='YES_LOCAL_METADATA_AND_LOCK')throw Error('Falta autorización de la prueba SQL local de metadatos/bloqueo.');
  if(env.HOSTFLOW_SQL_TEST_USER || env.HOSTFLOW_SQL_TEST_PASSWORD)throw Error('Solo Windows integrado; no admite credenciales SQL.');
  return {server:'localhost',database:BASE,driver:'ODBC Driver 18 for SQL Server',
    options:{trustedConnection:true,encrypt:true,trustServerCertificate:true,useUTC:true},pool:{min:0,max:1},connectionTimeout:10000,requestTimeout:15000,
    beforeConnect(connection){const {build}=require('@tediousjs/connection-string');connection.conn_str=build({Driver:'ODBC Driver 18 for SQL Server',Server:'lpc:localhost',Database:BASE,Trusted_Connection:true,Encrypt:true,TrustServerCertificate:true});}};
}
const metadatos=`SELECT DB_NAME() AS base,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) AS equipo,
CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS servidor,CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName')) AS instancia,
CONVERT(int,SERVERPROPERTY('EngineEdition')) AS motor,CONVERT(nvarchar(128),SERVERPROPERTY('Edition')) AS edicion,
CONVERT(nvarchar(40),SERVERPROPERTY('ProductVersion')) AS version,CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) AS soloWindows,
CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')) AS transporte,CONVERT(nvarchar(40),CONNECTIONPROPERTY('auth_scheme')) AS autenticacion,
(SELECT CONVERT(nvarchar(100),value) FROM sys.extended_properties WHERE class=0 AND name=N'HostFlowTestIsolation') AS marca;`;
function guarda() {
  return `IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'${BASE}' OR DATALENGTH(DB_NAME())<>DATALENGTH(N'${BASE}')
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>3
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')),N'') COLLATE Latin1_General_100_BIN2<>N'${EQUIPO}'
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>N'${EQUIPO}'
 OR SERVERPROPERTY('InstanceName') IS NOT NULL
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')),N'')<>N'Shared memory'
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'HostFlowTestIsolation'
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'${MARCA}' AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'${MARCA}'))
 THROW 51700,'Aislamiento local no acreditado. No ejecutar la prueba.',1;
`;
}
test('SQL LOCAL de permisos: perfil restringido y applock, sin DCL ni filas de negocio',{
  skip:process.env.HOSTFLOW_SQL_MINIMOS_TEST_ENABLED!=='1',timeout:30000,
},async()=>{
  let pool;
  try {
    const config=configuracion(process.env),driver=require('mssql/msnodesqlv8');
    pool=await new driver.ConnectionPool(config).connect();
    const row=(await pool.request().query(metadatos)).recordset[0];
    validarConexion(row,BASE,{requiereMarca:false});assert.equal(row.marca,MARCA);
    const tablas=(await pool.request().query(guarda()+`SELECT s.name AS esquema,t.name AS tabla FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.is_ms_shipped=0;`)).recordset;
    assert.deepEqual(tablas.map(t=>`${t.esquema}.${t.tabla}`).sort(),MATRIZ.map(t=>`dbo.${t.tabla}`).sort());
    const resultado=await pool.request().batch(guarda()+`
DECLARE @Dentro bit=0,@Resultado int;
BEGIN TRY
 EXECUTE AS USER=N'hostflow_test_app_minimo'; SET @Dentro=1;
 SELECT USER_NAME() AS principal,IS_ROLEMEMBER(N'db_datareader') AS lector,IS_ROLEMEMBER(N'db_datawriter') AS escritor,IS_ROLEMEMBER(N'db_owner') AS propietario;
 SELECT v.Objeto,v.Permiso,v.Esperado,HAS_PERMS_BY_NAME(v.Objeto,'OBJECT',v.Permiso) AS efectivo FROM(VALUES ${filasPerfilCompleto()})v(Objeto,Permiso,Esperado);
 SELECT HAS_PERMS_BY_NAME(N'dbo.Roles','OBJECT','UPDATE') AS roles,
 HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','DELETE') AS usuarios,
 HAS_PERMS_BY_NAME(N'dbo.Reservas','OBJECT','DELETE') AS reservas,
 HAS_PERMS_BY_NAME(N'dbo.Empresas','OBJECT','INSERT') AS empresas,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS ddl;
 BEGIN TRANSACTION;
 EXEC @Resultado=sys.sp_getapplock @Resource=N'HostFlow:PruebaPermisosLocal',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=0,@DbPrincipal='public';
 ROLLBACK TRANSACTION;
 SELECT @Resultado AS bloqueo;
 REVERT; SET @Dentro=0;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 IF @Dentro=1 REVERT;
 THROW;
END CATCH;`);
    const [identidad,permisos,prohibidos,bloqueo]=resultado.recordsets;
    assert.deepEqual(identidad[0],{principal:'hostflow_test_app_minimo',lector:0,escritor:0,propietario:0});
    assert.equal(permisos.length,76);assert.ok(permisos.every(p=>p.efectivo===p.Esperado));
    assert.ok(Object.values(prohibidos[0]).every(p=>p===0));assert.ok([0,1].includes(bloqueo[0].bloqueo));
  } catch {throw Error('No se acreditó la prueba SQL LOCAL de permisos. Revisar preparación y guardas; no se mostraron detalles de conexión.');}
  finally {await pool?.close();}
});
module.exports={configuracion,guarda,BASE,MARCA};
