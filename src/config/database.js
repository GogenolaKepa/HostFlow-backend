const sql = require("mssql");
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

const poolOperativo = new sql.ConnectionPool(dbConfig);
const poolPromise = poolOperativo
  .connect()
  .then((pool) => {
    console.log(
      "✅ Conexión a Azure SQL establecida correctamente."
    );

    return pool;
  })
  .catch(() => {
    // El driver puede incluir datos de la conexion en sus errores.
    console.error("No se pudo establecer la conexión SQL.");
    throw new Error("La conexión SQL no está disponible.");
  });

// Conservar el pool aunque connect rechace. Esperar que termine de conectar antes
// de cerrarlo: mssql rechaza close durante una conexión pendiente.
let cierre;
function cerrarPool() {
  return cierre ??= (async () => {
    try { await poolPromise; } catch { /* La conexión fallida también se cierra. */ }
    try { await poolOperativo.close(); }
    catch { throw new Error("Cierre SQL no acreditado."); }
  })();
}

module.exports = {
  sql,
  poolPromise,
  cerrarPool,
};
