const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { usuarios } = require("../src/data/mockData");

// Este proceso no carga dotenv, inicia server.js ni conecta con Azure SQL.
const secretAnterior = process.env.JWT_SECRET;
const secretPrueba = randomBytes(32).toString("hex");
process.env.JWT_SECRET = secretPrueba;
const passwordPrueba = randomBytes(16).toString("hex");
const usuarioPrueba = {
  idUsuario: 900001,
  nombre: "Cuenta de prueba aislada",
  email: "prueba@example.invalid",
  passwordHash: bcrypt.hashSync(passwordPrueba, 4),
  estado: "Activo",
  rol: { nombre: "Administrador" },
};
usuarios.push(usuarioPrueba);

let ejecucionesNegocio = 0;
let accesosSQL = 0;
const databasePath = require.resolve("../src/config/database");
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: new Proxy({}, {
    get() {
      accesosSQL += 1;
      throw new Error("SQL está prohibido en estas pruebas.");
    },
  }),
};

// Se prueba el app y los routers reales. Solo se sustituyen los controladores
// de negocio y el almacenamiento de uploads para impedir efectos externos.
for (const archivo of fs.readdirSync(path.join(__dirname, "../src/controllers"))) {
  if (!archivo.endsWith(".js") || archivo === "AuthController.js") continue;
  const controllerPath = require.resolve(`../src/controllers/${archivo}`);
  require.cache[controllerPath] = {
    id: controllerPath,
    filename: controllerPath,
    loaded: true,
    exports: new Proxy({}, {
      get() {
        return (_req, res) => {
          ejecucionesNegocio += 1;
          res.json({ controladorEjecutado: true });
        };
      },
    }),
  };
}

const uploadPath = require.resolve("../src/middlewares/propiedadImagenUpload");
require.cache[uploadPath] = {
  id: uploadPath,
  filename: uploadPath,
  loaded: true,
  exports: { array: () => (_req, _res, next) => next() },
};

const app = require("../src/app");
app.get("/api/ruta-futura-de-prueba", (_req, res) => {
  ejecucionesNegocio += 1;
  res.json({ controladorEjecutado: true });
});

let server;
let baseURL;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  usuarios.splice(usuarios.indexOf(usuarioPrueba), 1);
  if (secretAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secretAnterior;
});

function firmar(payload = {}, options = {}, secret = secretPrueba) {
  return jwt.sign({
    idUsuario: usuarioPrueba.idUsuario,
    email: usuarioPrueba.email,
    rol: usuarioPrueba.rol.nombre,
    ...payload,
  }, secret, { algorithm: "HS256", expiresIn: "2h", ...options });
}

function pedir(ruta, options = {}) {
  return fetch(`${baseURL}${ruta}`, options);
}

function rutasNegocio() {
  const fuenteApp = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
  const rutas = [];
  for (const montaje of fuenteApp.matchAll(/app\.use\(\s*"(\/api\/[^"\s]+)",\s*(\w+)\s*\)/g)) {
    const [, prefijo, variable] = montaje;
    if (variable === "authRoutes") continue;
    const rutaArchivo = path.join(__dirname, `../src/routes/${variable}.js`);
    const fuenteRuta = fs.readFileSync(rutaArchivo, "utf8");
    for (const ruta of fuenteRuta.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      rutas.push({
        method: ruta[1].toUpperCase(),
        url: prefijo + ruta[2].replace(/:[A-Za-z]+/g, "1"),
      });
    }
  }
  return rutas;
}

test("todas las rutas de negocio rechazan peticiones sin token antes del controlador", async () => {
  const rutas = rutasNegocio();
  assert.ok(rutas.length > 80, "Debe incluir todos los módulos e integraciones.");
  const antes = ejecucionesNegocio;
  for (const ruta of rutas) {
    const response = await pedir(ruta.url, { method: ruta.method });
    assert.equal(response.status, 401, `${ruta.method} ${ruta.url}`);
    await response.arrayBuffer();
  }
  assert.equal(ejecucionesNegocio, antes);
  assert.equal(accesosSQL, 0);
});

test("una ruta API futura y auth/me también quedan protegidas", async () => {
  for (const ruta of ["/api/ruta-futura-de-prueba", "/api/auth/me", "/api/auth/desconocida", "/api/auth/login"]) {
    const response = await pedir(ruta);
    assert.equal(response.status, 401);
    await response.arrayBuffer();
  }
});

