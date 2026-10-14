const fs = require("node:fs");
const path = require("node:path");
const MARCA = "hostflow-security-disposable-v1";

function configuracionSQLAislada(env) {
  if (env.HOSTFLOW_SQL_TEST_ENABLED !== "1" || env.HOSTFLOW_SQL_TEST_WRITE_APPROVED !== "YES_LOCAL_DISPOSABLE") throw new Error("Falta autorización explícita de pruebas SQL locales.");
  if (!["127.0.0.1", "localhost", "::1"].includes(env.HOSTFLOW_SQL_TEST_SERVER)) throw new Error("Solo se admite SQL local; Azure/servidores externos prohibidos.");
  if (!/^HostFlow_Test_[A-Za-z0-9_]{1,60}$/.test(env.HOSTFLOW_SQL_TEST_DATABASE || "")) throw new Error("Se requiere una base de pruebas con nombre HostFlow_Test_…; HostFlow real está prohibido.");
  if (!env.HOSTFLOW_SQL_TEST_USER || !env.HOSTFLOW_SQL_TEST_PASSWORD) throw new Error("Falta autenticación privada de pruebas.");
  return { server: env.HOSTFLOW_SQL_TEST_SERVER, database: env.HOSTFLOW_SQL_TEST_DATABASE,
    user: env.HOSTFLOW_SQL_TEST_USER, password: env.HOSTFLOW_SQL_TEST_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
    pool: { min: 0, max: 5 }, connectionTimeout: 10000, requestTimeout: 15000 };
}

async function verificarAislamiento(pool, esperada, vacia) {
  const { recordsets } = await pool.request().query(`SELECT DB_NAME() AS base, CONVERT(int,SERVERPROPERTY('EngineEdition')) AS motor;
    SELECT CONVERT(nvarchar(100),value) AS marca FROM sys.extended_properties
      WHERE class=0 AND name=N'HostFlowTestIsolation';
    SELECT COUNT(*) AS cantidad FROM sys.tables WHERE is_ms_shipped=0;`);
  if (recordsets[0][0].base !== esperada || ![2,3,4].includes(recordsets[0][0].motor) || recordsets[1][0]?.marca !== MARCA || (vacia && recordsets[2][0].cantidad !== 0)) throw new Error("La base no acredita aislamiento local o no está vacía. No se permite escribir.");
}

function migracionParaPruebas(database) {
  if (!/^HostFlow_Test_[A-Za-z0-9_]{1,60}$/.test(database)) throw new Error("Destino de prueba inválido.");
  const propuesta = fs.readFileSync(path.join(__dirname,"../../sql/proposals/seguridad_etapas_3_4/01_modelo_roles_usuarios.sql"),"utf8");
  return propuesta.replace("DECLARE @ModeloAprobado bit = 0;", "DECLARE @ModeloAprobado bit = 1;")
    .replace("DECLARE @EscrituraAutorizada bit = 0;", "DECLARE @EscrituraAutorizada bit = 1;")
    .replace("DECLARE @BaseEsperada sysname = N'HostFlow';", `DECLARE @BaseEsperada sysname = N'${database}';`);
}
module.exports = { configuracionSQLAislada, verificarAislamiento, migracionParaPruebas, MARCA };
