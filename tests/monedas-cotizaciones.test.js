const {test}=require('node:test');const assert=require('node:assert/strict');
const {CotizacionService,URL_BCRA,FUENTES}=require('../src/services/CotizacionService');
const respuesta=(valor=1500)=>({ok:true,text:async()=>JSON.stringify({status:200,results:[{fecha:'2026-10-16',detalle:[{codigoMoneda:'USD',tipoCotizacion:valor}]}]})});
test('BCRA: URL oficial fija, TLS normal, cache y una llamada concurrente; no inventa hora',async()=>{
 let llamadas=0,ahora=new Date('2026-10-17T15:00:00Z');
 const s=new CotizacionService({reloj:()=>ahora,fetcher:async(url,op)=>{assert.equal(url,URL_BCRA);assert.equal(op.redirect,'error');llamadas++;await new Promise(r=>setTimeout(r,5));return respuesta();}});
 const [a,b]=await Promise.all([s.consultar(),s.consultar()]);assert.equal(llamadas,1);assert.equal(a.id,b.id);assert.equal(a.horaPublicacion,null);assert.equal(a.fecha,'2026-10-16');
 assert.equal((await s.consultar()).cache,true);assert.equal(llamadas,1);assert.equal(s.vigente(a.id).valor,'1500.00000000');
 ahora=new Date('2026-10-17T15:06:00Z');assert.throws(()=>s.vigente(a.id));await s.consultar();assert.equal(llamadas,2);
 assert.equal(FUENTES.find(f=>f.id==='BNA').disponible,true);assert.equal(FUENTES.find(f=>f.id==='BNA').persistible,false);
});
test('BCRA: errores/incompletos/no USD/futuro rechazan, sin reemplazo ni bucle de reintento',async()=>{
 for(const fetcher of [async()=>{throw Error('Red ficticia');},async()=>({ok:false}),async()=>({ok:true,text:async()=>JSON.stringify({status:200,results:[]})}),async()=>respuesta(-1),async()=>respuesta(NaN)]){
  let llamadas=0;const s=new CotizacionService({reloj:()=>new Date('2026-10-17T15:00:00Z'),fetcher:async(...a)=>{llamadas++;return fetcher(...a);}});
  await assert.rejects(s.consultar());assert.equal(llamadas,1);assert.equal(s.cache,null);
 }
});
test('BCRA: conserva el decimal JSON exacto y rechaza fecha futura o moneda ausente',async()=>{
 const json=valor=>({ok:true,text:async()=>valor});
 const crear=fetcher=>new CotizacionService({reloj:()=>new Date('2026-10-17T15:00:00Z'),fetcher});
 const s=crear(async()=>json('{"status":200,"results":[{"fecha":"2026-10-16","detalle":[{"codigoMoneda":"USD","tipoCotizacion":1234567890.12345678}]}]}'));
 assert.equal((await s.consultar()).valor,'1234567890.12345678');
 for(const dato of [
  {status:200,results:[{fecha:'2026-10-18',detalle:[{codigoMoneda:'USD',tipoCotizacion:1000}]}]},
  {status:200,results:[{fecha:'2026-10-16',detalle:[{codigoMoneda:'EUR',tipoCotizacion:1000}]}]}
 ])await assert.rejects(crear(async()=>json(JSON.stringify(dato))).consultar());
});
