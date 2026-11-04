const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter,once}=require('node:events');
const {configuracionHttp}=require('../src/config/httpSeguridad'),autenticacion=require('../src/config/autenticacion');
function cargar({cli=false,puertoOcupado=false,httpDiferido=false,falloComercial=false}={}){
 const orden=[],p=new EventEmitter(),s=new EventEmitter(),logs=[];let drenar;
 p.env={NODE_ENV:'production',HOST:'127.0.0.1',PORT:'4000',HOSTFLOW_AUTH_SOURCE:'sql',HOSTFLOW_EMPRESA_ID:'1',JWT_SECRET:'SOLO-FICTICIO-'.repeat(4),HOSTFLOW_PUBLICACION:'cloudflare',HOSTFLOW_PUBLICACION_CONFIRMADA:'1',HOSTFLOW_CORS_ORIGINS:'https://hostflow.com.ar',HOSTFLOW_CONFIGURACION_READ_ONLY:'1',HOSTFLOW_MONEDAS_WRITE_ENABLED:'0',HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED:'0',HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED:'0',HOSTFLOW_AUTH_COMERCIAL_ENABLED:'0'};
 const producto={estado:'inactivo',montaje:null,desactivar(){orden.push('desactivar');},async cerrar(){orden.push('comercial');if(falloComercial)throw Error('FICTICIO-PRIVADO');},iniciarWorker(){assert.fail('No iniciar workers automáticamente');}};
 const pool={async close(){orden.push('principal');}};
 s.listening=false;s.close=cb=>{orden.push('http');s.listening=false;drenar=()=>cb();if(!httpDiferido)drenar();};
 const modulo={exports:{}},requireFalso=nombre=>{
  if(nombre==='dotenv')return{config(){}};
  if(nombre==='node:events')return{once};
  if(nombre==='./config/autenticacion')return{origenAutenticacion:()=>autenticacion.origenAutenticacion(p.env),secretoJWTValido:v=>autenticacion.secretoJWTValido(v,p.env)};
  if(nombre==='./config/httpSeguridad')return{configuracionHttp:()=>configuracionHttp(p.env)};
  if(nombre==='./config/database')return{poolPromise:Promise.resolve(pool)};
  if(nombre==='./services/AuthService')return{async comprobarPreparacionSQL(){orden.push('preparacion-simulada');}};
  if(nombre==='./services/ProductoComercial')return{async prepararProductoComercial(o){assert.equal(o.aprobacion,undefined);return producto;}};
  if(nombre==='./middlewares/autenticacion')return()=>{};
  if(nombre==='./app')return{crearApp:()=>({locals:{},listen(port,host,cb){assert.equal(host,'127.0.0.1');assert.equal(port,'4000');queueMicrotask(()=>{if(puertoOcupado)s.emit('error',Error('DETALLE-FICTICIO-PRIVADO'));else{s.listening=true;cb();s.emit('listening');}});return s;}})};
  throw Error('Dependencia no autorizada del laboratorio.');
 };
 requireFalso.main=cli?modulo:null;
 const codigo=fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');
 vm.runInNewContext('(function(require,module,exports,process,console){'+codigo+'\n})',{queueMicrotask})(requireFalso,modulo,modulo.exports,p,{log:m=>logs.push(m),error:m=>logs.push(m)});
 return{p,s,orden,logs,iniciar:modulo.exports.iniciar,drenar:()=>drenar()};
}
test('servidor espera listening y su cierre drena HTTP antes de ambos grupos SQL, sin worker',async()=>{
 const e=cargar({httpDiferido:true}),s=await e.iniciar();assert.equal(s.listening,true);
 const cierre=s.cerrarHostFlow();await Promise.resolve();assert.deepEqual(e.orden,['preparacion-simulada','desactivar','http']);
 e.drenar();await cierre;await s.cerrarHostFlow();assert.deepEqual(e.orden,['preparacion-simulada','desactivar','http','comercial','principal']);
});
test('fallo comercial aún cierra el pool principal y no revela detalles; cierre no se acredita',async()=>{
 const e=cargar({falloComercial:true}),s=await e.iniciar();await assert.rejects(s.cerrarHostFlow(),/Cierre SQL no acreditado/);assert.equal(e.orden.at(-1),'principal');
});
test('puerto ocupado no devuelve host disponible y cierra las conexiones simuladas',async()=>{
 const e=cargar({puertoOcupado:true});await assert.rejects(e.iniciar(),/HostFlow no pudo abrir el puerto/);assert.equal(e.orden.filter(x=>x==='principal').length,1);assert.equal(e.orden.filter(x=>x==='comercial').length,1);
});
test('CLI existente instala Ctrl+C y cierra sin arrancar producto comercial ni workers',async()=>{
 const e=cargar({cli:true});for(let n=0;n<20&&!e.p.listenerCount('SIGINT');n++)await Promise.resolve();assert.equal(e.p.listenerCount('SIGINT'),1);
 e.p.emit('SIGINT');await e.s.cerrarHostFlow();assert.equal(e.orden.filter(x=>x==='principal').length,1);assert.equal(e.s.listening,false);assert.ok(!JSON.stringify(e.logs).includes('PRIVADO'));
});
