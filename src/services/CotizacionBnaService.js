const {decimal,unidades,fechaNegocio,fechaValida}=require('../domain/monedas');
const URL_BNA_MONEDAPI='https://monedapi.ar/api/v2/usd/bna';
const ISO=/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
function instante(valor){
 if(typeof valor!=='string'||!ISO.test(valor)||!fechaValida(valor.slice(0,10))||!Number.isFinite(Date.parse(valor)))throw Error('Fecha del intermediario inválida.');
 return Date.parse(valor);
}
function normalizar(texto,ahora){
 if(typeof texto!=='string'||Buffer.byteLength(texto)>16384)throw Error('Respuesta demasiado grande.');
 // Conservar el lexema decimal JSON, sin convertir dinero a punto flotante.
 const j=JSON.parse(texto,(k,v,c)=>['buy','sell'].includes(k)?(typeof v==='number'?c?.source:null):v);
 if(!j||j.currency!=='USD'||j.origin!=='BNA'||j.valueType!=='money'||typeof j.name!=='string'||!j.name.trim())throw Error('Par monetario incompatible.');
 if(typeof j.sell!=='string'||typeof j.buy!=='string'||unidades(j.sell,8)<=0n||unidades(j.buy,8)<=0n||unidades(j.buy,8)>unidades(j.sell,8))throw Error('Importes del intermediario inválidos.');
 const cambio=instante(j.updatedAt),comprobacion=instante(j.lastScrapedAt),ms=ahora.getTime();
 if(cambio>comprobacion||comprobacion>ms)throw Error('Fechas del intermediario incompatibles.');
 return {fuente:'BNA',tipo:'BNA_VENTA_MONEDAPI',intermediario:'MonedAPI',categoria:'NO_ACREDITADA',operacion:'VENTA',monedaBase:'USD',monedaDestino:'ARS',
  valor:decimal(unidades(j.sell,8),8),fecha:fechaNegocio(new Date(cambio)),updatedAt:j.updatedAt,lastScrapedAt:j.lastScrapedAt,
  consultadaEn:ahora.toISOString(),horaPublicacion:null,urlFuente:URL_BNA_MONEDAPI,urlOficial:'https://www.bna.com.ar/Personas',
  persistible:false,cache:false};
}
function presentar(dato,ahora){return {...dato,valorDeFechaAnterior:dato.fecha!==fechaNegocio(ahora),
 comprobacionAntigua:ahora.getTime()-Date.parse(dato.lastScrapedAt)>15*60000};}
class CotizacionBnaService{
 constructor({fetcher=globalThis.fetch,reloj=()=>new Date(),ttl=300000}={}){Object.assign(this,{fetcher,reloj,ttl});this.cache=null;this.pendiente=null;}
 async consultar(){
  const ahora=this.reloj();
  if(this.cache&&ahora.getTime()>=this.cache.ms&&ahora.getTime()-this.cache.ms<this.ttl)return presentar({...this.cache.dato,cache:true},ahora);
  if(this.pendiente)return this.pendiente;
  this.pendiente=this.cargar().finally(()=>{this.pendiente=null;});return this.pendiente;
 }
 async cargar(){
  const r=await this.fetcher(URL_BNA_MONEDAPI,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
  if(!r.ok||!/^application\/json(?:\s*;|$)/i.test(r.headers.get('content-type')||''))throw Error('MonedAPI no disponible.');
  let texto='';
  if(r.body?.getReader){const lector=r.body.getReader();let bytes=0;const trozos=[];try{for(;;){const parte=await lector.read();if(parte.done)break;bytes+=parte.value.byteLength;if(bytes>16384){await lector.cancel();throw Error('Respuesta demasiado grande.');}trozos.push(Buffer.from(parte.value));}texto=Buffer.concat(trozos).toString('utf8');}finally{lector.releaseLock();}}
  else texto=await r.text();
  const ahora=this.reloj(),dato=normalizar(texto,ahora);this.cache={dato,ms:ahora.getTime()};return presentar(dato,ahora);
 }
}
module.exports={CotizacionBnaService,URL_BNA_MONEDAPI,normalizar};
