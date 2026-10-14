const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { randomBytes } = require("node:crypto");
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const path = require("node:path");
const { AuthService } = require("../src/services/AuthService");
const password = randomBytes(20).toString("hex");
const secret = randomBytes(32).toString("hex");
const anterior = process.env.JWT_SECRET;
process.env.JWT_SECRET = secret;
const mock = { idUsuario: 1, nombre: "Mock aislado", email: "mock@example.invalid", estado: "Activo",
  rol: { nombre: "Administrador" }, passwordHash: require("bcryptjs").hashSync(password, 4) };
let accesos = 0;
const auth = new AuthService({ origen: "mock", mockUsuarios: [mock], secret: () => secret,
  repository: new Proxy({}, { get() { accesos++; throw new Error("Persistencia prohibida"); } }) });
require.cache[require.resolve("../src/services/AuthService")].exports = auth;
const db = require.resolve("../src/config/database");
require.cache[db] = { id: db, filename: db, loaded: true, exports: new Proxy({}, { get() { accesos++; throw new Error("SQL prohibido"); } }) };
for (const archivo of fs.readdirSync(path.join(__dirname, "../src/controllers"))) {
  if (!archivo.endsWith(".js") || ["AuthController.js", "UsuarioController.js"].includes(archivo)) continue;
  const controller = require.resolve(`../src/controllers/${archivo}`);
  require.cache[controller] = { id: controller, filename: controller, loaded: true, exports: new Proxy({}, { get() { return (_req, res) => res.json({}); } }) };
}
const upload = require.resolve("../src/middlewares/propiedadImagenUpload");
require.cache[upload] = { id: upload, filename: upload, loaded: true, exports: { array: () => (_req, _res, next) => next() } };
const app = require("../src/app");
let server, url, token;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  token = (await auth.login(mock.email, password)).token;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  assert.equal(accesos, 0);
  if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior;
});

test("mock sigue autenticando y los nuevos endpoints no usan SQL", async () => {
  const sesion = await fetch(url + "/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(sesion.status, 200);
  assert.equal((await sesion.json()).usuario.gestionCuentasDisponible, false);
  for (const [method, ruta] of [["GET", "/api/usuarios"], ["GET", "/api/roles"], ["PATCH", "/api/auth/me"], ["POST", "/api/auth/cambiar-password"]]) {
    const response = await fetch(url + ruta, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).codigo, "GESTION_SQL_PENDIENTE");
  }
  const logout = await fetch(url + "/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(logout.status, 200);
});

test("token SQL no autentica en mock aun si coinciden ID y email", async () => {
  const tokenSQL = jwt.sign({ idUsuario: mock.idUsuario, email: mock.email, origen: "sql", versionSesion: 1 }, secret, { algorithm: "HS256", expiresIn: "2h" });
  const response = await fetch(url + "/api/auth/me", { headers: { Authorization: `Bearer ${tokenSQL}` } });
  assert.equal(response.status, 401);
});
