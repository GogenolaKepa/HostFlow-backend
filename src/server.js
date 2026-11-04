require("dotenv").config();
const {once}=require('node:events');
// Validar configuracion antes de abrir cualquier conexion.
require("./config/autenticacion").origenAutenticacion();
require("./config/httpSeguridad").configuracionHttp();
if (process.env.NODE_ENV === "production" && !require("./config/autenticacion").secretoJWTValido(process.env.JWT_SECRET)) {
  throw new Error("Producción requiere un secreto JWT privado de al menos 32 bytes.");
}

const {
  poolPromise,
} = require(
  "./config/database"
);

const { crearApp } = require(
  "./app"
);

const PORT =
  process.env.PORT ||
  4000;

const HOST =
  process.env.HOST ||
  "0.0.0.0";

const AuthService = require("./services/AuthService");

async function iniciar({ comercial } = {}) {
  // SQL nunca se habilita si faltan esquema, permisos, roles o primer Admin.
  await AuthService.comprobarPreparacionSQL();
  const {prepararProductoComercial}=require('./services/ProductoComercial');
  const producto=await prepararProductoComercial({...comercial,env:process.env,
    autenticar:require('./middlewares/autenticacion')});
  const app=crearApp({montajeComercial:producto.montaje,
    proxiesComerciales:producto.proxiesComerciales||[]});
  // El supervisor requiere un arranque explícito posterior del host acreditado.
  // No se inicia por npm run dev ni por una bandera de entorno.
  app.locals.comercial=producto;
  const servidor = app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `Servidor HostFlow ejecutándose en el puerto ${PORT}`
    );

    console.log(
      `Acceso local: http://localhost:${PORT}`
    );
  }
);
  servidor.comercial=producto;
  let cierre;
  servidor.cerrarHostFlow=()=>cierre??=(async()=>{
    producto.desactivar();
    if(servidor.listening)await new Promise((resolve,reject)=>servidor.close(error=>error?reject(Error('Cierre HTTP no acreditado.')):resolve()));
    let fallo=false;
    try{await producto.cerrar();}catch{fallo=true;}
    try{await(await poolPromise).close();}catch{fallo=true;}
    if(fallo)throw Error('Cierre SQL no acreditado; inspección necesaria.');
  })();
  servidor.on('error',()=>{servidor.cerrarHostFlow().catch(()=>console.error('Cierre del host pendiente de inspección.'));});
  // No anunciar un host disponible ni iniciar el worker antes de escuchar.
  try{if(!servidor.listening)await once(servidor,'listening');}
  catch{try{await servidor.cerrarHostFlow();}catch{}throw Error('HostFlow no pudo abrir el puerto; cierre pendiente de verificar.');}
  return servidor;
}

if (require.main === module) iniciar().then(servidor=>{
  const cerrar=()=>{servidor.cerrarHostFlow().then(()=>console.log('HostFlow cerrado; conexiones finalizadas.')).catch(()=>{console.error('Cierre no acreditado; inspección necesaria.');process.exitCode=1;});};
  process.once('SIGINT',cerrar);process.once('SIGTERM',cerrar);
}).catch(async () => {
  console.error("No se inició HostFlow: revisar la preparación de autenticación SQL.");
  try { (await poolPromise).close(); } catch { /* Sin detalles de conexión. */ }
  process.exitCode = 1;
});
module.exports={iniciar};
