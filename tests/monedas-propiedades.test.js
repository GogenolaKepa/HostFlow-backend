const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const {prepararMonedasIntegradas}=require('./helpers/monedasIntegradasAisladas');
const h=prepararMonedasIntegradas();
const claves=['HOSTFLOW_MONEDAS_SQL_ENABLED','HOSTFLOW_MONEDAS_WRITE_ENABLED','HOSTFLOW_AUTH_SOURCE','HOSTFLOW_CONFIGURACION_ENABLED','HOSTFLOW_EMPRESA_ID','HOSTFLOW_CONFIGURACION_READ_ONLY'];
const anterior=Object.fromEntries(claves.map(k=>[k,process.env[k]]));
Object.assign(process.env,{HOSTFLOW_MONEDAS_SQL_ENABLED:'1',HOSTFLOW_MONEDAS_WRITE_ENABLED:'1',HOSTFLOW_AUTH_SOURCE:'sql',HOSTFLOW_CONFIGURACION_ENABLED:'1',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_CONFIGURACION_READ_ONLY:'0'});
const {MonedasRepository}=require('../src/repositories/MonedasRepository'),{MonedasService}=require('../src/services/MonedasService');
const propiedades=require('../src/repositories/PropiedadRepository');
const actor={idUsuario:999,versionSesion:1,rol:'Administrador'};
const service=()=>new MonedasService({repository:new MonedasRepository({getPool:async()=>h.pool,driver:h.driver}),propiedades:()=>propiedades});
const datos=()=>({propiedad:{nombre:'Ficticia USD',tipo:'Departamento',direccion:'Prueba 1',ciudad:'Prueba',provincia:'Prueba',capacidadMaxima:2},moneda:'USD',precio:'100.25',confirmar:true});
beforeEach(()=>h.reset());after(()=>{for(const [k,v]of Object.entries(anterior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});

test('Propiedad con moneda: INSERT propiedad y tarifa en la misma transacción, sin publicar canales',async()=>{
 const p=await service().crearPropiedad(actor,datos());assert.equal(p.monedaBase,'USD');assert.equal(p.precioBase,'100.25');assert.equal(p.autoridadPrecio,'TARIFA_DECLARADA');
 assert.equal(h.propiedades.get(p.idPropiedad).precioBase,'100.25');assert.equal(h.tarifas.get(p.idPropiedad).precio,'100.25');assert.equal(h.inicios,1);assert.equal(h.commits,1);h.verificarUnaConexion();
 assert.equal(h.consultas.some(q=>/INSERT INTO dbo\.(PropiedadCanales|Reservas|Huespedes)/.test(q.texto)),false);
 const insert=h.consultas.find(q=>q.texto.includes('INSERT INTO dbo.Propiedades'));assert.equal(insert.args.precioBase,'100.25');assert.match(insert.texto,/CONVERT\(decimal\(18,2\),@precioBase\)/);
});
test('Propiedad con moneda: fallo de tarifa/lectura revierte también el alta; incertidumbre sin reintento',async()=>{
 for(const fallo of ['tarifa','propiedadInsert']){h.reset();h.fallos[fallo]=Error('Fallo ficticio');await assert.rejects(service().crearPropiedad(actor,datos()));assert.equal(h.propiedades.size,2);assert.equal(h.tarifas.size,0);assert.equal(h.rollbacks,1);assert.equal(h.commits,0);}
 h.reset();h.acusePerdido=true;await assert.rejects(service().crearPropiedad(actor,datos()),e=>e.codigo==='OPERACION_RESULTADO_INCIERTO');assert.equal(h.tarifas.size,1);assert.equal(h.propiedades.size,3);assert.equal(h.commits,1);
});
test('Fuente de verdad: DTO usa tarifa original, mantiene legacy almacenado y no atribuye moneda a otras propiedades',async()=>{
 h.tarifas.set(7,{idPropiedad:7,nombre:'Ficticia',moneda:'USD',precio:'99.99',versionRegistro:Buffer.alloc(8,1)});
 const tx=h.nuevaConexion();await tx.begin();const lista=await propiedades.obtenerTodas(tx),p=await propiedades.obtenerPorId(7,tx);
 assert.equal(p.precioBase,'99.99');assert.equal(p.monedaBase,'USD');assert.equal(p.tarifaMonetaria.precio,'99.99');assert.equal(h.propiedades.get(7).precioBase,'50000.00');
 assert.equal(lista.find(x=>x.idPropiedad===9).monedaBase,null);assert.equal(lista.find(x=>x.idPropiedad===9).autoridadPrecio,'LEGACY_SIN_MONEDA');
 assert.equal(h.consultas.some(q=>/INSERT INTO|UPDATE dbo/.test(q.texto)),false);h.verificarUnaConexion();await tx.rollback();
});
test('Edición legacy no puede competir con tarifa declarada; metadatos conservan precio histórico',async()=>{
 h.tarifas.set(7,{idPropiedad:7,nombre:'Ficticia',moneda:'USD',precio:'99.99',versionRegistro:Buffer.alloc(8,1)});
 const tx=h.nuevaConexion();await tx.begin();const pedir=h.pool.request;h.pool.request=()=>tx.request();
 try {
  const datos={...h.propiedades.get(7),nombre:'Nombre revisado',precioBase:'200.00'};
  await assert.rejects(propiedades.actualizar(7,datos,1),e=>e.status===409);assert.equal(tx.propiedades.size,0);
  const p=await propiedades.actualizar(7,{...datos,preservarPrecio:true},1);assert.equal(p.nombre,'Nombre revisado');assert.equal(p.precioBase,'99.99');assert.equal(tx.propiedades.get(7).precioBase,'50000.00');
  assert.match(h.consultas.find(q=>q.texto.includes('UPDATE dbo.Propiedades')).texto,/NOT EXISTS\(SELECT 1 FROM dbo.TarifasPropiedad/);
 }finally{h.pool.request=pedir;await tx.rollback();}
});
test('Alta con moneda: inválidos/contrato abierto/esquema apagado se rechazan antes de BEGIN',async()=>{
 for(const cambio of [{moneda:'EUR'},{precio:'0'},{precio:'1.001'},{confirmar:false},{idEmpresa:2}])await assert.rejects(service().crearPropiedad(actor,{...datos(),...cambio}));
 assert.equal(h.inicios,0);process.env.HOSTFLOW_MONEDAS_SQL_ENABLED='0';try{await assert.rejects(service().crearPropiedad(actor,datos()),e=>e.codigo==='MONEDAS_PENDIENTES');assert.equal(h.inicios,0);}finally{process.env.HOSTFLOW_MONEDAS_SQL_ENABLED='1';}
});
test('Los endpoints históricos no aceptan moneda como un dato que puedan ignorar silenciosamente',async()=>{
 const servicio=require('../src/services/PropiedadService');
 for(const campo of ['moneda','monedaBase','tarifaMonetaria'])await assert.rejects(servicio.modificarPropiedad(7,{[campo]:'USD'}),e=>e.status===400&&e.codigo==='MONEDAS_ENDPOINT');
 assert.equal(h.consultas.length,0);assert.equal(h.inicios,0);
});
