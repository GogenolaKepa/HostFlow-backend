const {test}=require('node:test'),assert=require('node:assert/strict');
for(const canal of ['Booking','Airbnb'])test(`${canal} simulado conserva precio y moneda declarados, sin deducir divisa legacy`,()=>{
 const servicio=require(`../src/services/${canal}PropertyService`);
 const base={idPropiedad:91,nombre:'Ficticia',tipo:'Departamento',direccion:'Ficticia 1',ciudad:'Ficticia',provincia:'Ficticia',capacidadMaxima:2,precioBase:'99.99',estado:'Activa'};
 for(const moneda of ['USD','ARS',null]){
  const p={...base,...(moneda?{monedaBase:moneda}:{})};
  const publicacion=servicio.solicitarPublicacion(p);
  const actualizacion=servicio.actualizarPublicacion(p,{canal,estadoPublicacion:'Publicada',idExterno:'ficticio-91'});
  for(const datos of [publicacion.datosEnviados,actualizacion.datosSincronizados]){
   assert.equal(datos.precioBase,'99.99');
   if(moneda)assert.equal(datos.moneda,moneda);else assert.equal(Object.hasOwn(datos,'moneda'),false);
  }
 }
});
