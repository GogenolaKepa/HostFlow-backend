const assert = require("node:assert/strict");
const { test } = require("node:test");
const express = require("express");
const { randomBytes } = require("node:crypto");
const { PassThrough, Writable } = require("node:stream");
const { origenAutenticacion, secretoJWTValido } = require("../src/config/autenticacion");
const { configuracionHttp, permiteOrigen } = require("../src/config/httpSeguridad");
const corsSeguro = require("../src/middlewares/corsSeguro");
const limitarLogin = require("../src/middlewares/limitarLogin");
const { protegerError, registrarErrorSeguro, respuestasSeguras, manejarErrorSeguro } = require("../src/security/erroresSeguros");
const { terminalOculta } = require("../scripts/bootstrapAdministrador");

test("produccion no admite mock implicito/explicito y desarrollo conserva mock", () => {
  assert.equal(origenAutenticacion({}), "mock");
  for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "production", HOSTFLOW_AUTH_SOURCE: "mock" }]) assert.throws(() => origenAutenticacion(env));
  assert.equal(origenAutenticacion({ NODE_ENV: "production", HOSTFLOW_AUTH_SOURCE: "sql" }), "sql");
  assert.throws(() => configuracionHttp({ NODE_ENV: "production" }));
});

test("produccion exige secreto JWT privado suficiente y HTTPS en CORS", () => {
  assert.equal(secretoJWTValido(undefined, { NODE_ENV: "production" }), false);
  assert.equal(secretoJWTValido(randomBytes(8).toString("hex"), { NODE_ENV: "production" }), false);
  assert.equal(secretoJWTValido(randomBytes(32).toString("hex"), { NODE_ENV: "production" }), true);
  assert.throws(() => configuracionHttp({ NODE_ENV: "production", HOSTFLOW_CORS_ORIGINS: "http://localhost:5173" }));
});

test("CORS local conserva Vite y LAN; produccion/configuracion usan lista exacta", () => {
  const local = configuracionHttp({});
  for (const origen of [undefined, "http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:4173", "http://[::1]:5173", "http://192.168.1.2:5173"]) assert.equal(permiteOrigen(origen, local), true);
  for (const origen of ["null", "http://evil.invalid:5173", "http://localhost.evil.invalid:5173", "http://192.168.1.2:80", "https://evil.invalid"]) assert.equal(permiteOrigen(origen, local), false);
  const prod = configuracionHttp({ NODE_ENV: "production", HOSTFLOW_CORS_ORIGINS: "https://hostflow.example.invalid" });
  assert.equal(permiteOrigen("https://hostflow.example.invalid", prod), true);
  assert.equal(permiteOrigen("http://localhost:5173", prod), false);
  for (const origen of ["*", "https://user:password@example.invalid", "https://example.invalid/ruta"]) assert.throws(() => configuracionHttp({ HOSTFLOW_CORS_ORIGINS: origen }));
});

