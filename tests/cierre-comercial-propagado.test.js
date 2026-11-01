const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepararProductoComercial}=require('../src/services/ProductoComercial');
const env={HOSTFLOW_AUTH_COMERCIAL_ENABLED:'1',DB_SERVER:'hostflow.database.windows.net',DB_DATABASE:'HostFlow',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_AUTH_COMERCIAL_ORIGEN:'https://hostflow.example.invalid',HOSTFLOW_AUTH_COMERCIAL_REMITENTE:'seguridad@example.invalid',HOSTFLOW_AUTH_COMERCIAL_DOMINIO:'example.invalid'};
function escenario(fallaCierre){
 const creados=[];
 class ConnectionPool{
  constructor(config){this.config=config;this.numero=creados.length;this.cierres=0;creados.push(this);}
  on(){}
  async connect(){if(this.numero===1)throw Error('detalle privado ficticio');this.connected=true;}
  request(){return{query:async()=>({recordset:[{base:'HostFlow',servidor:'hostflow',motor:5,principal:this.config.user}]})};}
  async close(){this.cierres++;if(fallaCierre)throw Error('detalle privado ficticio');this.connected=false;}
 }
 return {creados,dependencias:{driver:{ConnectionPool},identidades:Object.fromEntries(['ingresoHttp','workerIngreso','cuentas','correo'].map(p=>[p,{tipo:'sql',principal:'hf_prueba_'+p}])),obtenerCredencial:async({principal})=>({user:principal,password:'valor exclusivamente ficticio'}),dependencias:{}}};
}
test('cierre fallido durante apertura parcial se propaga hasta producto, sin falso apagado',async()=>{
 const e=escenario(true),r=await prepararProductoComercial({env,aprobacion:true,autenticar:()=>{},dependencias:e.dependencias});
 assert.equal(r.estado,'cierre-pendiente');assert.equal(r.montaje,null);assert.equal(r.iniciarWorker,null);
 assert.ok(e.creados.every(p=>p.cierres===1));
 await assert.rejects(r.cerrar(),x=>x.message==='Cierre SQL pendiente de inspección.');
 assert.ok(!JSON.stringify(r).includes('privado'));
});
test('fallo SQL con cierre acreditado conserva el estado no-disponible y el apagado seguro',async()=>{
 const e=escenario(false),r=await prepararProductoComercial({env,aprobacion:true,autenticar:()=>{},dependencias:e.dependencias});
 assert.equal(r.estado,'no-disponible');assert.equal(r.montaje,null);assert.equal(r.iniciarWorker,null);await r.cerrar();assert.ok(e.creados.every(p=>p.cierres===1));
});
test('sin aprobación no abre pools ni crea credenciales aunque exista bandera comercial',async()=>{
 const e=escenario(true),r=await prepararProductoComercial({env,dependencias:e.dependencias,autenticar:()=>{}});
 assert.equal(r.estado,'inactivo');assert.equal(e.creados.length,0);await r.cerrar();
});
