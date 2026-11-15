// Únicamente VM, entorno y driver ficticios. No carga dotenv/.env ni SQL reales.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const archivo=path.join(__dirname,'../src/config/database.js');
function cargar({env={},conectar,cerrar}={}){
 const logs=[],archivos=[],orden=[];let config,cierres=0;
 const pool={on(){},connect(){orden.push('connect');return conectar?conectar(pool):Promise.resolve(pool);},async close(){cierres++;orden.push('close');if(cerrar)await cerrar();}};
 const proceso={env:{...env},cwd:()=>String.raw`C:\WINDOWS\System32`},modulo={exports:{}};
 const requerir=nombre=>{
  if(nombre==='node:path')return path;
  if(nombre==='../security/comercial/ConexionSqlResiliente')return require('../src/security/comercial/ConexionSqlResiliente');
  if(nombre==='mssql')return{ConnectionPool:class{constructor(c){config=c;return pool;}}};
  if(nombre==='dotenv')return{config(o){archivos.push(o.path);assert.equal(o.override,undefined);for(const [k,v]of Object.entries({DB_USER:'FICTICIO',DB_PASSWORD:'FICTICIA_NO_LOG',DB_SERVER:'sql.example.invalid',DB_DATABASE:'BaseFicticia'}))if(proceso.env[k]===undefined)proceso.env[k]=v;return{parsed:{}};}};
  throw Error('Dependencia inesperada.');
 };
 vm.runInNewContext('(function(require,module,exports,process,__dirname,console){'+fs.readFileSync(archivo,'utf8')+'\n})')(requerir,modulo,modulo.exports,proceso,path.dirname(archivo),{log:m=>logs.push(m),error:m=>logs.push(m)});
 return{...modulo.exports,logs,archivos,orden,config,cierres:()=>cierres,pool};
}
test('configuración anclada al backend desde System32, sin leer .env real',async()=>{
 const e=cargar();await e.poolPromise;
 assert.deepEqual(e.archivos,[path.resolve(__dirname,'../.env')]);assert.equal(e.config.user,'FICTICIO');assert.equal(e.config.password,'FICTICIA_NO_LOG');
 assert.equal(e.config.options.encrypt,true);assert.equal(e.config.options.trustServerCertificate,false);assert.equal(e.config.connectionTimeout,30000);
 await e.cerrarPool();assert.ok(!JSON.stringify(e.logs).includes('FICTICIA_NO_LOG'));
});
test('entorno explícito conserva prioridad; no override de dotenv',async()=>{
 const e=cargar({env:{DB_USER:'OTRO_FICTICIO',DB_PASSWORD:'OTRA_FICTICIA'}});await e.poolPromise;assert.equal(e.config.user,'OTRO_FICTICIO');assert.equal(e.config.password,'OTRA_FICTICIA');await e.cerrarPool();
});
test('close se invoca una sola vez tras rechazo de connect y no propaga detalles privados',async()=>{
 const e=cargar({conectar:()=>Promise.reject(Error('SECRETO_FICTICIO_DRIVER'))});
 await assert.rejects(e.poolPromise,x=>x.message==='La conexión SQL no está disponible.'&&x.cause===undefined);
 const a=e.cerrarPool(),b=e.cerrarPool();assert.equal(a,b);await a;assert.equal(e.cierres(),1);assert.ok(!JSON.stringify(e.logs).includes('SECRETO_FICTICIO'));
});
test('cierre espera conexión pendiente antes de close, incluso si después rechaza',async()=>{
 let rechazar;const e=cargar({conectar:()=>new Promise((_,r)=>{rechazar=r;})});const cierre=e.cerrarPool();await Promise.resolve();assert.equal(e.cierres(),0);
 rechazar(Error('FICTICIO'));await cierre;assert.deepEqual(e.orden,['connect','close']);
});
test('conexión exitosa también conserva cierre idempotente',async()=>{
 const e=cargar();assert.equal(await e.poolPromise,e.pool);await Promise.all([e.cerrarPool(),e.cerrarPool()]);assert.equal(e.cierres(),1);
});
test('fallo de close bloquea acreditación y no filtra error privado ni reintenta',async()=>{
 const e=cargar({cerrar:()=>{throw Error('SECRETO_FICTICIO_CIERRE');}});await e.poolPromise;
 const cierre=e.cerrarPool();await assert.rejects(cierre,x=>x.message==='Cierre SQL no acreditado.'&&x.cause===undefined);
 assert.equal(e.cerrarPool(),cierre);await assert.rejects(e.cerrarPool());assert.equal(e.cierres(),1);assert.ok(!JSON.stringify(e.logs).includes('SECRETO_FICTICIO'));
});
