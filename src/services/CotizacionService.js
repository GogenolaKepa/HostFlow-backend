const {createHash}=require('node:crypto');
const {cotizacionValida,fechaNegocio,decimal,unidades}=require('../domain/monedas');
const URL_BCRA='https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD';
const FUENTES=Object.freeze([
 {id:'MANUAL',nombre:'Manual',tipo:'MANUAL',disponible:true},
 {id:'BCRA',nombre:'BCRA — estadística de divisas',tipo:'BCRA_TIPO_COTIZACION',disponible:true,
  nota:'Campo tipoCotizacion de Estadísticas Cambiarias; no es compra/venta minorista ni se identifica como A3500. La API informa fecha, sin hora de publicación.'},
 {id:'BNA',nombre:'Banco Nación — venta reportada por MonedAPI',disponible:true,persistible:false,urlOficial:'https://www.bna.com.ar/Personas',
  nota:'MonedAPI es un intermediario no oficial. Consulta informativa, sin guardado ni check-in. La categoría billete/divisa no está acreditada por su contrato.'},
]);
class CotizacionService {
 constructor({fetcher=globalThis.fetch,reloj=()=>new Date(),ttl=300000}={}) {this.fetcher=fetcher;this.reloj=reloj;this.ttl=ttl;this.cache=null;this.pendiente=null;}
 async consultar() {
  const ahora=this.reloj();
  if(this.cache && ahora.getTime()-this.cache.consultadaMs<this.ttl)return {...this.cache.dato,cache:true};
  if(this.pendiente)return this.pendiente;
  this.pendiente=this.cargar(ahora).finally(()=>{this.pendiente=null;}); return this.pendiente;
 }
 async cargar(ahora) {
  const respuesta=await this.fetcher(URL_BCRA,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{Accept:'application/json'}});
  if(!respuesta.ok)throw Error('BCRA no disponible.');
  // Node actual conserva el lexema JSON del decimal: no redondear un double a ocho cifras.
  const j=JSON.parse(await respuesta.text(),(key,value,context)=>key==='tipoCotizacion'?context?.source:value);
  if(j.status!==200 || !Array.isArray(j.results) || j.results.length!==1)throw Error('Respuesta BCRA incompleta.');
  const row=j.results[0],usd=row.detalle?.filter(x=>x.codigoMoneda==='USD');
  if(usd?.length!==1 || typeof usd[0].tipoCotizacion!=='string')throw Error('Respuesta USD incompleta.');
  const dato={fuente:'BCRA',tipo:'BCRA_TIPO_COTIZACION',valor:decimal(unidades(usd[0].tipoCotizacion,8),8),
    fecha:row.fecha,horaPublicacion:null,consultadaEn:ahora.toISOString(),cache:false};
  if(!cotizacionValida(dato,fechaNegocio(ahora)))throw Error('Cotización BCRA inválida.');
  dato.id=createHash('sha256').update(JSON.stringify(dato)).digest('hex');
  this.cache={dato,consultadaMs:ahora.getTime()};return dato;
 }
 vigente(id) {if(!this.cache || this.reloj().getTime()-this.cache.consultadaMs>=this.ttl || this.cache.dato.id!==id)throw Error('La consulta oficial cambió o venció. Consultá y confirmá nuevamente.');return this.cache.dato;}
}
module.exports={CotizacionService,FUENTES,URL_BCRA};
