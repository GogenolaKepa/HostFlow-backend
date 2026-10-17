// Pruebas HERMÉTICAS: no conexión SQL, GRANT, roles, fixtures ni datos reales.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {MATRIZ,analizarFuente,inventariar,grants}=require('../scripts/lib/permisosMinimos');
const root=path.resolve(__dirname,'..'),carpeta=path.join(root,'sql/proposals/permisos_minimos');
const perfil=()=>new Map(MATRIZ.map(r=>[r.tabla,new Set(r.operaciones)]));
let derechos=perfil();
const consultas=[];
test('propuestas de transición resuelven collation entre catálogo y matriz sin habilitar DCL',()=>{
  for(const archivo of ['01_conceder_minimos_bloqueado.sql','02_verificar_concesiones_solo_lectura.sql','03_retirar_roles_bloqueado.sql']) {
    const s=fs.readFileSync(path.join(carpeta,archivo),'utf8');
    assert.ok(s.includes('p.permission_name COLLATE Latin1_General_100_BIN2=n.Permiso COLLATE Latin1_General_100_BIN2'));
    assert.equal(s.includes('p.permission_name=n.Permiso'),false);
  }
  const generador=fs.readFileSync(path.join(root,'scripts/prepararPermisosMinimos.js'),'utf8');
  assert.equal(generador.includes('p.permission_name=n.Permiso'),false);
});
const fila={idUsuario:1,idReserva:1,idPropiedadImagen:1,idPropiedadImagenCanal:1,
 cantidad:0,versionRegistro:Buffer.alloc(8,1),horaIngreso:'15:00',horaEgreso:'10:00',zonaHoraria:'America/Argentina/Buenos_Aires'};
class Request {
  input(){return this;}
  async query(sql) {
    const evidencias=analizarFuente(sql,'consulta-capturada.sql');
    for(const e of evidencias)if(!derechos.get(e.tabla)?.has(e.operacion))throw Object.assign(Error(`Permiso faltante: ${e.operacion} ${e.tabla}`),{code:'PERMISO_SIMULADO'});
    consultas.push(sql);
    return {recordset:[{...fila,bloqueo:0}],recordsets:Array.from({length:8},()=>[{...fila}]),rowsAffected:[1]};
  }
}
class Transaction {request(){return new Request();}async begin(){}async commit(){}async rollback(){}}
const pool={request:()=>new Request()};
const driver=new Proxy({Request,Transaction,ISOLATION_LEVEL:{READ_COMMITTED:2}}, {get:(target,k)=>target[k]||(()=>({tipo:k}))});
const idDB=require.resolve('../src/config/database');
require.cache[idDB]={id:idDB,filename:idDB,loaded:true,exports:{poolPromise:Promise.resolve(pool),sql:driver}};

test('auditoría: todas las operaciones detectadas tienen permiso y los 48 permisos tienen evidencia',()=>{
  const a=inventariar(root);
  assert.equal(MATRIZ.length,19);assert.equal(MATRIZ.reduce((n,r)=>n+r.operaciones.length,0),48);
  const modelo=JSON.parse(fs.readFileSync(path.join(carpeta,'modelo-permisos.json'),'utf8'));
  assert.deepEqual(modelo.auditoria.fuentes,a.fuentes,'Revisar cambios de código antes de reutilizar una matriz congelada.');
  assert.deepEqual(modelo.auditoria.referencias,a.referencias);
  assert.deepEqual(modelo.auditoria.llamadasSQL,a.llamadasSQL);
  assert.deepEqual(modelo.auditoria.preparados,a.preparados);
  assert.deepEqual(a.preparados.map(p=>p.tabla),['PreferenciasNotificacionUsuario','Notificaciones','NotificacionDestinatarios']);
  const politicas=require('../src/config/politicasRutas').politicas;
  assert.deepEqual(modelo.rutas.filter(r=>!r.path.startsWith('/auth/')).map(({metodo,path,permiso})=>({metodo,path,permiso})),politicas.map(({metodo,path,permiso})=>({metodo,path,permiso})),'El inventario de rutas debe incluir los contratos nuevos, aunque estén apagados.');
  for(const s of modelo.scripts)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,s.archivo))).digest('hex'),s.sha256);
});

test('política mínima: solo dos DELETE; catálogos de solo lectura; empresa sin INSERT',()=>{
  assert.deepEqual(MATRIZ.filter(r=>r.operaciones.includes('DELETE')).map(r=>r.tabla).sort(),['PropiedadImagenCanales','ReservaObservaciones']);
  for(const t of ['Roles','CanalesReserva','EstadosReserva','EstadosPropiedad'])assert.deepEqual([...perfil().get(t)],['SELECT']);
  for(const t of ['Empresas','PreferenciasOperativas'])assert.deepEqual([...perfil().get(t)],['SELECT','UPDATE']);
  assert.equal(grants().includes('ON SCHEMA::'),false);assert.equal(grants().includes('EXECUTE'),false);
});

