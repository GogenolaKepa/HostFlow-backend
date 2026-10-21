const {estadoMonedas,exigirMonedas}=require('../config/monedas');
const {MonedasRepository}=require('./MonedasRepository');

// La tarifa declarada es la autoridad. PrecioBase anterior queda como archivo;
// jamás se copia a la tarifa ni se le atribuye moneda durante una lectura.
async function proyectarPrecios(propiedades,conexion) {
 if(!estadoMonedas().activado||propiedades.length===0)return propiedades;
 const {idEmpresa}=exigirMonedas();
 const repo=new MonedasRepository({request:async()=>conexion.request()});
 await repo.comprobarModelo(idEmpresa);
 const tarifas=new Map((await repo.tarifas(idEmpresa)).map(t=>[t.idPropiedad,t]));
 return propiedades.map(p=>{
  const tarifa=tarifas.get(p.idPropiedad);
  return tarifa?{...p,precioBase:tarifa.precio,monedaBase:tarifa.moneda,autoridadPrecio:'TARIFA_DECLARADA',tarifaMonetaria:tarifa}:
   {...p,monedaBase:null,autoridadPrecio:'LEGACY_SIN_MONEDA',tarifaMonetaria:null};
 });
}
module.exports={proyectarPrecios};
