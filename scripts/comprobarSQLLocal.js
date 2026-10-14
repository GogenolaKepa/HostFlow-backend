// SOLO SELECT de metadatos. No dotenv, repositorios operativos ni fixtures.
const { configuracionSQLAislada, METADATOS_CONEXION, validarConexion } = require("../tests/integration/sqlAislado");

async function comprobarSQLLocal({ driver, args = process.argv.slice(2) } = {}) {
  if (args.length !== 1 || args[0] !== "--read-only") throw new Error("Utilice exclusivamente --read-only.");
  driver ||= require("mssql/msnodesqlv8");
  const config = configuracionSQLAislada({ HOSTFLOW_SQL_TEST_AUTH: "windows", HOSTFLOW_SQL_TEST_SERVER: "localhost" }, { lectura: true });
  const pool = new driver.ConnectionPool(config);
  try {
    await pool.connect();
    const { recordset } = await pool.request().query(METADATOS_CONEXION);
    const instancia = validarConexion(recordset[0], "master");
    const { recordset: capacidad } = await pool.request().query(`SELECT
      IS_SRVROLEMEMBER('sysadmin') AS sysadmin,
      HAS_PERMS_BY_NAME(NULL,NULL,'CREATE ANY DATABASE') AS puedeCrearBase,
      CASE WHEN DB_ID(N'HostFlow_Test_Seguridad') IS NULL THEN 0 ELSE 1 END AS existeBasePruebas;`);
    return { ...instancia, ...capacidad[0] };
  } finally { await pool.close(); }
}

if (require.main === module) {
  comprobarSQLLocal().then(result => console.log(JSON.stringify(result, null, 2))).catch(() => {
    console.error("No se completó la comprobación SQL LOCAL de solo lectura; no se imprimieron detalles de conexión.");
    process.exitCode = 1;
  });
}
module.exports = { comprobarSQLLocal };
