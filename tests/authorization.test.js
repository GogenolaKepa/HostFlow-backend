const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { usuarios } = require("../src/data/mockData");

// Cuenta y secreto exclusivos de este proceso. No se carga dotenv ni server.js.
const anterior = process.env.JWT_SECRET;
const secreto = randomBytes(32).toString("hex");
process.env.JWT_SECRET = secreto;
const operador = { idUsuario: 910001, email: "operador@example.invalid", nombre: "Operador de pruebas", estado: "Activo", rol: { nombre: "Operador" } };
const admin = { ...operador, idUsuario: 910002, email: "admin@example.invalid", rol: { nombre: "Administrador" } };
usuarios.push(operador, admin);

let ejecutados = 0;
let subidas = 0;
let sqlAccesos = 0;
let ultimoBody;
const dbPath = require.resolve("../src/config/database");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: new Proxy({}, { get() { sqlAccesos += 1; throw Error("SQL prohibido en pruebas"); } }) };

const historico = [{ mes: "2026-10", inicioMes: "2026-10-01", cantidadReservas: 4, ingresosMes: 123456, nochesOcupadas: 5, nochesDisponibles: 30, ocupacionMensual: 17, nuevoDatoEconomico: 999 }];
const resumen = { propiedadesActivas: 1, reservasActivas: 4, huespedesRegistrados: 2, ingresosMes: 123456, ocupacionMensual: 17, alertasPendientes: 1, nuevoDatoEconomico: 999 };
const reportes = {
  periodo: { tipo: "mensual", metadatos: { ingresos: 123456 } }, filtros: { metadatos: { ingresos: 123456 } },
  resumen: { totalReservasPeriodo: 4, totalReservasOperativas: 3, reservasConIngreso: 2, ingresosEstimados: 123456, nochesOcupadas: 5, nochesDisponibles: 30, ocupacionPromedio: 17, nuevoDatoEconomico: 999 },
  historico, porCanal: [{ canal: "Manual", cantidad: 4, porcentaje: 100, ingresos: 999 }],
  porEstado: [{ estado: "Confirmada", cantidad: 4, porcentaje: 100 }],
  porPropiedad: [{ idPropiedad: 1, propiedad: "Casa", reservas: 4, nochesReservadas: 5, ingresosEstimados: 123456, participacionIngresos: 100, nuevoDatoEconomico: 999 }],
};

for (const archivo of fs.readdirSync(path.join(__dirname, "../src/controllers"))) {
  if (!archivo.endsWith(".js") || archivo === "AuthController.js") continue;
  const controllerPath = require.resolve(`../src/controllers/${archivo}`);
  require.cache[controllerPath] = {
    id: controllerPath, filename: controllerPath, loaded: true,
    exports: new Proxy({}, { get(_target, metodo) {
      return (req, res) => {
        ejecutados += 1;
        ultimoBody = req.body;
        if (archivo === "DashboardController.js") {
          if (metodo === "obtenerDashboard") return res.json({ resumen, proximasReservas: [{ idReserva: 1, huesped: "Prueba", montoEstimado: 123456 }], alertas: [{ idAlerta: 1, titulo: "Check-in", fechaAlerta: new Date("2026-10-13T12:00:00Z"), datos: { idReservaA: 1, ingresosMes: 123456, huesped: { ingresosEstimados: 123456 }, detalle: [{ montoEstimado: 123456 }] }, datosJson: '{"ingresos":123456}' }] });
          if (metodo === "obtenerHistorico") return res.json({ historico });
          if (metodo === "obtenerReportes") return res.json({ reportes });
        }
        if (archivo === "ReservaController.js") {
          return res.json({ reserva: { idReserva: 1, accionesDisponibles: ["VER", "EDITAR", "CANCELAR", "PROPONER_CAMBIO", "GESTIONAR_BOOKING", "VER_OPERACION_BOOKING"] } });
        }
        return res.json({ ejecutado: true });
      };
    } }),
  };
}
const uploadPath = require.resolve("../src/middlewares/propiedadImagenUpload");
require.cache[uploadPath] = { id: uploadPath, filename: uploadPath, loaded: true, exports: { array: () => (_req, _res, next) => { subidas += 1; next(); } } };

const app = require("../src/app");
app.get("/api/sin-politica", (_req, res) => { ejecutados += 1; res.json({}); });
let server, url;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  usuarios.splice(usuarios.indexOf(operador), 2);
  if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior;
});