test("tokens inválidos, vencidos, sin vencimiento y con algoritmo incorrecto devuelven 401", async () => {
  const ahora = Math.floor(Date.now() / 1000);
  const tokens = [
    "formato-invalido",
    firmar({}, {}, randomBytes(32).toString("hex")),
    firmar({}, { expiresIn: -1 }),
    firmar({ nbf: ahora + 3600 }),
    jwt.sign({ idUsuario: usuarioPrueba.idUsuario, email: usuarioPrueba.email }, secretPrueba, { algorithm: "HS256" }),
    firmar({}, { algorithm: "HS384" }),
    jwt.sign({ idUsuario: usuarioPrueba.idUsuario, exp: ahora + 3600 }, null, { algorithm: "none" }),
    firmar({ idUsuario: 999999 }),
    firmar({ email: "otro@example.invalid" }),
    firmar({ idUsuario: "900001" }),
  ];
  const antes = ejecucionesNegocio;
  for (const token of tokens) {
    const response = await pedir("/api/reservas", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer();
  }
  for (const authorization of ["Basic prueba", "Bearer", "Bearer prueba extra"]) {
    const response = await pedir("/api/reservas", { headers: { Authorization: authorization } });
    assert.equal(response.status, 401);
    await response.arrayBuffer();
  }
  assert.equal(ejecucionesNegocio, antes);
});

test("un usuario mock inactivo no puede usar su JWT", async () => {
  const token = firmar();
  usuarioPrueba.estado = "Inactivo";
  try {
    const response = await pedir("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 401);
    await response.arrayBuffer();
  } finally {
    usuarioPrueba.estado = "Activo";
  }
});

test("login público y restauración de sesión usan JWT HS256 y un perfil seguro", async () => {
  const response = await pedir("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: usuarioPrueba.email, password: passwordPrueba }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const resultado = await response.json();
  const payload = jwt.verify(resultado.token, secretPrueba, { algorithms: ["HS256"] });
  assert.equal(jwt.decode(resultado.token, { complete: true }).header.alg, "HS256");
  assert.equal(payload.exp - payload.iat, 7200);

  const sesionResponse = await pedir("/api/auth/me", {
    headers: { Authorization: `Bearer ${resultado.token}` },
  });
  assert.equal(sesionResponse.status, 200);
  assert.equal(sesionResponse.headers.get("cache-control"), "no-store");
  const sesion = await sesionResponse.json();
  assert.deepEqual(Object.keys(sesion.usuario).sort(), ["debeCambiarPassword", "email", "gestionCuentasDisponible", "idUsuario", "nombre", "origenAutenticacion", "permisos", "rol"]);
  assert.ok(sesion.usuario.permisos.includes("reservas.cancelar"));
  assert.equal(sesion.usuario.idUsuario, usuarioPrueba.idUsuario);
  assert.equal(sesion.expiraEn, payload.exp);
  assert.deepEqual(Object.keys(sesion).sort(), ["expiraEn", "usuario"]);
});

test("un JWT válido alcanza todas las rutas existentes sin cambiar sus reglas", async () => {
  const token = firmar();
  const antes = ejecucionesNegocio;
  const rutas = rutasNegocio();
  for (const ruta of rutas) {
    const response = await pedir(ruta.url, {
      method: ruta.method,
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200, `${ruta.method} ${ruta.url}`);
    await response.arrayBuffer();
  }
  assert.equal(ejecucionesNegocio - antes, rutas.length);
  assert.equal(accesosSQL, 0);
});

test("CORS preflight no requiere token, incluyendo integraciones", async () => {
  for (const ruta of ["/api/reservas", "/api/auth/me", "/api/integraciones/booking/simulacion/nueva-reserva"]) {
    const response = await pedir(ruta, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(response.status, 204);
    assert.ok(response.headers.get("access-control-allow-headers")?.includes("authorization"));
  }
});

test("cuerpo inválido no dispara parsing ni negocio sin autenticación", async () => {
  const response = await pedir("/api/reservas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(response.status, 401);
  await response.arrayBuffer();
});

test("JSON inválido en login no devuelve fragmentos del cuerpo ni errores internos", async () => {
  const response = await pedir("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{contenido-de-prueba-invalido",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { mensaje: "El cuerpo de la solicitud no es válido." });
});

test("login valida cuerpos ausentes y tipos de campos sin errores internos", async () => {
  for (const body of [undefined, "{}", JSON.stringify({ email: usuarioPrueba.email, password: {} })]) {
    const response = await pedir("/api/auth/login", {
      method: "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body,
    });
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(await response.json()), ["mensaje"]);
  }
});

test("solo las excepciones justificadas siguen siendo públicas", async () => {
  const response = await pedir("/");
  assert.equal(response.status, 200);
  await response.arrayBuffer();
  // Una imagen inexistente debe responder 404, no requerir autenticación.
  const imagen = await pedir("/uploads/imagen-inexistente-de-prueba.jpg");
  assert.equal(imagen.status, 404);
  await imagen.arrayBuffer();
});

test("sin secreto la autenticación falla de forma cerrada y sin detalles internos", async () => {
  const token = firmar();
  delete process.env.JWT_SECRET;
  try {
    for (const [ruta, options] of [
      ["/api/reservas", { headers: { Authorization: `Bearer ${token}` } }],
      ["/api/auth/login", { method: "POST" }],
    ]) {
      const response = await pedir(ruta, options);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { mensaje: "La autenticación no está disponible." });
    }
  } finally {
    process.env.JWT_SECRET = secretPrueba;
  }
  assert.equal(accesosSQL, 0);
});
