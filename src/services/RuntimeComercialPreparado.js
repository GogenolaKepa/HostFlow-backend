const {abrirPoolsComerciales}=require('./PoolsComercialesPreparados');
const {ensamblarComercial}=require('./ConfiguracionComercialPreparada');
// Punto de ensamblado futuro. No se importa desde app/server ni inicia workers.
async function prepararRuntimeComercial({configuracion={habilitado:false},driver,identidades,obtenerCredencial,dependencias}={}){
  if(configuracion.habilitado!==true)return Object.freeze({estado:'inactivo'});
  let conexiones,integracion,cierre,activo=true;
  const cerrar=()=>{activo=false;return cierre??=(async()=>{try{await integracion?.cerrar();}finally{await conexiones?.cerrar();}})();};
  try{
    conexiones=await abrirPoolsComerciales({habilitado:true,driver,identidades,obtenerCredencial});
    integracion=await ensamblarComercial({configuracion,dependencias:{...dependencias,pools:conexiones.pools,sql:{...dependencias?.sql,driver}}});
    return Object.freeze({estado:'preparado',handler:integracion.handler,
      iniciarWorker:()=>integracion.iniciarWorker(),desactivar:()=>{activo=false;integracion.desactivar();},cerrar,
      consultar:()=>({disponible:activo,pools:conexiones.consultar(),worker:integracion.consultarWorker()})});
  }catch(error){
    try{await cerrar();}catch{throw Error('Runtime comercial detenido con cierre SQL pendiente de inspección.');}
    const salida=Error('Runtime comercial no acreditado; HTTP y workers no disponibles.');
    const d=error?.diagnostico;
    if(error?.codigo==='PERMISO_COMERCIAL_FALTANTE'&&['cuentas','ingresoHttp','workerIngreso','correo'].includes(d?.perfil)&&
      /^(authcom\.(Contactos|Desafios|Outbox|Auditoria|Ingresos|IngresoFallos|Cuotas|CrearOperadorInvitado)|dbo\.Usuarios)$/.test(d.objeto)&&
      ['SELECT','INSERT','UPDATE','EXECUTE'].includes(d.permiso)&&['denegado','no-acreditado'].includes(d.resultado)){
      salida.codigo=error.codigo;salida.diagnostico=Object.freeze({perfil:d.perfil,objeto:d.objeto,permiso:d.permiso,resultado:d.resultado});
    }
    throw salida;
  }
}
module.exports={prepararRuntimeComercial};
