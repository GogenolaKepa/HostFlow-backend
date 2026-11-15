const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const {abrirConexionSql,POLITICA}=require(path.join(base,'src/security/comercial/ConexionSqlResiliente'));
const {abrirPoolsComerciales,PERFILES}=require(path.join(base,'src/services/PoolsComercialesPreparados'));
function fixture({errores=[],fallarCierre=false,fallarConsulta=false,tiempoConexion=0}={}){
 const pools=[],eventos=[],esperas=[];let reloj=0;
 class ConnectionPool extends EventEmitter{
  constructor(config){super();this.config=config;this.n=pools.length;pools.push(this);}
  async connect(){eventos.push('conectar');const c=new EventEmitter();this.config.beforeConnect(c);reloj+=tiempoConexion;
   const n=errores[this.n];if(n!==undefined){if(n!==null)c.emit('errorMessage',{number:n,state:1,class:20,message:'SECRETO_PRIVADO'});throw Object.assign(Error('SECRETO_PRIVADO'),{code:'ELOGIN'});}this.connected=true;return this;}
  request(){return{query:async()=>{eventos.push('consulta');if(fallarConsulta)throw Object.assign(Error('PRIVADO_CONSULTA'),{code:'EREQUEST',number:40613});return{recordset:[{base:'HostFlow',servidor:'hostflow',motor:5,principal:this.config.user}]};}};}
  async close(){eventos.push('cerrar');this.cierres=(this.cierres||0)+1;if(fallarCierre)throw Error('PRIVADO_CIERRE');this.connected=false;}
 }
 const driver={ConnectionPool},config={server:'hostflow.database.windows.net',database:'HostFlow',port:1433,user:'FICTICIO',password:'SECRETO_FICTICIO',options:{encrypt:true,trustServerCertificate:false},pool:{min:0,max:2},connectionTimeout:30000,requestTimeout:30000};
 const puertos={ahora:()=>reloj,esperar:async ms=>{esperas.push(ms);eventos.push('esperar');reloj+=ms;},azar:()=>0};
 return{driver,config,pools,eventos,esperas,puertos,ejecutar:extra=>abrirConexionSql({driver,config,perfil:'ingresoHttp',...puertos,...extra})};
}
test('40613 se recupera con pool nuevo tras cerrar y esperar; cuatro perfiles pasan sin repetir SELECT',async()=>{
 const f=fixture({errores:[40613]});const ids=Object.fromEntries(PERFILES.map(p=>[p,{tipo:'sql',principal:'hf_'+p}]));
 const r=await abrirPoolsComerciales({habilitado:true,driver:f.driver,identidades:ids,obtenerCredencial:async({principal})=>({user:principal,password:'FICTICIO'}),conectar:o=>abrirConexionSql({...o,...f.puertos})});
 assert.equal(f.pools.length,5);assert.deepEqual(f.esperas,[5000]);assert.deepEqual(f.eventos.slice(0,4),['conectar','cerrar','esperar','conectar']);assert.equal(f.eventos.filter(x=>x==='consulta').length,4);
 assert.ok(r.consultar().pools.every(p=>p.conectado));assert.equal(r.consultar().pools[0].conexion.intentos,2);await r.cerrar();assert.ok(f.pools.every(p=>p.cierres===1));
});
test('máximo cinco intentos y esperas progresivas, sin reintentos ocultos del driver',async()=>{
 const f=fixture({errores:Array(5).fill(40613)});await assert.rejects(f.ejecutar(),e=>e.conexionSQL.intentos===5&&e.conexionSQL.agotado&&e.conexionSQL.poolsCerrados&&!JSON.stringify(e).includes('SECRETO'));
 assert.deepEqual(f.esperas,[5000,10000,20000,30000]);assert.ok(f.pools.every(p=>p.cierres===1&&p.config.options.maxRetriesOnTransientErrors===0));
});
test('18456,4060 y ELOGIN sin número detienen sin espera ni rotación',async()=>{
 for(const n of [18456,4060,null]){const f=fixture({errores:[n]});await assert.rejects(f.ejecutar(),e=>e.conexionSQL.intentos===1);assert.equal(f.pools.length,1);assert.equal(f.esperas.length,0);}
});
test('un error definitivo posterior al transitorio detiene sin nuevos intentos',async()=>{
 const f=fixture({errores:[40613,18456]});await assert.rejects(f.ejecutar(),e=>e.conexionSQL.numeroSQL===18456);assert.equal(f.pools.length,2);assert.deepEqual(f.esperas,[5000]);
});
test('fallo de cierre bloquea todo reintento aunque el error sea transitorio',async()=>{
 const f=fixture({errores:[40613],fallarCierre:true});await assert.rejects(f.ejecutar(),e=>e.codigo==='CIERRE_INCOMPLETO'&&e.conexionSQL.poolsCerrados===false);assert.equal(f.pools.length,1);assert.equal(f.esperas.length,0);
});
test('presupuesto total impide esperar o conectar fuera de plazo',async()=>{
 const f=fixture({errores:[40613]});await assert.rejects(f.ejecutar({hasta:4000}),e=>e.conexionSQL.agotado);assert.equal(f.pools.length,1);assert.equal(f.pools[0].config.connectionTimeout,4000);assert.equal(f.esperas.length,0);
 const g=fixture();await assert.rejects(g.ejecutar({hasta:50}),e=>e.conexionSQL.intentos===0);assert.equal(g.pools.length,0);
});
test('cancelar durante la espera no abre otro pool',async()=>{
 const f=fixture({errores:[40613]}),c=new AbortController();await assert.rejects(f.ejecutar({signal:c.signal,esperar:async()=>{c.abort();}}),e=>e.conexionSQL.cancelado);assert.equal(f.pools.length,1);assert.equal(f.pools[0].cierres,1);
});
test('jitter se añade sin bajar la espera mínima y queda acotado',async()=>{
 const f=fixture({errores:[40613]});const r=await f.ejecutar({azar:()=>0.5});assert.deepEqual(f.esperas,[5500]);await r.pool.close();assert.equal(POLITICA.presupuestoMs,180000);
});
test('fallo de SELECT de identidad NO reabre conexión ni repite la consulta',async()=>{
 const f=fixture({fallarConsulta:true}),ids=Object.fromEntries(PERFILES.map(p=>[p,{tipo:'sql',principal:'hf_'+p}]));await assert.rejects(abrirPoolsComerciales({habilitado:true,driver:f.driver,identidades:ids,obtenerCredencial:async({principal})=>({user:principal,password:'FICTICIO'})}));assert.equal(f.pools.length,1);assert.equal(f.eventos.filter(x=>x==='consulta').length,1);assert.equal(f.pools[0].cierres,1);
});
test('el helper no envuelve ni repite una operación posterior de escritura',async()=>{
 const f=fixture({fallarConsulta:true}),r=await f.ejecutar();await assert.rejects(r.pool.request().query('UPDATE DATOS_FICTICIOS'));assert.equal(f.pools.length,1);assert.equal(f.eventos.filter(x=>x==='consulta').length,1);await r.pool.close();
});
test('TLS no estricto se rechaza antes de construir el pool',async()=>{
 const f=fixture();f.config.options.trustServerCertificate=true;await assert.rejects(f.ejecutar());assert.equal(f.pools.length,0);
});
test('cada código transitorio explícito permite solo reconectar, sin consultas del helper',async()=>{
 for(const numero of [40197,40501,10928,10929]){const f=fixture({errores:[numero]}),r=await f.ejecutar();assert.equal(f.pools.length,2);assert.deepEqual(f.esperas,[5000]);assert.equal(f.eventos.includes('consulta'),false);await r.pool.close();}
});
test('un cierre que no responde vence el presupuesto y bloquea el siguiente intento',async()=>{
 const f=fixture({errores:[40613]});f.driver.ConnectionPool.prototype.close=()=>new Promise(()=>{});await assert.rejects(f.ejecutar({hasta:150}),e=>e.codigo==='CIERRE_INCOMPLETO'&&e.conexionSQL.poolsCerrados===false);assert.equal(f.pools.length,1);assert.equal(f.esperas.length,0);
});
test('close sincrónico fallido no impide intentar cerrar los otros tres perfiles',async()=>{
 const f=fixture(),ids=Object.fromEntries(PERFILES.map(p=>[p,{tipo:'sql',principal:'hf_'+p}]));const r=await abrirPoolsComerciales({habilitado:true,driver:f.driver,identidades:ids,obtenerCredencial:async({principal})=>({user:principal,password:'FICTICIO'})});
 f.pools[0].close=()=>{throw Error('PRIVADO');};await assert.rejects(r.cerrar(),e=>e.codigo==='CIERRE_INCOMPLETO');assert.ok(f.pools.slice(1).every(p=>p.cierres===1));
});
test('cancelación previa no consulta credenciales ni crea pools de otros perfiles',async()=>{
 const f=fixture(),signal=AbortSignal.abort(),ids=Object.fromEntries(PERFILES.map(p=>[p,{tipo:'sql',principal:'hf_'+p}]));
 await assert.rejects(abrirPoolsComerciales({habilitado:true,driver:f.driver,identidades:ids,signal,obtenerCredencial:()=>assert.fail('No leer credenciales tras cancelar')}));assert.equal(f.pools.length,0);
});
test('serverless: cuatro respuestas 40613 permiten acreditar en el quinto intento a los65segundos',async()=>{
 const f=fixture({errores:[40613,40613,40613,40613]}),r=await f.ejecutar();assert.equal(r.diagnostico.intentos,5);assert.deepEqual(f.esperas,[5000,10000,20000,30000]);assert.equal(f.esperas.reduce((a,b)=>a+b),65000);assert.equal(f.pools.length,5);assert.ok(f.pools.slice(0,4).every(p=>p.cierres===1));await r.pool.close();
});
test('40615 después de reanudación detiene en tres intentos sin agotar tiempo ni máximo',async()=>{
 const f=fixture({errores:[40613,40613,40615]});await assert.rejects(f.ejecutar(),e=>{const d=e.conexionSQL;assert.equal(d.intentos,3);assert.equal(d.agotado,false);assert.equal(d.motivoFin,'ERROR_NO_REINTENTABLE');assert.equal(d.transcurridoMs,15000);assert.deepEqual(d.historial.map(x=>x.numeroSQL),[40613,40613,40615]);return true;});assert.deepEqual(f.esperas,[5000,10000]);assert.equal(f.pools.length,3);assert.ok(f.pools.every(p=>p.cierres===1));
});
test('40615 inicial no se reintenta y el historial no expone mensajes',async()=>{
 const f=fixture({errores:[40615]});await assert.rejects(f.ejecutar(),e=>e.conexionSQL.intentos===1&&e.conexionSQL.agotado===false&&!JSON.stringify(e).includes('SECRETO'));assert.equal(f.esperas.length,0);
});
