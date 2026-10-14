const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { configuracionSQLAislada, migracionParaPruebas, validarConexion, validarTablas, BASE } = require("./integration/sqlAislado");

test("runner SQL no puede usar Azure, HostFlow real ni habilitarse por accidente", () => {
  const config = { HOSTFLOW_SQL_TEST_ENABLED: "1", HOSTFLOW_SQL_TEST_WRITE_APPROVED: "YES_LOCAL_DISPOSABLE",
    HOSTFLOW_SQL_TEST_AUTH: "windows", HOSTFLOW_SQL_TEST_SERVER: "localhost", HOSTFLOW_SQL_TEST_DATABASE: BASE };
  assert.equal(configuracionSQLAislada(config).database, "HostFlow_Test_Seguridad");
  for (const cambio of [{ HOSTFLOW_SQL_TEST_WRITE_APPROVED: undefined }, { HOSTFLOW_SQL_TEST_DATABASE: "HostFlow" }, { HOSTFLOW_SQL_TEST_SERVER: "server.database.windows.net" }, { HOSTFLOW_SQL_TEST_ENABLED: "0" }]) assert.throws(() => configuracionSQLAislada({ ...config, ...cambio }));
});
test("destino y tablas inciertas siempre fallan de forma cerrada", () => {
  assert.throws(() => validarConexion({ base: "HostFlow", motor: 5 }, BASE));
  const runId = randomUUID();
  assert.throws(() => validarTablas([{ esquema: "dbo", tabla: "Roles", propietario: null, id: 1 }], { runId }));
  assert.throws(() => validarTablas([{ esquema: "dbo", tabla: "Roles", propietario: runId, id: 1 }], { runId, vacia: true }));
  assert.deepEqual(validarTablas([], { runId, vacia: true }), []);
});
test("migracion original sigue bloqueada y el runner solo habilita una copia en memoria", () => {
  const file = require("node:path").join(__dirname,"../sql/proposals/seguridad_etapas_3_4/01_modelo_roles_usuarios.sql");
  const original = fs.readFileSync(file,"utf8");
  assert.match(original,/DECLARE @ModeloAprobado bit = 0;/); assert.match(original,/DECLARE @EscrituraAutorizada bit = 0;/);
  assert.match(migracionParaPruebas(BASE, randomUUID()),/DECLARE @BaseEsperada sysname = N'HostFlow_Test_Seguridad';/);
  assert.equal(fs.readFileSync(file,"utf8"),original);
  assert.throws(() => migracionParaPruebas("HostFlow"));
  const codigo = original.replace(/\/\*[\s\S]*?\*\//g,"").replace(/--[^\r\n]*/g,"");
  assert.deepEqual([...codigo.matchAll(/CREATE\s+TABLE\s+([\w.]+)/gi)].map(m=>m[1]),["dbo.Usuarios"]);
  assert.doesNotMatch(codigo,/\b(INSERT|UPDATE|DELETE|MERGE|GRANT|ALTER|DROP|TRUNCATE)\b/i);
});
