const {leerConfiguracionComercial}=require('./ConfiguracionComercialPreparada');
const {prepararRuntimeComercial}=require('./RuntimeComercialPreparado');
const {crearMontajeComercial}=require('../routes/montajeComercialPreparado');

// Punto único de activación del producto. Un flag aislado no alcanza: el host
// debe inyectar identidades, secretos, acreditación y autorización de montaje.
// Nunca carga un módulo arbitrario indicado en env ni inicia workers al importar.
async function prepararProductoComercial({env={},aprobacion=false,dependencias,
  autenticar,proxiesComerciales=[],preparar=prepararRuntimeComercial}={}) {
  const inactivo=Object.freeze({estado:'inactivo',montaje:null,iniciarWorker:null,desactivar:()=>{},cerrar:async()=>{}});
  if(aprobacion!==true)return inactivo;
  let runtime;
  try {
    const configuracion=leerConfiguracionComercial(env);
    if(!configuracion.habilitado)return inactivo;
    if(!Array.isArray(proxiesComerciales)||proxiesComerciales.length>4||proxiesComerciales.some(ip=>!require('node:net').isIP(ip)))throw TypeError('Proxy no acreditado.');
    const proxies=Object.freeze([...proxiesComerciales]);
    if(!dependencias||typeof autenticar!=='function')throw TypeError('Falta autorización del host.');
    runtime=await preparar({...dependencias,configuracion,
      dependencias:{...dependencias.dependencias,autenticar}});
    const montaje=crearMontajeComercial({activacionAprobada:true,runtime,origen:configuracion.correo.origen});
    return Object.freeze({estado:'preparado',montaje,proxiesComerciales:proxies,iniciarWorker:()=>runtime.iniciarWorker(),
      consultar:()=>runtime.consultar(),desactivar:()=>runtime.desactivar(),cerrar:()=>runtime.cerrar()});
  }catch(error){
    let cierrePendiente=error?.codigo==='CIERRE_INCOMPLETO';
    try { await runtime?.cerrar(); } catch { cierrePendiente=true; }
    // No propagar detalles de credenciales ni inutilizar el login tradicional.
    return Object.freeze({...inactivo,estado:cierrePendiente?'cierre-pendiente':'no-disponible',
      cerrar:runtime?()=>runtime.cerrar():cierrePendiente?async()=>{throw Error('Cierre SQL pendiente de inspección.');}:inactivo.cerrar});
  }
}
module.exports={prepararProductoComercial};