test("CORS preflight no exige JWT y un origen prohibido no ejecuta controlador", async () => {
  const app = express(); let ejecutadas = 0;
  app.use(corsSeguro(configuracionHttp({})));
  app.post("/api/auth/login", (_req, res) => { ejecutadas++; res.json({}); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
    assert.equal((await fetch(url, { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" } })).status, 204);
    assert.equal((await fetch(url, { method: "POST", headers: { Origin: "https://evil.invalid" } })).status, 403);
    assert.equal(ejecutadas, 0);
  } finally { await new Promise((r) => server.close(r)); }
});

test("limite login acota intentos antes del controlador, ignora XFF y permite reintentar", async () => {
  let instante = 100000, ejecutadas = 0;
  const app = express();
  app.post("/login", limitarLogin({ maximo: 2, ventanaMs: 1000, ahora: () => instante }), (_req, res) => { ejecutadas++; res.status(401).json({ mensaje: "Credenciales inválidas" }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/login`;
    for (let n = 0; n < 2; n++) assert.equal((await fetch(url, { method: "POST" })).status, 401);
    const bloqueada = await fetch(url, { method: "POST", headers: { "X-Forwarded-For": "192.168.2.3" } });
    assert.equal(bloqueada.status, 429); assert.equal(bloqueada.headers.get("retry-after"), "1"); assert.equal(ejecutadas, 2);
    instante += 1001;
    assert.equal((await fetch(url, { method: "POST" })).status, 401);
  } finally { await new Promise((r) => server.close(r)); }
  for (const value of ["0", "-1", "Infinity", "1001"]) assert.throws(() => configuracionHttp({ HOSTFLOW_LOGIN_MAX: value }));
});

test("limite conserva memoria acotada sin borrar bloqueos activos", () => {
  const limit = limitarLogin({ maximo: 1, ventanaMs: 1000, capacidad: 1, ahora: () => 0 });
  let llamadas = 0, status;
  const res = { set() {}, status(s) { status = s; return this; }, json() {} };
  limit({ ip: "a" }, res, () => llamadas++);
  limit({ ip: "b" }, res, () => llamadas++);
  assert.equal(status, 429); assert.equal(llamadas, 1);
});

test("errores SQL/logs no serializan secretos; mensajes de negocio seguros se conservan", () => {
  const secreto = randomBytes(32).toString("hex");
  const previo = process.env.PRUEBA_API_KEY;
  process.env.PRUEBA_API_KEY = secreto;
  const error = Object.assign(new Error(`Credencial ${secreto}`), { code: "EREQUEST" });
  const protegido = protegerError(error);
  assert.equal(protegido.message.includes(secreto), false);
  assert.equal(protegerError(new Error("La reserva presenta un conflicto.")).message, "La reserva presenta un conflicto.");
  const logger = console.error; let salida;
  console.error = (...partes) => { salida = JSON.stringify(partes); };
  try { registrarErrorSeguro("Error SQL", error); assert.equal(salida.includes(secreto), false); }
  finally { console.error = logger; if (previo === undefined) delete process.env.PRUEBA_API_KEY; else process.env.PRUEBA_API_KEY = previo; }
  let cuerpo;
  const res = { statusCode: 500, set() {}, json(data) { cuerpo = data; } };
  respuestasSeguras({}, res, () => {}); res.json({ mensaje: "Error", error: secreto });
  assert.equal(JSON.stringify(cuerpo).includes(secreto), false);
});

test("bootstrap no hace eco del resto de una contraseña pegada con varias lineas", async () => {
  const input = new PassThrough(); input.isTTY = true;
  const resto = randomBytes(16).toString("hex"); let salida = "";
  const output = new Writable({ write(chunk, _encoding, done) { salida += chunk; done(); } }); output.isTTY = true;
  const prompt = terminalOculta(input, output);
  const respuesta = prompt.preguntar("Contraseña: ", true);
  setImmediate(() => input.write(`primera-linea\n${resto}\n`));
  await respuesta; prompt.cerrar();
  assert.equal(salida.includes(resto), false);
});

test("controlador real preserva errores de negocio pero oculta fallos SQL y corrige HTTP", async () => {
  const servicePath = require.resolve("../src/services/ReservaService");
  const secreto = randomBytes(20).toString("hex");
  let fallo = Object.assign(new Error(`Driver privado ${secreto}`), { code: "EREQUEST" });
  require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true,
    exports: { obtenerReservaPorId: async () => { throw fallo; } } };
  const controller = require("../src/controllers/ReservaController");
  let cuerpo, salida;
  const res = { statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(data) { cuerpo = data; } };
  respuestasSeguras({}, res, () => {});
  const logger = console.error; console.error = (...parts) => { salida = JSON.stringify(parts); };
  try {
    await controller.obtenerReservaPorId({ params: { id: "1" } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.stringify(cuerpo).includes(secreto), false);
    assert.equal(salida.includes(secreto), false);
    fallo = new Error("La reserva no existe."); res.statusCode = 200;
    await controller.obtenerReservaPorId({ params: { id: "1" } }, res);
    assert.equal(res.statusCode, 404); assert.equal(cuerpo.mensaje, fallo.message);
  } finally { console.error = logger; }
});

test("ultimo manejador devuelve JSON generico sin stack, tokens o hashes", () => {
  const secreto = randomBytes(32).toString("hex"); let respuesta;
  const res = { status(s) { assert.equal(s, 500); return this; }, json(data) { respuesta = data; } };
  const log = console.error; console.error = () => {};
  try { manejarErrorSeguro(new Error(`password=${secreto}`), {}, res, () => { throw new Error("No debe delegar errores con respuesta pendiente"); }); }
  finally { console.error = log; }
  assert.deepEqual(Object.keys(respuesta).sort(), ["codigo", "mensaje"]);
  assert.equal(JSON.stringify(respuesta).includes(secreto), false);
});
