const {test}=require('node:test');const assert=require('node:assert/strict');
const {CotizacionBnaService,URL_BNA_MONEDAPI,normalizar}=require('../src/services/CotizacionBnaService');
const {cotizacionValida}=require('../src/domain/monedas');
const ahora=()=>new Date('2026-10-21T22:00:00Z');
const base={currency:'USD',origin:'BNA',name:'Dólar Banco Nación',buy:1495,sell:1545,updatedAt:'2026-10-20T11:30:54.049-03:00',lastScrapedAt:'2026-10-21T18:58:00-03:00',valueType:'money'};
const respuesta=(cambios={})=>({ok:true,headers:{get:()=> 'application/json; charset=utf-8'},text:async()=>JSON.stringify({...base,...cambios})});
test('MonedAPI realista: identifica intermediario, venta exacta y fechas distintas; no es referencia persistible',async()=>{
 const s=new CotizacionBnaService({reloj:ahora,fetcher:async(u,o)=>{assert.equal(u,URL_BNA_MONEDAPI);assert.equal(o.redirect,'error');assert.ok(o.signal);return respuesta();}});
 const q=await s.consultar();assert.equal(q.valor,'1545.00000000');assert.equal(q.fecha,'2026-10-20');assert.equal(q.valorDeFechaAnterior,true);assert.equal(q.comprobacionAntigua,false);assert.equal(q.horaPublicacion,null);assert.equal(q.categoria,'NO_ACREDITADA');assert.equal(q.intermediario,'MonedAPI');assert.equal(q.persistible,false);assert.equal(cotizacionValida(q),false);
});
test('MonedAPI: conserva ocho decimales del lexema JSON',()=>{
 const t=JSON.stringify(base).replace('"sell":1545','"sell":1234567890.12345678');assert.equal(normalizar(t,ahora()).valor,'1234567890.12345678');
});
test('MonedAPI: par, formato, importes y fechas incompatibles se rechazan',async()=>{
 for(const cambios of [{currency:'EUR'},{origin:'BCRA'},{valueType:'points'},{sell:0},{sell:-1},{sell:null},{sell:'1545'},{buy:1600},{updatedAt:null},{updatedAt:'2026-02-30T10:00:00Z'},{lastScrapedAt:'2026-10-22T00:00:00Z'},{updatedAt:'2026-10-21T19:00:00-03:00',lastScrapedAt:'2026-10-21T18:00:00-03:00'},{sell:1.123456789}]){
  const s=new CotizacionBnaService({reloj:ahora,fetcher:async()=>respuesta(cambios)});await assert.rejects(s.consultar());assert.equal(s.cache,null);
 }
});
test('MonedAPI: HTTP, HTML, JSON inválido, tamaño y timeout fallan sin sustitución ni reintentos',async()=>{
 const proveedores=[async()=>{throw Object.assign(Error('Red ficticia'),{name:'TimeoutError'});},async()=>({...respuesta(),ok:false}),async()=>({...respuesta(),headers:{get:()=> 'text/html'}}),async()=>({...respuesta(),text:async()=>'<html>error</html>'}),async()=>({...respuesta(),text:async()=> ' '.repeat(16385)})];
 for(const proveedor of proveedores){let n=0;const s=new CotizacionBnaService({reloj:ahora,fetcher:async()=>{n++;return proveedor();}});await assert.rejects(s.consultar());assert.equal(n,1);assert.equal(s.cache,null);}
});
test('MonedAPI: limita el stream recibido',async()=>{
 let cancelado=false;const s=new CotizacionBnaService({reloj:ahora,fetcher:async()=>({...respuesta(),body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(17000)}),cancel:async()=>{cancelado=true;},releaseLock(){}})}})});await assert.rejects(s.consultar());assert.equal(cancelado,true);
});
test('MonedAPI: caché, concurrencia, expiración y aviso de comprobación vieja',async()=>{
 let fecha=ahora(),n=0;const s=new CotizacionBnaService({reloj:()=>fecha,fetcher:async()=>{n++;await new Promise(r=>setTimeout(r,2));return respuesta({lastScrapedAt:'2026-10-21T18:30:00-03:00'});}});
 const [a,b]=await Promise.all([s.consultar(),s.consultar()]);assert.equal(n,1);assert.equal(a.valor,b.valor);assert.equal(a.comprobacionAntigua,true);assert.equal((await s.consultar()).cache,true);fecha=new Date('2026-10-21T22:06:00Z');await s.consultar();assert.equal(n,2);
});
test('MonedAPI: un día sin actividad conserva la fecha del valor; no lo fecha como hoy',async()=>{
 const s=new CotizacionBnaService({reloj:()=>new Date('2026-10-25T15:00:00Z'),fetcher:async()=>respuesta({updatedAt:'2026-10-23T12:00:00-03:00',lastScrapedAt:'2026-10-25T11:58:00-03:00'})});const q=await s.consultar();assert.equal(q.fecha,'2026-10-23');assert.equal(q.valorDeFechaAnterior,true);assert.equal(q.comprobacionAntigua,false);
});
