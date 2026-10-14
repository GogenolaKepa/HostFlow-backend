const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const { configuracionSQLAislada, migracionParaPruebas, verificarAislamiento, MARCA } = require("./integration/sqlAislado");

test("runner SQL no puede usar Azure, HostFlow real ni habilitarse por accidente", () => {
  const config = { HOSTFLOW_SQL_TEST_ENABLED: "1", HOSTFLOW_SQL_TEST_WRITE_APPROVED: "YES_LOCAL_DISPOSABLE",
    HOSTFLOW_SQL_TEST_SERVER: "localhost", HOSTFLOW_SQL_TEST_DATABASE: "HostFlow_Test_Seguridad", HOSTFLOW_SQL_TEST_USER: "fixture", HOSTFLOW_SQL_TEST_PASSWORD: randomBytes(20).toString("hex") };
  assert.equal(configuracionSQLAislada(config).database, "HostFlow_Test_Seguridad");
  for (const cambio of [{ HOSTFLOW_SQL_TEST_WRITE_APPROVED: undefined }, { HOSTFLOW_SQL_TEST_DATABASE: "HostFlow" }, { HOSTFLOW_SQL_TEST_SERVER: "server.database.windows.net" }, { HOSTFLOW_SQL_TEST_ENABLED: "0" }]) assert.throws(() => configuracionSQLAislada({ ...config, ...cambio }));
});
test("marca/destino/base vacia son obligatorios antes de escribir", async () => {
  for (const [base, marca, cantidad, motor] of [["HostFlow", MARCA, 0, 2], ["HostFlow_Test_Seguridad", "otra", 0, 2], ["HostFlow_Test_Seguridad", MARCA, 1, 2], ["HostFlow_Test_Seguridad", MARCA, 0, 5]]) {
    const pool = { request: () => ({ query: async () => ({ recordsets: [[{ base, motor }], [{ marca }], [{ cantidad }]] }) }) };
    await assert.rejects(verificarAislamiento(pool, "HostFlow_Test_Seguridad", true));
  }
  await verificarAislamiento({ request: () => ({ query: async () => ({ recordsets: [[{ base: "HostFlow_Test_Seguridad", motor: 2 }], [{ marca: MARCA }], [{ cantidad: 0 }]] }) }) }, "HostFlow_Test_Seguridad", true);
});
test("migracion original sigue bloqueada y el runner solo habilita una copia en memoria", () => {
  const file = require("node:path").join(__dirname,"../sql/proposals/seguridad_etapas_3_4/01_modelo_roles_usuarios.sql");
  const original = fs.readFileSync(file,"utf8");
  assert.match(original,/DECLARE @ModeloAprobado bit = 0;/); assert.match(original,/DECLARE @EscrituraAutorizada bit = 0;/);
  assert.match(migracionParaPruebas("HostFlow_Test_Seguridad"),/DECLARE @BaseEsperada sysname = N'HostFlow_Test_Seguridad';/);
  assert.equal(fs.readFileSync(file,"utf8"),original);
  assert.throws(() => migracionParaPruebas("HostFlow"));
  const codigo = original.replace(/\/\*[\s\S]*?\*\//g,"").replace(/--[^\r\n]*/g,"");
  assert.deepEqual([...codigo.matchAll(/CREATE\s+TABLE\s+([\w.]+)/gi)].map(m=>m[1]),["dbo.Usuarios"]);
  assert.doesNotMatch(codigo,/\b(INSERT|UPDATE|DELETE|MERGE|GRANT|ALTER|DROP|TRUNCATE)\b/i);
});
