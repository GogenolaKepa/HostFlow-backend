const sql = require("mssql");
require("dotenv").config();

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

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then((pool) => {
    console.log(
      "✅ Conexión a Azure SQL establecida correctamente."
    );

    return pool;
  })
  .catch((error) => {
    console.error(
      "❌ Error al conectar con Azure SQL:",
      error.message
    );

    throw error;
  });

module.exports = {
  sql,
  poolPromise,
};