test('scripts administrativos bloqueados: destino, ID/SID, autorización separada y transacciones',()=>{
  for(const [nombre,flag]of [['01_conceder_minimos_bloqueado.sql','Conceder'],['03_retirar_roles_bloqueado.sql','RetirarRoles'],['04_recuperacion_roles_bloqueada.sql','RecuperarRoles']]) {
    const sql=fs.readFileSync(path.join(carpeta,nombre),'utf8');
    assert.ok(sql.includes(`@${flag} bit=0`));assert.ok(sql.includes('@InspeccionAprobada bit=0'));
    for(const marca of ['@ServidorEsperado sysname=NULL','@PrincipalIdEsperado int=NULL','@SidEsperado varbinary(85)=NULL',"SERVERPROPERTY('EngineEdition')),0)<>5",'@@TRANCOUNT<>0','ROLLBACK TRANSACTION'])assert.ok(sql.includes(marca));
    assert.ok(sql.indexOf(`@${flag} bit=0`)<sql.indexOf('BEGIN TRANSACTION'));
    assert.equal(/\bDENY\s+\w+\s+ON|\bREVOKE\s+\w+\s+ON/i.test(sql),false);
  }
  const retirar=fs.readFileSync(path.join(carpeta,'03_retirar_roles_bloqueado.sql'),'utf8');
  assert.ok(retirar.includes('@PruebasLocalesAprobadas bit=0'));assert.ok(retirar.includes('@VentanaMantenimientoAutorizada bit=0'));
  assert.ok(retirar.indexOf('Faltan GRANT directos')<retirar.indexOf('ALTER ROLE'));
  assert.ok(retirar.indexOf('INSERT INTO @Universo')<retirar.indexOf('EXECUTE AS USER'));
  assert.ok(retirar.includes('IF @Suplantando=1 REVERT;'));
});

test('repositorios reales generan finalización y sincronización bajo perfil simulado sin roles amplios',async()=>{
  derechos=perfil();consultas.length=0;
  await require('../src/repositories/ReservaRepository').finalizarReservasVencidas('2026-10-15');
  await require('../src/repositories/LimpiezaRepository').sincronizar('2026-10-15','2026-11-15');
  assert.ok(consultas.some(s=>s.includes('UPDATE dbo.Reservas')));
  assert.ok(consultas.some(s=>s.includes('INSERT INTO dbo.TareasLimpieza')));
  derechos.get('Reservas').delete('UPDATE');
  await assert.rejects(require('../src/repositories/ReservaRepository').finalizarReservasVencidas('2026-10-15'),e=>e.code==='PERMISO_SIMULADO');
  derechos=perfil();
});

test('DELETE de observación/vínculo usa sus permisos; una baja de imagen solo necesita UPDATE',async()=>{
  consultas.length=0;derechos=perfil();
  const observaciones=require('../src/repositories/ReservaObservacionRepository');
  const vinculos=require('../src/repositories/PropiedadImagenCanalRepository');
  await observaciones.eliminarObservacion(1);await vinculos.eliminarVinculacion(1,'Airbnb');
  await require('../src/repositories/PropiedadImagenRepository').marcarEliminada(1);
  assert.ok(consultas.some(s=>/DELETE FROM dbo.ReservaObservaciones/.test(s)));
  assert.ok(consultas.some(s=>/DELETE pic/.test(s)));
  assert.ok(consultas.some(s=>/UPDATE dbo.PropiedadImagenes/.test(s)));
  assert.equal(consultas.some(s=>/DELETE.*dbo.PropiedadImagenes/.test(s)),false);
  derechos.get('PropiedadImagenCanales').delete('DELETE');
  await assert.rejects(vinculos.eliminarVinculacion(1,'Airbnb'),e=>e.code==='PERMISO_SIMULADO');
  derechos=perfil();
});

test('Configuración conserva UPDATE parametrizado sin conceder alta empresarial al proceso',async()=>{
  consultas.length=0;derechos=perfil();
  const {ConfiguracionRepository}=require('../src/repositories/ConfiguracionRepository');
  const repo=new ConfiguracionRepository({driver,getPool:async()=>pool});
  await repo.actualizar(1,'operativas',{horaIngreso:'16:00',horaEgreso:'09:00'},'0000000000000001',1);
  assert.ok(consultas.some(s=>s.includes('UPDATE dbo.PreferenciasOperativas')));
  assert.ok(consultas.every(s=>!s.includes('INSERT INTO dbo.Empresas')));
  derechos.get('PreferenciasOperativas').delete('UPDATE');
  await assert.rejects(repo.actualizar(1,'operativas',{horaIngreso:'16:00',horaEgreso:'09:00'},'0000000000000001',1),e=>e.code==='PERMISO_SIMULADO');
  derechos=perfil();
});
