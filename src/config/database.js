const sql = require("mssql");
const { abrirConexionSql } = require("../security/comercial/ConexionSqlResiliente");
require("dotenv").config({ path: require("node:path").resolve(__dirname, "../../.env") });

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: Number(process.env.DB_PORT) || 1433,

  options: {
    encrypt: true,
    trustServerCertificate: false,
  },

  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },

  connectionTimeout: 30000,
  requestTimeout: 30000,
};

let poolOperativo, errorConexion;
const poolPromise = abrirConexionSql({driver:sql,config:dbConfig,perfil:'operativo'})
  .then(({pool}) => {
    poolOperativo = pool;
    console.log(
      "✅ Conexión a Azure SQL establecida correctamente."
    );

    return pool;
  })
  .catch((error) => {
    errorConexion = error;
    // El driver puede incluir datos de la conexion en sus errores.
    console.error("No se pudo establecer la conexión SQL.");
    const seguro = new Error("La conexión SQL no está disponible.");
    if(error?.codigo==='CIERRE_INCOMPLETO')seguro.codigo=error.codigo;
    if(error?.diagnosticoArranque)seguro.diagnosticoArranque=error.diagnosticoArranque;
    throw seguro;
  });

// Conservar el pool aunque connect rechace. Esperar que termine de conectar antes
// de cerrarlo: mssql rechaza close durante una conexión pendiente.
let cierre;
function cerrarPool() {
  return cierre ??= (async () => {
    try { await poolPromise; } catch { /* La conexión fallida también se cierra. */ }
    if(errorConexion?.codigo==='CIERRE_INCOMPLETO')throw new Error("Cierre SQL no acreditado.");
    try { await poolOperativo?.close(); }
    catch { throw new Error("Cierre SQL no acreditado."); }
  })();
}

module.exports = {
  sql,
  poolPromise,
  cerrarPool,
};
