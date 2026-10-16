// HERMETICAS: no importa un driver ni ejecuta SQL/DCL.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {generar}=require('../scripts/prepararPermisosNotificacionesLocal');
const dir=path.resolve(__dirname,'../sql/proposals/notificaciones_permisos_local');
const sha=s=>createHash('sha256').update(s).digest('hex');
function comprobarLexico(texto){
 let estado='codigo',nivel=0;
 for(let i=0;i<texto.length;i++){
  const c=texto[i],n=texto[i+1];
  if(estado==='comentario'){if(c==='\n')estado='codigo';continue;}
  if(estado==='cadena'){if(c==="'"){if(n==="'")i++;else estado='codigo';}continue;}
  if(c==='-'&&n==='-'){estado='comentario';i++;}
  else if(c==="'")estado='cadena';
  else if(c==='(')nivel++;
  else if(c===')'){nivel--;assert.ok(nivel>=0);}
 }
 assert.ok(['codigo','comentario'].includes(estado));assert.equal(nivel,0);
}
test('Permisos locales: propuestas reproducibles, bloqueadas y sin conexion o ejecucion automatica',()=>{
 const r=generar();
 assert.equal(fs.readFileSync(path.join(dir,'01_preparar_perfil_bloqueado.sql'),'utf8'),r.preparacion);
 assert.equal(fs.readFileSync(path.join(dir,'02_probar_permisos_bloqueado.sql'),'utf8'),r.pruebas);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'perfil-permisos-v2.json'),'utf8')),r.perfil);
 for(const [texto,flag] of [[r.preparacion,'@PrepararPerfil bit=0'],[r.pruebas,'@ProbarPermisos bit=0']]){
  comprobarLexico(texto); // No es un parser ni validacion real de T-SQL.
  assert.ok(texto.includes(flag));
  for(const guarda of ['HostFlow_Test_Notificaciones_V2','hostflow-notifications-disposable-v2',"SERVERPROPERTY('EngineEdition')),0)<>3","SERVERPROPERTY('ProductMajorVersion')),0)<>17",'Shared memory','PC-Escritorio','@@TRANCOUNT<>0','HostFlowFixture','hostflow-notificaciones-v2'])assert.ok(texto.includes(guarda));
  assert.ok(texto.indexOf('THROW 51940')<texto.indexOf('BEGIN TRANSACTION'));
 }
 const pkg=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../package.json'),'utf8'));
 for(const cmd of Object.values(pkg.scripts))assert.equal(/prepararPermisosNotificaciones|notificaciones_permisos_local/.test(cmd),false);
 const gen=fs.readFileSync(path.resolve(__dirname,'../scripts/prepararPermisosNotificacionesLocal.js'),'utf8');
 assert.equal(/require\(['"](?:mssql|dotenv|msnodesqlv8|node:child_process)/.test(gen),false);
});
test('Matriz trazable: 48 historicas intactas y siete nuevas con tres UPDATE por columna',()=>{
 const {perfil,preparacion}=generar();
 const original=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../sql/proposals/permisos_minimos/modelo-permisos.json'),'utf8'));
 assert.deepEqual(perfil.historicas,original.matriz.flatMap(r=>r.operaciones.map(permiso=>({esquema:r.esquema,tabla:r.tabla,columna:'',permiso}))));
 assert.equal(perfil.historicas.length,48);assert.equal(perfil.nuevas.length,7);assert.equal(perfil.entradasTotales,55);
 assert.deepEqual(perfil.nuevas.filter(r=>r.permiso==='UPDATE').map(r=>[r.tabla,r.columna]),[
  ['PreferenciasNotificacionUsuario','Habilitada'],['PreferenciasNotificacionUsuario','FechaActualizacion'],['NotificacionDestinatarios','FechaLectura']]);
 assert.equal((preparacion.match(/^GRANT /gm)||[]).length,7);
 assert.equal(/GRANT .* TO \[hostflow_app\]/.test(preparacion),false);
 const grants=fs.readFileSync(path.resolve(__dirname,'../sql/proposals/notificaciones/02_permisos_propuestos_solo_lectura.sql'));
 assert.equal(perfil.fuentes.grantsAzureSoloTexto,sha(grants));
 for(const texto of ['GRANT SELECT, INSERT ON OBJECT::dbo.PreferenciasNotificacionUsuario',
  'GRANT UPDATE ON OBJECT::dbo.PreferenciasNotificacionUsuario (Habilitada, FechaActualizacion)',
  'GRANT SELECT ON OBJECT::dbo.Notificaciones TO',
  'GRANT SELECT ON OBJECT::dbo.NotificacionDestinatarios TO',
  'GRANT UPDATE ON OBJECT::dbo.NotificacionDestinatarios (FechaLectura)'])assert.ok(grants.toString().includes(texto));
 assert.equal(perfil.nuevas.some(r=>r.tabla==='PoliticasNotificacionEmpresa'||r.permiso==='DELETE'),false);
});
test('Copias fieles: DDL de cuatro tablas conservado con sustitucion exclusiva del esquema',()=>{
 const {cuerpo,clonado,preparacion}=generar();
 assert.equal(clonado.replaceAll('HF_Notificaciones_PermisosV2.','dbo.').replaceAll("@level0name=N'HF_Notificaciones_PermisosV2'","@level0name=N'dbo'"),cuerpo);
 assert.equal((clonado.match(/CREATE TABLE/g)||[]).length,4);
 assert.ok(preparacion.includes('WITHOUT LOGIN'));assert.ok(preparacion.includes("@level0type=N'USER'"));
 assert.ok(preparacion.includes('Esquema/identidad preexistentes: no adoptar ni reemplazar'));
 assert.equal(/ALTER ROLE|CREATE LOGIN|DROP |\bDENY\b|\bREVOKE\b/.test(preparacion),false);
 assert.equal(/\b(?:INSERT|UPDATE|DELETE|ALTER TABLE)\s+(?:INTO\s+|FROM\s+)?(?:\[dbo\]|dbo)\./i.test(preparacion),false);
});
test('Motor preparado: batches exigen identidad restringida, solo 229/230 acreditan prohibicion',()=>{
 const {pruebas}=generar();
 assert.equal((pruebas.match(/-- POSITIVA:/g)||[]).length,8);
 assert.equal((pruebas.match(/-- NEGATIVA:/g)||[]).length,18);
 assert.ok(pruebas.includes("EXECUTE AS USER=N'HF_Notificaciones_PruebaV2'"));
 assert.ok(pruebas.includes('ERROR_NUMBER() NOT IN(229,230)'));
 assert.ok(pruebas.includes('UPDATE combinado y OUTPUT rowversion'));
 assert.ok(pruebas.includes('UPDATE lectura con JOIN/revision'));
 assert.ok(pruebas.includes('sys.fn_my_permissions'));
 assert.ok(pruebas.includes('ISNULL(HAS_PERMS_BY_NAME(Objeto'));
 for(const t of ['Usuarios','Empresas','Notificaciones','NotificacionDestinatarios','PreferenciasNotificacionUsuario','PoliticasNotificacionEmpresa'])assert.ok(pruebas.includes(`(N'dbo.${t}',0)`));
 assert.ok(pruebas.includes('exactamente siete concesiones G sin delegacion'));
 assert.ok(pruebas.includes('DECLARE @Columnas TABLE'));
 assert.ok(pruebas.includes('REVERT;'));assert.ok(pruebas.includes('ROLLBACK TRANSACTION;'));
 assert.equal(/\bCOMMIT\b|^GRANT |CREATE USER|ALTER ROLE|CREATE TABLE|\bDROP\b/m.test(pruebas),false);
});
test('Preservacion: ni DML sobre dbo ni borrados automaticos; comparacion de marcas e identity originales',()=>{
 const {pruebas,preparacion}=generar();
 assert.equal(/\b(?:INSERT|UPDATE|DELETE|ALTER TABLE)\s+(?:INTO\s+|FROM\s+)?(?:\[dbo\]|dbo)\./i.test(pruebas),false);
 assert.ok(pruebas.includes('IDENT_CURRENT(N\'dbo.Notificaciones\')'));
 assert.ok(pruebas.includes('FROM @Marcas EXCEPT'));
 assert.ok(pruebas.includes('Filas originales distintas'));
 assert.ok(pruebas.includes('Persistieron datos de prueba'));
 assert.equal(preparacion.includes('INSERT dbo.'),false);
 // Ninguna fase escribe propiedades de las tablas dbo existentes.
 assert.equal(/@level0name=N'dbo'/.test(preparacion),false);
});

test('Regresion CONNECT: solo excluye el GRANT normal de base; otros derechos y estados siguen comparandose',()=>{
 const {pruebas,perfil}=generar();
 assert.ok(pruebas.includes("AND NOT (p.class=0 AND p.major_id=0 AND p.minor_id=0\n  AND p.permission_name COLLATE Latin1_General_100_BIN2=N'CONNECT' AND p.state='G')"));
 assert.ok(pruebas.includes("WHERE e.Tabla IS NULL OR a.class IS NULL OR a.state<>'G'"));
 assert.equal(perfil.historicasConfirmadasPorUsuario+perfil.nuevasConfirmadasPorUsuario,55);
 assert.deepEqual(perfil.permisoAdicionalConocido,{clase:0,major_id:0,minor_id:0,permiso:'CONNECT',estado:'G'});
 // No se filtran todos los permisos de base ni todos los CONNECT, incluidos DENY/W.
 assert.equal(pruebas.includes('WHERE grantee_principal_id=@Principal AND class=1'),false);
 assert.equal(/AND NOT \(p\.permission_name[^\n]*CONNECT/.test(pruebas),false);
});

test('Regresion TABLE: variables escalares y TABLE se declaran en sentencias separadas, tambien dentro del batch dinamico',()=>{
 const {pruebas}=generar();
 assert.ok(pruebas.includes('DECLARE @Rev binary(8); DECLARE @Nueva TABLE(Revision binary(8));'));
 assert.equal(/DECLARE\s+@Rev\s+binary\(8\)\s*,\s*@Nueva\s+TABLE/i.test(pruebas),false);
 const codigo=fs.readFileSync(path.resolve(__dirname,'../scripts/lib/pruebasPermisosNotificacionesLocal.js'),'utf8');
 assert.ok(codigo.includes('DECLARE @Rev binary(8); DECLARE @Nueva TABLE'));
 assert.equal(codigo.includes('DECLARE @Rev binary(8),@Nueva TABLE'),false);
});
