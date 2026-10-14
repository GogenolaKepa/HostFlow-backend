require("dotenv").config();

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
