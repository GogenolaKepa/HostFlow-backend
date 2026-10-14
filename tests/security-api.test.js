const assert = require("node:assert/strict");
const { before, beforeEach, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { UsuariosAislados } = require("./helpers/usuariosAislados");
const UsuarioService = require("../src/services/UsuarioService");
const { AuthService } = require("../src/services/AuthService");
const secretAnterior = process.env.JWT_SECRET;
const secret = randomBytes(32).toString("hex");
process.env.JWT_SECRET = secret;
const repo = new UsuariosAislados();
const cuentas = new UsuarioService(repo, { cost: 4 });
const auth = new AuthService({ origen: "sql", repository: repo, cuentas, secret: () => secret });
const servicePath = require.resolve("../src/services/AuthService");
require.cache[servicePath].exports = auth;

let negocio = 0, sqlAccesos = 0;
const dbPath = require.resolve("../src/config/database");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: new Proxy({}, {
  get() { sqlAccesos++; throw new Error("Azure SQL prohibido en tests."); },
}) };
for (const archivo of fs.readdirSync(path.join(__dirname, "../src/controllers"))) {
  if (!archivo.endsWith(".js") || ["AuthController.js", "UsuarioController.js"].includes(archivo)) continue;
  const controller = require.resolve(`../src/controllers/${archivo}`);
  require.cache[controller] = { id: controller, filename: controller, loaded: true,
    exports: new Proxy({}, { get() { return (_req, res) => { negocio++; res.json({ ejecutado: true }); }; } }) };
}
const upload = require.resolve("../src/middlewares/propiedadImagenUpload");
require.cache[upload] = { id: upload, filename: upload, loaded: true, exports: { array: () => (_req, _res, next) => next() } };
const app = require("../src/app");
let server, url, admin, operador;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  repo.filas.clear(); repo.numeroRevision = 0; repo.escrituras = 0;
  repo.rolesDatos.forEach((r) => { r.activo = true; });
  admin = await repo.agregar({ id: 1 });
  operador = await repo.agregar({ id: 2, rol: "Operador" });
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  assert.equal(sqlAccesos, 0);
  if (secretAnterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secretAnterior;
});
const nueva = () => randomBytes(20).toString("hex");
async function pedir(method, ruta, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url + ruta, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: method === "HEAD" ? null : await response.json() };
}
async function token(cuenta) { return (await auth.login(cuenta.usuario.email, cuenta.password)).token; }

test("rutas administrativas reales aplican 401/403 antes de escribir", async () => {
  const jwtOperador = await token(operador);
  const rutas = [["GET", "/api/usuarios"], ["GET", "/api/usuarios/1"], ["GET", "/api/roles"],
    ["POST", "/api/usuarios"], ["PUT", "/api/usuarios/1"], ["PATCH", "/api/usuarios/1/estado"],
    ["POST", "/api/usuarios/1/restablecer-password"]];
  for (const [method, ruta] of rutas) {
    assert.equal((await pedir(method, ruta)).status, 401);
    assert.equal((await pedir(method, ruta, jwtOperador, method === "GET" ? undefined : {})).status, 403);
  }
  assert.equal(repo.escrituras, 0);
});

test("Admin lista DTOs seguros, roles filtrados y crea una cuenta con cambio obligatorio", async () => {
  const jwtAdmin = await token(admin);
  const roles = await pedir("GET", "/api/roles", jwtAdmin);
  assert.deepEqual(roles.data.roles.map((r) => r.nombre), ["Administrador", "Operador"]);
  const lista = await pedir("GET", "/api/usuarios?pagina=1&limite=25", jwtAdmin);
  assert.equal(lista.status, 200);
  assert.equal(lista.data.total, 2);
  assert.ok(lista.data.usuarios.every((u) => !Object.hasOwn(u, "passwordHash") && !Object.hasOwn(u, "versionSesion")));
  const alta = await pedir("POST", "/api/usuarios", jwtAdmin, { nombre: "Nueva cuenta", email: "nueva@example.invalid", rol: "Operador", passwordTemporal: nueva() });
  assert.equal(alta.status, 201);
  assert.equal(alta.data.usuario.debeCambiarPassword, true);
  assert.equal(Object.hasOwn(alta.data.usuario, "passwordTemporal"), false);
});

