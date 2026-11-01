require("dotenv").config();
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
  servidor.once('error',()=>{producto.cerrar().catch(()=>console.error('Cierre comercial pendiente de inspección.'));});
  servidor.cerrarHostFlow=async()=>{
    await producto.cerrar();
    await new Promise((resolve,reject)=>servidor.close(error=>error?reject(error):resolve()));
  };
  return servidor;
}

if (require.main === module) iniciar().catch(async () => {
  console.error("No se inició HostFlow: revisar la preparación de autenticación SQL.");
  try { (await poolPromise).close(); } catch { /* Sin detalles de conexión. */ }
  process.exitCode = 1;
});
module.exports={iniciar};
