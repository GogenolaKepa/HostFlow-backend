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

const app = require(
  "./app"
);

const PORT =
  process.env.PORT ||
  4000;

const HOST =
  process.env.HOST ||
  "0.0.0.0";

const AuthService = require("./services/AuthService");

async function iniciar() {
  // SQL nunca se habilita si faltan esquema, permisos, roles o primer Admin.
  await AuthService.comprobarPreparacionSQL();
  return app.listen(
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
}

iniciar().catch(async () => {
  console.error("No se inició HostFlow: revisar la preparación de autenticación SQL.");
  try { (await poolPromise).close(); } catch { /* Sin detalles de conexión. */ }
  process.exitCode = 1;
});
