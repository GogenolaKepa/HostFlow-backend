require("dotenv").config({ path: require("node:path").resolve(__dirname, "../.env") });
const {once}=require('node:events');
const {errorArranque,diagnostico}=require('./security/comercial/diagnosticoArranque');
// Validar configuracion antes de abrir cualquier conexion.
try{
require("./config/autenticacion").origenAutenticacion();
require("./config/httpSeguridad").configuracionHttp();
if (process.env.NODE_ENV === "production" && !require("./config/autenticacion").secretoJWTValido(process.env.JWT_SECRET)) {
  const e=new Error("Producción requiere un secreto JWT privado de al menos 32 bytes.");e.code='JWT_NO_PREPARADO';throw e;
}
}catch(error){throw errorArranque('CONFIGURACION_SERVIDOR',error);}

const {
  cerrarPool,
} = require(
  "./config/database"
);

let crearApp;
try{({crearApp}=require('./app'));}catch(error){throw errorArranque('CARGA_APP',error);}

const AuthService = require("./services/AuthService");

async function iniciar({ comercial,tlsLocal,clientes=null } = {}) {
  let producto,servidor,cierre,etapa='VALIDACION_HOST';
  const cerrar=()=>cierre??=(async()=>{
    producto?.desactivar();
    // Si no se pudo drenar HTTP, conservar SQL hasta inspección.
    if(servidor?.listening)await new Promise((resolve,reject)=>servidor.close(error=>error?reject(errorArranque('CIERRE',error)):resolve()));
    let fallo=false;
    try{await producto?.cerrar();}catch{fallo=true;}
    try{await clientes?.cerrar();}catch{fallo=true;}
    try{await cerrarPool();}catch{fallo=true;}
    if(fallo){const e=errorArranque('CIERRE');e.codigo='CIERRE_NO_ACREDITADO';throw e;}
  })();
  try{
  const HOST=process.env.HOST||'0.0.0.0',PORT=process.env.PORT||4000;
  // Política inyectada por el host Node; nunca por JWT, body o tenant del cliente.
  const politicaPiloto=comercial?.dependencias?.dependencias?.politicaPiloto??false;
  if(typeof politicaPiloto!=='boolean')throw Error('Política piloto no acreditada.');
  const politicaHabitual=comercial?.dependencias?.dependencias?.politicaHabitual??null;
  if((politicaHabitual!==null)!==(comercial?.alcancePublico==='recuperacion-habitual'))throw Error('Política operativa y borde incompatibles.');
  if(politicaHabitual!==null)require('./security/comercial/PoliticaRecuperacionHabitual').validarPoliticaHabitual(politicaHabitual);
  if(clientes!==null&&(clientes.estado!=='preparado'||typeof clientes.handler!=='function'||typeof clientes.cerrar!=='function'))throw Error('Clientes no acreditados.');
  if(tlsLocal&&(HOST!=='127.0.0.1'||!Buffer.isBuffer(tlsLocal.key)||!Buffer.isBuffer(tlsLocal.cert)))throw Error('TLS loopback no acreditado.');
  // SQL nunca se habilita si faltan esquema, permisos, roles o primer Admin.
  etapa='PREPARACION_LOGIN_SQL';await AuthService.comprobarPreparacionSQL();
  const {prepararProductoComercial}=require('./services/ProductoComercial');
  etapa='PREPARACION_COMERCIAL';producto=await prepararProductoComercial({...comercial,env:process.env,
    autenticar:require('./middlewares/autenticacion')});
  if(comercial?.aprobacion===true&&producto.estado!=='preparado'){
    const e=Error('Producto comercial no preparado.');e.code='COMERCIAL_NO_PREPARADO';e.diagnosticoArranque=producto.diagnosticoArranque;throw e;
  }
  etapa='CONSTRUIR_APP';
  const app=crearApp({montajeComercial:producto.montaje,montajeClientes:clientes?.handler||null,
    proxiesComerciales:producto.proxiesComerciales||[],politicaPiloto,alcancePublico:comercial?.alcancePublico??null,controlPublico:comercial?.controlPublico??null});
  // El supervisor requiere un arranque explícito posterior del host acreditado.
  // No se inicia por npm run dev ni por una bandera de entorno.
  app.locals.comercial=producto;
  const anunciar = () => {
    console.log(
      `Servidor HostFlow ejecutándose en el puerto ${PORT}`
    );

    console.log(
      `Acceso local: ${tlsLocal?'https':'http'}://localhost:${PORT}`
    );
  };
  etapa=tlsLocal?'CREAR_HTTPS':'ESCUCHAR_HTTP';
  servidor = tlsLocal
    ? require('node:https').createServer({...tlsLocal,minVersion:'TLSv1.2'},app)
    : require('node:http').createServer(app);
  servidor.comercial=producto;
  servidor.clientes=clientes;
  servidor.cerrarHostFlow=cerrar;
  servidor.on('error',()=>{servidor.cerrarHostFlow().catch(()=>console.error('Cierre del host pendiente de inspección.'));});
  // No anunciar un host disponible ni iniciar el worker antes de escuchar.
  etapa=tlsLocal?'ESCUCHAR_HTTPS':'ESCUCHAR_HTTP';
  servidor.listen(PORT,HOST,anunciar);
  if(!servidor.listening)await once(servidor,'listening');
  return servidor;
  }catch(error){
    let cierreFallido=false;try{await cerrar();}catch{cierreFallido=true;}
    const e=errorArranque(etapa,error);e.diagnosticoArranque=diagnostico(etapa,error);
    if(cierreFallido||error?.codigo==='CIERRE_INCOMPLETO'||error?.codigo==='CIERRE_NO_ACREDITADO')e.codigo='CIERRE_NO_ACREDITADO';
    throw e;
  }
}

if (require.main === module) iniciar().then(servidor=>{
  const cerrar=()=>{servidor.cerrarHostFlow().then(()=>console.log('HostFlow cerrado; conexiones finalizadas.')).catch(()=>{console.error('Cierre no acreditado; inspección necesaria.');process.exitCode=1;});};
  process.once('SIGINT',cerrar);process.once('SIGTERM',cerrar);
}).catch(async () => {
  console.error("No se inició HostFlow: revisar la preparación de autenticación SQL.");
  try { await cerrarPool(); } catch { console.error('Cierre SQL no acreditado; inspección necesaria.'); }
  process.exitCode = 1;
});
module.exports={iniciar};
