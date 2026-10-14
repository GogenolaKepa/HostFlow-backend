const assert = require("node:assert/strict");
const { test } = require("node:test");

let comerciales = 0;
let historicos = 0;
let contextoIA;
function sustituir(ruta, exports) {
  const id = require.resolve(ruta);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
// Servicios/repositorios aislados: ninguna conexión SQL ni llamada a Gemini.
sustituir("../src/config/database", new Proxy({}, { get() { throw Error("SQL prohibido"); } }));
sustituir("../src/repositories/RecomendacionRepository", {
  obtenerConflictosProximos: async () => [{ idReservaA: 1, idReservaB: 2, idPropiedad: 1, propiedad: "Casa", canalA: "Manual", canalB: "Booking", fechaIngresoA: "2026-11-01", fechaEgresoA: "2026-11-03" }],
  obtenerOcupacionProxima: async () => { comerciales += 1; return [{ idPropiedad: 1, propiedad: "Casa", ocupacion: 0, reservasProximas: 0 }]; },
});
sustituir("../src/services/LimpiezaService", { obtenerLimpiezas: async () => [{ idTareaLimpieza: 1, idPropiedad: 1, idReservaSalida: 1, propiedad: "Casa", estado: "Pendiente", prioridad: "Urgente", minutosDisponibles: 60 }] });
sustituir("../src/services/DashboardService", {
  obtenerFechaActualArgentina: () => "2026-10-13",
  obtenerHistoricoMensual: async () => { historicos += 1; return [{ mes: "2026-10", ocupacionMensual: 0, ingresosMes: 123456 }, { mes: "2026-09", ocupacionMensual: 80, ingresosMes: 999999 }]; },
});
sustituir("../src/services/IaService", {
  obtenerEstado: () => ({ modelo: "modelo-prueba" }), estaConfigurada: () => true,
  enriquecerRecomendaciones: async (contexto) => { contextoIA = contexto; return { aplicada: false, recomendaciones: [] }; },
});
const service = require("../src/services/RecomendacionService");

test("FlowIA operativo filtra antes de IA y no consulta históricos ni señales comerciales", async () => {
  comerciales = historicos = 0;
  const resultado = await service.obtenerRecomendaciones({ incluirComerciales: false });
  assert.equal(comerciales, 0);
  assert.equal(historicos, 0);
  assert.deepEqual(new Set(resultado.recomendaciones.map((r) => r.tipo)), new Set(["limpieza_prioritaria", "conflicto_reservas"]));
  assert.deepEqual(contextoIA.recomendaciones, resultado.recomendaciones);
  assert.ok(!JSON.stringify(contextoIA).includes("ingresosMes"));
});

test("FlowIA del Administrador conserva señales comerciales y fallback determinístico", async () => {
  const resultado = await service.obtenerRecomendaciones({ incluirComerciales: true, usarIA: false });
  assert.ok(resultado.recomendaciones.some((r) => r.tipo === "ocupacion_baja"));
  assert.ok(resultado.recomendaciones.some((r) => r.tipo === "caida_ocupacion"));
  assert.ok(resultado.recomendaciones.every((r) => r.origen === "Motor de reglas HostFlow"));
});

test("el controlador toma el alcance del permiso autenticado, no del query", async () => {
  const controller = require("../src/controllers/RecomendacionController");
  comerciales = historicos = 0;
  let data;
  await controller.obtenerRecomendaciones(
    { usuario: { rol: "Operador" }, query: { ia: "false", incluirComerciales: "true", rol: "Administrador" } },
    { status: () => ({ json: (value) => { data = value; } }) }
  );
  assert.equal(comerciales, 0);
  assert.equal(historicos, 0);
  assert.ok(data.recomendaciones.every((r) => ["limpieza_prioritaria", "conflicto_reservas"].includes(r.tipo)));
});

test("metadatos económicos anidados se excluyen antes de IA y de su respuesta operativa", async () => {
  const original = service.generarPorConflictos;
  service.generarPorConflictos = (...args) => original.call(service, ...args).map((item) => ({
    ...item,
    datosPrivados: { ingresos: 123456 },
    destino: { ...item.destino, economia: { ingresos: 123456 } },
    evidencia: { ...item.evidencia, economia: { ingresos: 123456 }, reservaA: { ...item.evidencia.reservaA, montoEstimado: 123456, horaIngreso: { importe: 123456 } } },
  }));
  try {
    const datos = await service.obtenerRecomendaciones({ incluirComerciales: false });
    assert.ok(!JSON.stringify(contextoIA).includes("123456"));
    assert.ok(!JSON.stringify(datos).includes("123456"));
    assert.equal(datos.recomendaciones.find((r) => r.tipo === "conflicto_reservas").evidencia.reservaA.idReserva, 1);
  } finally {
    service.generarPorConflictos = original;
  }
});

test("proyección final de FlowIA rechaza comerciales y metadatos económicos en cualquier nivel", () => {
  const { proyectarRespuesta } = require("../src/security/proyecciones");
  const datos = {
    fechaNegocio: "2026-10-13", generadoEn: "2026-10-13T12:00:00Z",
    resumen: { total: 2, ingresos: 123456 },
    recomendaciones: [
      { id: "conflicto", tipo: "conflicto_reservas", prioridad: "Alta", titulo: "Conflicto", destino: { seccion: "reservas", idReserva: 1, ingresos: 123456 }, evidencia: { reservaA: { idReserva: 1, montoEstimado: 123456 }, reservaB: { idReserva: 2 }, datosPrivados: [{ ingresos: 123456 }] }, baseDeterministica: { titulo: "Conflicto", metadatos: { ingresos: 123456 } }, fundamentoIA: { ingresos: 123456 } },
      { id: "comercial", tipo: "ocupacion_baja", evidencia: { ingresos: 123456 } },
    ],
    contexto: { ingresos: 123456, iaGenerativa: { modelo: "prueba", uso: { inputTokens: 10, costo: 123456 }, datosPrivados: { ingresos: 123456 } } },
  };
  const operador = proyectarRespuesta({ path: "/recomendaciones", usuario: { rol: "Operador" } }, datos);
  assert.ok(!JSON.stringify(operador).includes("123456"));
  assert.equal(operador.recomendaciones.length, 1);
  assert.equal(operador.resumen.total, 1);
  assert.equal(operador.contexto.iaGenerativa.uso.inputTokens, 10);
  assert.deepEqual(proyectarRespuesta({ path: "/recomendaciones", usuario: { rol: "Administrador" } }, datos), datos);
});
