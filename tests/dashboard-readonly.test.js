const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const { randomBytes } = require("node:crypto");
const jwt = require("jsonwebtoken");

// Controlador, servicios, repositorios y autorizacion reales; SQL solo simulado.
const prevSecret = process.env.JWT_SECRET, prevSource = process.env.HOSTFLOW_AUTH_SOURCE;
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.HOSTFLOW_AUTH_SOURCE = "mock";
const queries = [];
const alertas = Array.from({ length: 6 }, (_, n) => ({ idAlerta: n + 1,
  titulo: `Alerta ficticia ${n + 1}`, estado: n === 0 ? "Resuelta" : "Nueva",
  datosJson: JSON.stringify({ idReservaA: 1, importe: 98765, nested: { ingresos: 98765 } }) }));
const dbPath = require.resolve("../src/config/database");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: require("mssql"), poolPromise: Promise.resolve({ request() { return {
    input() { return this; }, async query(text) {
      const code = text.replace(/'(?:[^']|'')*'|\/\*[\s\S]*?\*\/|--[^\r\n]*/g, " ");
      assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|CREATE|ALTER|DROP|TRUNCATE|INTO)\b/i, "Inicio solo puede leer SQL.");
      queries.push(text);
      if (text.includes("FROM dbo.Alertas a")) return { recordset: alertas.map(a => ({ ...a })) };
      if (text.includes("@PropiedadesActivas")) return { recordset: [{ propiedadesActivas: 1, reservasActivas: 2,
        huespedesRegistrados: 3, ingresosMes: 98765, ocupacionMensual: 20 }] };
      if (text.includes("SELECT TOP (@limite)")) return { recordset: [{ idReserva: 1, huesped: "Ficticio", montoEstimado: 98765 }] };
      throw new Error("SQL no previsto en la fixture de Inicio.");
    },
  }; } }),
} };

const { usuarios } = require("../src/data/mockData");
const operador = { idUsuario: 930001, nombre: "Operador ficticio", email: "operador@example.invalid", estado: "Activo", rol: { nombre: "Operador" } };
const admin = { ...operador, idUsuario: 930002, rol: { nombre: "Administrador" } };
usuarios.push(operador, admin);
const AlertaService = require("../src/services/AlertaService");
const originalSync = AlertaService.sincronizarAlertasOperativas;
let syncCalls = 0;
AlertaService.sincronizarAlertasOperativas = async () => { syncCalls++; throw new Error("Sincronizacion prohibida al consultar Inicio."); };
const app = require("../src/app");
let server, base;
before(async () => { server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => {
  await new Promise(r => server.close(r)); AlertaService.sincronizarAlertasOperativas = originalSync;
  usuarios.splice(usuarios.indexOf(operador), 2);
  for (const [key, value] of [["JWT_SECRET", prevSecret], ["HOSTFLOW_AUTH_SOURCE", prevSource]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const pedir = usuario => fetch(base + "/api/dashboard/resumen", { headers: usuario ? {
  Authorization: `Bearer ${jwt.sign({ idUsuario: usuario.idUsuario, email: usuario.email }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "2h" })}`,
} : {} });

test("Inicio sin token devuelve 401 antes de consultar o sincronizar", async () => {
  const beforeQueries = queries.length;
  assert.equal((await pedir()).status, 401);
  assert.equal(queries.length, beforeQueries); assert.equal(syncCalls, 0);
});

test("Inicio de Admin consulta solo SQL de lectura y conserva alertas registradas e importes", async () => {
  const response = await pedir(admin); assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.resumen.ingresosMes, 98765);
  assert.equal(data.alertas.length, 4); assert.equal(data.resumen.alertasPendientes, 4);
  assert.deepEqual(data.alertas.map(a => a.idAlerta), [2, 3, 4, 5]);
  assert.equal(data.proximasReservas[0].montoEstimado, 98765);
  assert.equal(syncCalls, 0); assert.equal(queries.length, 3);
});

test("Inicio de Operador y recarga no sincronizan ni filtran informacion economica anidada", async () => {
  for (let i = 0; i < 2; i++) {
    const response = await pedir(operador); assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.resumen.reservasActivas, 2);
    assert.equal(data.alertas[0].datos.idReservaA, 1);
    assert.equal(JSON.stringify(data).includes("98765"), false);
    assert.equal(Object.hasOwn(data.resumen, "ingresosMes"), false);
  }
  assert.equal(syncCalls, 0);
});

test("Centro de alertas conserva sincronizacion antes de leer con los mismos filtros", async () => {
  const beforeQueries = queries.length;
  let called = false;
  AlertaService.sincronizarAlertasOperativas = async () => { called = true; };
  try {
    const data = await AlertaService.obtenerAlertas({ estado: "Nueva" });
    assert.equal(called, true); assert.equal(data.length, 6);
    assert.equal(queries.length, beforeQueries + 1);
  } finally { AlertaService.sincronizarAlertasOperativas = async () => { syncCalls++; throw new Error("Sincronizacion prohibida al consultar Inicio."); }; }
});