test("cambio obligatorio bloquea todos los modulos incluidos GET/HEAD de sincronizacion", async () => {
  repo.filas.get(2).debeCambiarPassword = true;
  const jwtOperador = await token(operador);
  const antes = negocio;
  for (const [method, ruta] of [["GET", "/api/dashboard/resumen"], ["GET", "/api/limpiezas"],
    ["GET", "/api/alertas"], ["GET", "/api/recomendaciones"], ["GET", "/api/reservas"],
    ["HEAD", "/api/calendario"], ["POST", "/api/limpiezas/sincronizar"],
    ["POST", "/api/integraciones/airbnb/simulacion/nueva-reserva"], ["GET", "/api/usuarios"]]) {
    const resultado = await pedir(method, ruta, jwtOperador);
    assert.equal(resultado.status, 403);
    if (method !== "HEAD") assert.equal(resultado.data.codigo, "PASSWORD_CHANGE_REQUIRED");
  }
  assert.equal(negocio, antes);
  assert.equal((await pedir("GET", "/api/auth/me", jwtOperador)).data.usuario.debeCambiarPassword, true);
  assert.equal((await pedir("PATCH", "/api/auth/me", jwtOperador, { nombre: "No", versionRegistro: operador.usuario.versionRegistro })).status, 403);
  const cambiado = await pedir("POST", "/api/auth/cambiar-password", jwtOperador, { passwordActual: operador.password, passwordNueva: nueva(), versionRegistro: operador.usuario.versionRegistro });
  assert.equal(cambiado.status, 200);
  assert.equal(cambiado.data.usuario.debeCambiarPassword, false);
  assert.equal((await pedir("GET", "/api/calendario", cambiado.data.token)).status, 200);
  assert.equal((await pedir("GET", "/api/auth/me", jwtOperador)).status, 401);
});

test("Operador no eleva privilegios por Mi cuenta, JWT o cuerpos de administracion", async () => {
  const jwtOperador = await token(operador);
  const resultado = await pedir("PATCH", "/api/auth/me", jwtOperador, { nombre: "Intento", rol: "Administrador", versionRegistro: operador.usuario.versionRegistro });
  assert.equal(resultado.status, 400);
  const forged = jwt.sign({ idUsuario: 2, email: operador.usuario.email, origen: "sql", versionSesion: 1, rol: "Administrador", idRol: 41 }, secret, { algorithm: "HS256", expiresIn: "2h" });
  assert.equal((await pedir("GET", "/api/usuarios", forged)).status, 403);
  assert.equal(repo.escrituras, 0);
});

test("ultimo Admin, campos internos, revisiones y reset propio se validan por API", async () => {
  const jwtAdmin = await token(admin);
  const estado = await pedir("PATCH", "/api/usuarios/1/estado", jwtAdmin, { estado: "Inactivo", versionRegistro: admin.usuario.versionRegistro });
  assert.equal(estado.status, 409);
  assert.equal(estado.data.codigo, "ULTIMO_ADMINISTRADOR");
  const revision = await pedir("PUT", "/api/usuarios/2", jwtAdmin, { nombre: "Operador", email: operador.usuario.email, rol: "Operador", versionRegistro: "ffffffffffffffff" });
  assert.equal(revision.status, 409);
  const alta = await pedir("POST", "/api/usuarios", jwtAdmin, { nombre: "No", email: "otro@example.invalid", rol: "Operador", passwordTemporal: nueva(), idRol: 41 });
  assert.equal(alta.status, 400);
  assert.equal((await pedir("POST", "/api/usuarios/1/restablecer-password", jwtAdmin, { passwordTemporal: nueva(), versionRegistro: admin.usuario.versionRegistro })).status, 403);
  assert.equal(repo.escrituras, 0);
});

test("logout durante cambio obligatorio revoca todas las sesiones", async () => {
  repo.filas.get(2).debeCambiarPassword = true;
  const tokenA = await token(operador), tokenB = await token(operador);
  assert.equal((await pedir("POST", "/api/auth/logout", tokenA)).status, 200);
  assert.equal((await pedir("GET", "/api/auth/me", tokenA)).status, 401);
  assert.equal((await pedir("GET", "/api/auth/me", tokenB)).status, 401);
});

test("SQL indisponible responde 503 sin filtrar errores ni ejecutar negocio", async () => {
  const jwtAdmin = await token(admin);
  const obtener = repo.obtener;
  repo.obtener = async () => { throw new Error("Error del driver con datos privados"); };
  try {
    const antes = negocio;
    const res = await pedir("GET", "/api/reservas", jwtAdmin);
    assert.equal(res.status, 503);
    assert.equal(JSON.stringify(res.data).includes("driver"), false);
    assert.equal(negocio, antes);
  } finally { repo.obtener = obtener; }
});

test("JSON malformado en seguridad es generico y CORS OPTIONS sigue publico", async () => {
  const jwtAdmin = await token(admin);
  const response = await fetch(url + "/api/usuarios", { method: "POST", headers: { Authorization: `Bearer ${jwtAdmin}`, "Content-Type": "application/json" }, body: "{contenido-invalido" });
  assert.equal(response.status, 400);
  assert.equal(JSON.stringify(await response.json()).includes("contenido-invalido"), false);
  const options = await fetch(url + "/api/usuarios", { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" } });
  assert.equal(options.status, 204);
});