function token(usuario, claims = {}) {
  return jwt.sign({ idUsuario: usuario.idUsuario, email: usuario.email, rol: usuario.rol.nombre, ...claims }, secreto, { algorithm: "HS256", expiresIn: "2h" });
}
async function pedir(metodo, ruta, body, usuario = operador, claims = {}) {
  const headers = { Authorization: `Bearer ${token(usuario, claims)}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url + ruta, { method: metodo, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: metodo === "HEAD" ? null : await response.json() };
}

test("Operador no puede cancelar, modificar propiedades, imágenes, canales ni operar integraciones por API", async () => {
  const prohibidas = [
    ["PATCH", "/api/reservas/1/cancelar"], ["POST", "/api/propiedades"], ["PUT", "/api/propiedades/1"], ["PATCH", "/api/propiedades/1/estado"],
    ["POST", "/api/propiedades/1/canales/publicar"], ["POST", "/api/propiedades/1/canales/sincronizar"],
    ["GET", "/api/propiedades/1/imagenes/todas"], ["POST", "/api/propiedades/1/imagenes"], ["POST", "/api/propiedades/1/imagenes/upload"],
    ["PUT", "/api/propiedades/1/imagenes/1"], ["DELETE", "/api/propiedades/1/imagenes/1"],
    ["PATCH", "/api/propiedades/1/imagenes/1/principal"], ["PATCH", "/api/propiedades/1/imagenes/1/orden"], ["PATCH", "/api/propiedades/1/imagenes/1/restaurar"],
    ["POST", "/api/reservas/1/airbnb/propuesta"], ["POST", "/api/reservas/airbnb/solicitudes/1/aceptar"], ["POST", "/api/reservas/airbnb/solicitudes/1/rechazar"],
    ["POST", "/api/reservas/1/booking/estadia"], ["POST", "/api/reservas/1/booking/no-show"], ["POST", "/api/reservas/booking/operaciones/1/sincronizar"],
    ["PATCH", "/api/reservas/1/observaciones/1/fijar"],
    ["PATCH", "/api/reservas/1/observaciones/1"], ["DELETE", "/api/reservas/1/observaciones/1"],
  ];
  for (const canal of ["airbnb", "booking"]) {
    for (const ruta of ["simulacion/nueva-reserva", "simulacion/modificacion", "simulacion/cancelacion", "eventos/1/procesar", "propiedades/modificacion", "propiedades/eventos/1/procesar", "propiedades/imagenes/creacion", "propiedades/imagenes/modificacion", "propiedades/imagenes/eliminacion", "propiedades/imagenes/principal", "propiedades/imagenes/eventos/1/procesar"]) {
      prohibidas.push(["POST", `/api/integraciones/${canal}/${ruta}`]);
    }
    for (const ruta of ["eventos", "propiedades/eventos", "propiedades/imagenes/eventos"]) prohibidas.push(["GET", `/api/integraciones/${canal}/${ruta}`]);
  }
  const antes = ejecutados;
  for (const [metodo, ruta] of prohibidas) assert.equal((await pedir(metodo, ruta)).status, 403, `${metodo} ${ruta}`);
  assert.equal(ejecutados, antes);
  assert.equal(subidas, 0);
  assert.equal(sqlAccesos, 0);
});

test("no se pueden modificar importes ni cancelar mediante PUT, ni forzar campos de alta", async () => {
  const antes = ejecutados;
  for (const body of [{ montoEstimado: 0 }, { montoEstimado: null }, { estado: "Cancelada" }, { estado: "Confirmada" }, { rol: "Administrador" }, { idPropiedad: 2 }, { idHuesped: 2 }]) {
    assert.equal((await pedir("PUT", "/api/reservas/1", body)).status, 403);
  }
  for (const campo of ["estado", "canal", "idExterno", "rol"]) assert.equal((await pedir("POST", "/api/reservas", { [campo]: "forzado" })).status, 403);
  assert.equal(ejecutados, antes);
});

test("Operador conserva consultas y acciones operativas autorizadas, incluida sincronización", async () => {
  const permitidas = [
    ["GET", "/api/reservas"], ["GET", "/api/reservas/1"], ["GET", "/api/reservas/1/eventos"],
    ["POST", "/api/reservas", { idPropiedad: 1, idHuesped: 1, fechaIngreso: "2026-11-01", horaIngreso: "14:00", fechaEgreso: "2026-11-03", horaEgreso: "10:00", cantidadHuespedes: 2, montoEstimado: 120000 }],
    ["PUT", "/api/reservas/1", { fechaIngreso: "2026-11-01", horaEgreso: "11:00" }],
    ["GET", "/api/huespedes"], ["POST", "/api/huespedes", { nombre: "Prueba" }], ["PUT", "/api/huespedes/1", { nombre: "Prueba" }],
    ["GET", "/api/propiedades"], ["GET", "/api/propiedades/1/canales"], ["GET", "/api/propiedades/1/imagenes"], ["GET", "/api/calendario"],
    ["GET", "/api/limpiezas"], ["POST", "/api/limpiezas/sincronizar"], ["PATCH", "/api/limpiezas/1/estado", { estado: "En progreso" }],
    ["GET", "/api/alertas"], ["POST", "/api/alertas/sincronizar"], ["PATCH", "/api/alertas/1/leida"], ["PATCH", "/api/alertas/1/resolver"],
    ["GET", "/api/reservas/1/mensajes"], ["POST", "/api/reservas/1/mensajes"], ["POST", "/api/reservas/1/incidencias"], ["PATCH", "/api/reservas/1/incidencias/1"], ["POST", "/api/reservas/1/incidencias/1/resolver"],
    ["GET", "/api/dashboard/reportes/opciones"], ["GET", "/api/recomendaciones?ia=false"],
  ];
  for (const [metodo, ruta, body] of permitidas) assert.equal((await pedir(metodo, ruta, body)).status, 200, `${metodo} ${ruta}`);
  assert.equal(sqlAccesos, 0);
});

test("fijar por campos o falsificar autor de una observación se rechaza antes de negocio", async () => {
  for (const body of [{ observacion: "Prueba", fijada: true }, { observacion: "Prueba", autorNombre: "Administrador" }]) {
    assert.equal((await pedir("POST", "/api/reservas/1/observaciones", body)).status, 403);
  }
  assert.equal((await pedir("POST", "/api/reservas/1/observaciones", { observacion: "Prueba", fijada: false })).status, 200);
  assert.equal(ultimoBody.autorNombre, operador.nombre);
});

test("Operador recibe datos operativos sin importes ni agregados económicos", async () => {
  const dashboard = (await pedir("GET", "/api/dashboard/resumen")).data;
  assert.ok(!Object.hasOwn(dashboard.resumen, "ingresosMes"));
  assert.ok(!Object.hasOwn(dashboard.resumen, "nuevoDatoEconomico"));
  assert.ok(!Object.hasOwn(dashboard.proximasReservas[0], "montoEstimado"));
  assert.equal(dashboard.resumen.ocupacionMensual, 17);
  assert.ok(!JSON.stringify(dashboard).includes("123456"));
  assert.equal(dashboard.alertas[0].datos.idReservaA, 1);
  assert.equal(dashboard.alertas[0].fechaAlerta, "2026-10-13T12:00:00.000Z");
  const historial = (await pedir("GET", "/api/dashboard/historico")).data.historico;
  assert.ok(!Object.hasOwn(historial[0], "ingresosMes"));
  const datos = (await pedir("GET", "/api/dashboard/reportes?exportar=true&rol=Administrador")).data.reportes;
  assert.ok(!JSON.stringify(datos).includes("123456"));
  assert.ok(!Object.hasOwn(datos.porPropiedad[0], "participacionIngresos"));
  assert.ok(!Object.hasOwn(datos.porCanal[0], "ingresos"));
  assert.equal(datos.porPropiedad[0].nochesReservadas, 5);
});

test("Administrador conserva importes, todas las acciones y acceso a operaciones sensibles", async () => {
  const dashboard = (await pedir("GET", "/api/dashboard/resumen", undefined, admin)).data;
  assert.equal(dashboard.resumen.ingresosMes, 123456);
  const datos = (await pedir("GET", "/api/dashboard/reportes", undefined, admin)).data.reportes;
  assert.equal(datos.porPropiedad[0].participacionIngresos, 100);
  for (const [metodo, ruta, body] of [["PATCH", "/api/reservas/1/cancelar"], ["PUT", "/api/reservas/1", { montoEstimado: 1, estado: "Confirmada" }], ["POST", "/api/integraciones/booking/simulacion/nueva-reserva"], ["POST", "/api/propiedades"]]) {
    assert.equal((await pedir(metodo, ruta, body, admin)).status, 200);
  }
});

test("acciones de reservas se intersectan con permisos sin habilitar otras acciones", async () => {
  const data = (await pedir("GET", "/api/reservas/1")).data;
  assert.deepEqual(data.reserva.accionesDisponibles, ["VER", "EDITAR", "VER_OPERACION_BOOKING"]);
});

test("rol en JWT, query o body no permite elevar privilegios; rol desconocido y ruta sin política fallan cerrados", async () => {
  assert.equal((await pedir("PATCH", "/api/reservas/1/cancelar?rol=Administrador", { rol: "Administrador" }, operador, { rol: "Administrador" })).status, 403);
  assert.equal((await pedir("GET", "/api/sin-politica", undefined, admin)).status, 403);
  const nombreAnterior = operador.rol.nombre;
  operador.rol.nombre = "Desconocido";
  try { assert.equal((await pedir("GET", "/api/reservas")).status, 403); }
  finally { operador.rol.nombre = nombreAnterior; }
});

test("HEAD hereda el permiso GET y /auth/me entrega permisos efectivos", async () => {
  assert.equal((await pedir("HEAD", "/api/integraciones/booking/eventos")).status, 403);
  const me = (await pedir("GET", "/api/auth/me")).data;
  assert.ok(me.usuario.permisos.includes("reservas.crear"));
  assert.ok(!me.usuario.permisos.includes("reservas.cancelar"));
});

test("una acción prohibida devuelve 403 incluso antes de interpretar JSON inválido", async () => {
  const antes = ejecutados;
  const response = await fetch(url + "/api/integraciones/airbnb/simulacion/nueva-reserva", {
    method: "POST",
    headers: { Authorization: `Bearer ${token(operador)}`, "Content-Type": "application/json" },
    body: "{json-invalido",
  });
  assert.equal(response.status, 403);
  await response.arrayBuffer();
  assert.equal(ejecutados, antes);
});
