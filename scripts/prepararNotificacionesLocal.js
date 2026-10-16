// Generador OFFLINE: fs/path/crypto solamente. No ejecuta SQL ni abre conexiones.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function preparar(){
  const dir=path.join(root,'backend/sql/proposals'),azure=fs.readFileSync(path.join(dir,'notificaciones/01_modelo_bloqueado.sql'),'utf8');
  const inicio=azure.indexOf('-- Las FK requieren claves reales'),fin=azure.indexOf('SET XACT_ABORT ON;');
  if(inicio<0||fin<inicio||!azure.includes("SERVERPROPERTY('EngineEdition')),0)<>5"))throw Error('DDL de origen no reconocido. Revisar manualmente.');
  const guardas=fs.readFileSync(path.join(dir,'notificaciones_local/guardas_locales.sql'),'utf8');
  const padres=`IF (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0
 AND major_id IN(OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Empresas')) AND name=N'HostFlowFixture'
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'notifications-v2-parent'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'notifications-v2-parent'))<>2
 THROW 51947,'Padres no acreditados como fixtures locales.',1;`;
  const cuerpo=azure.slice(inicio);
  const copia=`-- COPIA EXCLUSIVAMENTE LOCAL generada offline. Revisar antes de habilitar.
-- No sustituye el script de Azure; nunca ejecutar esta copia en Azure.
DECLARE @AplicarLocal bit=0;
IF ISNULL(@AplicarLocal,0)<>1 THROW 51943,'DDL local no autorizado.',1;
${guardas}
${padres}
IF OBJECT_ID(N'dbo.Notificaciones') IS NOT NULL OR OBJECT_ID(N'dbo.NotificacionDestinatarios') IS NOT NULL
 OR OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario') IS NOT NULL OR OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa') IS NOT NULL
 THROW 51944,'Objetos preexistentes: no repetir ni reemplazar.',1;
${cuerpo}`;
  const verificacion=fs.readFileSync(path.join(dir,'notificaciones/03_verificacion_solo_lectura.sql'),'utf8');
  const vInicio=verificacion.indexOf("IF OBJECT_ID(N'dbo.Notificaciones',N'U') IS NULL");
  if(vInicio<0)throw Error('Verificacion de origen no reconocida.');
  const destino=path.join(root,'revision/correcciones-sql-v2/local');fs.mkdirSync(destino,{recursive:true});
  fs.copyFileSync(path.join(dir,'notificaciones_local/00_crear_base_bloqueado.sql'),path.join(destino,'00_crear_base_bloqueado.sql'));
  fs.writeFileSync(path.join(destino,'02_modelo_local_bloqueado.sql'),copia);
  fs.writeFileSync(path.join(destino,'03_verificacion_local_solo_lectura.sql'),`-- SOLO LOCAL. Revision estructural, sin datos.
${guardas}
${padres}
${verificacion.slice(vInicio)}`);
  const fixture=`-- CREAR PADRES FICTICIOS, no copia tablas/cuentas/datos reales.
DECLARE @CrearFixture bit=0;
IF ISNULL(@CrearFixture,0)<>1 THROW 51945,'Fixture local no autorizado.',1;
${guardas}
IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0) THROW 51946,'El fixture exige base vacia marcada.',1;
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 CREATE TABLE dbo.Usuarios(IdUsuario int NOT NULL CONSTRAINT PK_FixtureUsuarios PRIMARY KEY);
 CREATE TABLE dbo.Empresas(IdEmpresa int NOT NULL CONSTRAINT PK_FixtureEmpresas PRIMARY KEY);
 INSERT dbo.Usuarios(IdUsuario) VALUES(1),(2);
 INSERT dbo.Empresas(IdEmpresa) VALUES(1),(2);
 EXEC sys.sp_addextendedproperty @name=N'HostFlowFixture',@value=N'notifications-v2-parent',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'Usuarios';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowFixture',@value=N'notifications-v2-parent',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'Empresas';
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
`;
  fs.writeFileSync(path.join(destino,'01_fixture_padres_bloqueado.sql'),fixture);
  fs.writeFileSync(path.join(destino,'04_pruebas_motor_bloqueadas.sql'),`DECLARE @ProbarLocal bit=0;
IF ISNULL(@ProbarLocal,0)<>1 THROW 51948,'Pruebas locales no autorizadas.',1;
${guardas}
${padres}
${require('./lib/casosNotificacionesLocal').casos()}`);
  const hash=s=>createHash('sha256').update(s).digest('hex');
  const archivos=fs.readdirSync(destino).filter(n=>n.endsWith('.sql')).map(archivo=>({archivo,sha256:hash(fs.readFileSync(path.join(destino,archivo)))}));
  fs.writeFileSync(path.join(destino,'huellas.json'),JSON.stringify({origenAzure:hash(azure),cuerpoDDL:hash(cuerpo),copiaLocal:hash(copia),verificacionAzure:hash(verificacion),guardasLocales:hash(guardas),archivos,estado:'GENERADO OFFLINE, NO EJECUTADO'},null,2)+'\n');
  return {cuerpo,copia,destino};
}
if(require.main===module){
  if(process.argv.length!==3||process.argv[2]!=='--preparar')throw Error('Uso offline: node scripts/prepararNotificacionesLocal.js --preparar');
  preparar();console.log('Copias locales bloqueadas listas en revision/correcciones-sql-v2/local. No se ejecuto SQL.');
}
module.exports={preparar};
