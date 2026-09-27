const http = require("http");

const BASE_URL = "http://127.0.0.1:4000";
const ID_PROPIEDAD = 1;
const RUN_ID = Date.now().toString().slice(-8);

// =========================================================
// HELPERS HTTP
// =========================================================

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const payload = body !== null ? JSON.stringify(body) : null;
    const headers = {};

    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          let json;

          try {
            json = data ? JSON.parse(data) : {};
          } catch {
            return reject(
              new Error(`Respuesta JSON inválida:\n${data}`)
            );
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(
                `${method} ${path}\n` +
                  `HTTP ${res.statusCode}\n` +
                  JSON.stringify(json, null, 2)
              )
            );
          }

          resolve(json);
        });
      }
    );

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

function assert(condicion, mensaje) {
  if (!condicion) {
    throw new Error(mensaje);
  }
}

function titulo(texto) {
  console.log("\n" + "=".repeat(60));
  console.log(texto);
  console.log("=".repeat(60));
}

function ok(mensaje) {
  console.log(`[OK] ${mensaje}`);
}

function normalizarHora(hora) {
  if (hora === null || hora === undefined) {
    return null;
  }

  return String(hora).slice(0, 5);
}

function fechaHoyUTC() {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(fechaISO, dias) {
  const fecha = new Date(`${fechaISO}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function seSuperponen(inicioA, finA, inicioB, finB) {
  return inicioA < finB && finA > inicioB;
}

function extraerListaReservas(respuesta) {
  if (Array.isArray(respuesta)) {
    return respuesta;
  }

  if (Array.isArray(respuesta?.reservas)) {
    return respuesta.reservas;
  }

  if (Array.isArray(respuesta?.data)) {
    return respuesta.data;
  }

  throw new Error(
    "No se pudo interpretar la respuesta de GET /api/reservas."
  );
}

function obtenerIdPropiedadReserva(reserva) {
  return Number(
    reserva?.idPropiedad ??
      reserva?.propiedad?.idPropiedad ??
      reserva?.propiedadId
  );
}

async function obtenerReserva(idReserva) {
  const respuesta = await request(
    "GET",
    `/api/reservas/${idReserva}`
  );

  return respuesta.reserva || respuesta;
}

// =========================================================
// BUSCAR FECHAS LIBRES AUTOMÁTICAMENTE
// =========================================================
//
// Antes usábamos fechas fijas muy lejanas.
// Con las pruebas anteriores ya quedaron reservas guardadas
// en Azure y esas fechas podían empezar a chocar.
//
// Ahora el test consulta las reservas reales y busca una
// ventana libre para la propiedad antes de crear cada caso.
//
// La disponibilidad sigue evaluándose por DÍA, tal como está
// definida actualmente en HostFlow.
// =========================================================

async function buscarVentanaLibre(diasNecesarios = 8) {
  const respuesta = await request("GET", "/api/reservas");
  const reservas = extraerListaReservas(respuesta);

  const ocupadas = reservas
    .filter((reserva) => {
      const mismaPropiedad =
        obtenerIdPropiedadReserva(reserva) === ID_PROPIEDAD;

      const estado = reserva?.estado;

      const bloquea =
        estado !== "Cancelada" &&
        estado !== "No show";

      return (
        mismaPropiedad &&
        bloquea &&
        reserva?.fechaIngreso &&
        reserva?.fechaEgreso
      );
    })
    .map((reserva) => ({
      inicio: String(reserva.fechaIngreso).slice(0, 10),
      fin: String(reserva.fechaEgreso).slice(0, 10),
    }));

  // Empezamos a buscar 30 días hacia adelante.
  const inicioBusqueda = sumarDias(fechaHoyUTC(), 30);

  for (let desplazamiento = 0; desplazamiento < 5000; desplazamiento++) {
    const inicio = sumarDias(inicioBusqueda, desplazamiento);
    const fin = sumarDias(inicio, diasNecesarios);

    const hayConflicto = ocupadas.some((reserva) =>
      seSuperponen(
        inicio,
        fin,
        reserva.inicio,
        reserva.fin
      )
    );

    if (!hayConflicto) {
      return {
        fechaIngreso: inicio,
        fechaEgresoBase: sumarDias(inicio, 4),
        fechaEgresoExtendida: sumarDias(inicio, 5),
        fechaEgresoExtendidaLarga: sumarDias(inicio, 6),
      };
    }
  }

  throw new Error(
    "No se encontró una ventana libre para ejecutar las pruebas."
  );
}

// =========================================================
// CREAR RESERVA EXTERNA BASE
// =========================================================

async function crearReservaExterna(
  canal,
  sufijo,
  monto,
  ventana
) {
  const canalUrl = canal.toLowerCase();
  const idExterno = `${canal.toUpperCase()}-${sufijo}-${RUN_ID}`;

  const fechaIngreso = ventana.fechaIngreso;
  const fechaEgreso = ventana.fechaEgresoBase;

  const evento = await request(
    "POST",
    `/api/integraciones/${canalUrl}/simulacion/nueva-reserva`,
    {
      idExterno,
      idPropiedad: ID_PROPIEDAD,
      nombreHuesped: "Test",
      apellidoHuesped: `${canal}-${sufijo}`,
      fechaIngreso,
      fechaEgreso,
      cantidadHuespedes: 2,
      montoEstimado: monto,
      estadoReserva: "Confirmada",
    }
  );

  const procesada = await request(
    "POST",
    `/api/integraciones/${canalUrl}/eventos/${evento.evento.idEvento}/procesar`
  );

  assert(
    procesada.reserva,
    `${canal}: no se creó la reserva base.`
  );

  return {
    reserva: procesada.reserva,
    fechaIngreso,
    fechaEgreso,
    idExterno,
  };
}

// =========================================================
// AIRBNB - PROPUESTA ACEPTADA + HORARIOS
// =========================================================

async function probarAirbnbAceptacion() {
  titulo("AIRBNB - PROPUESTA ACEPTADA + HORARIOS");

  const ventana = await buscarVentanaLibre();

  const base = await crearReservaExterna(
    "Airbnb",
    "ACCEPT",
    600000,
    ventana
  );

  ok(
    `Reserva Airbnb creada con ID ${base.reserva.idReserva} ` +
      `(${base.fechaIngreso} -> ${base.fechaEgreso}).`
  );

  const nuevaFechaEgreso = ventana.fechaEgresoExtendida;
  const nuevaHoraIngreso = "15:00";
  const nuevaHoraEgreso = "11:00";

  const propuesta = await request(
    "POST",
    `/api/reservas/${base.reserva.idReserva}/airbnb/propuesta`,
    {
      fechaIngreso: base.fechaIngreso,
      horaIngreso: nuevaHoraIngreso,
      fechaEgreso: nuevaFechaEgreso,
      horaEgreso: nuevaHoraEgreso,
      cantidadHuespedes: 2,
      montoEstimado: 650000,
    }
  );

  assert(
    propuesta.solicitud,
    "Airbnb: no se creó la propuesta."
  );

  assert(
    normalizarHora(
      propuesta.solicitud?.cambiosSolicitados?.horaIngreso
    ) === nuevaHoraIngreso,
    "Airbnb: la propuesta no conservó la hora de check-in."
  );

  assert(
    normalizarHora(
      propuesta.solicitud?.cambiosSolicitados?.horaEgreso
    ) === nuevaHoraEgreso,
    "Airbnb: la propuesta no conservó la hora de check-out."
  );

  const idSolicitud = propuesta.solicitud.idSolicitud;

  ok(
    `Propuesta creada con ID ${idSolicitud} y horarios correctos.`
  );

  const aceptada = await request(
    "POST",
    `/api/reservas/airbnb/solicitudes/${idSolicitud}/aceptar`
  );

  assert(
    aceptada.reserva,
    "Airbnb: no se devolvió la reserva."
  );

  assert(
    aceptada.reserva.fechaEgreso === nuevaFechaEgreso,
    "Airbnb: no se sincronizó la nueva fecha de egreso."
  );

  assert(
    normalizarHora(aceptada.reserva.horaIngreso) ===
      nuevaHoraIngreso,
    "Airbnb: no se sincronizó la hora de check-in."
  );

  assert(
    normalizarHora(aceptada.reserva.horaEgreso) ===
      nuevaHoraEgreso,
    "Airbnb: no se sincronizó la hora de check-out."
  );

  assert(
    Number(aceptada.reserva.montoEstimado) === 650000,
    "Airbnb: no se sincronizó el nuevo monto."
  );

  const persistida = await obtenerReserva(
    base.reserva.idReserva
  );

  assert(
    persistida.fechaEgreso === nuevaFechaEgreso,
    "Airbnb: la fecha de egreso no quedó persistida en HostFlow."
  );

  assert(
    normalizarHora(persistida.horaIngreso) ===
      nuevaHoraIngreso,
    "Airbnb: la hora de check-in no quedó persistida en Azure."
  );

  assert(
    normalizarHora(persistida.horaEgreso) ===
      nuevaHoraEgreso,
    "Airbnb: la hora de check-out no quedó persistida en Azure."
  );

  ok(
    "Airbnb aceptó la propuesta y las horas quedaron persistidas correctamente."
  );
}

// =========================================================
// AIRBNB - PROPUESTA RECHAZADA
// =========================================================

async function probarAirbnbRechazo() {
  titulo("AIRBNB - PROPUESTA RECHAZADA");

  const montoOriginal = 610000;
  const ventana = await buscarVentanaLibre();

  const base = await crearReservaExterna(
    "Airbnb",
    "REJECT",
    montoOriginal,
    ventana
  );

  ok(
    `Reserva Airbnb creada con ID ${base.reserva.idReserva} ` +
      `(${base.fechaIngreso} -> ${base.fechaEgreso}).`
  );

  const propuesta = await request(
    "POST",
    `/api/reservas/${base.reserva.idReserva}/airbnb/propuesta`,
    {
      fechaIngreso: base.fechaIngreso,
      horaIngreso: "16:00",
      fechaEgreso: ventana.fechaEgresoExtendidaLarga,
      horaEgreso: "10:00",
      cantidadHuespedes: 2,
      montoEstimado: 999999,
    }
  );

  assert(
    propuesta.solicitud,
    "Airbnb: no se creó la propuesta para rechazo."
  );

  const idSolicitud = propuesta.solicitud.idSolicitud;

  ok(`Propuesta creada con ID ${idSolicitud}.`);

  const rechazada = await request(
    "POST",
    `/api/reservas/airbnb/solicitudes/${idSolicitud}/rechazar`
  );

  assert(
    rechazada.reserva,
    "Airbnb: no se devolvió la reserva tras el rechazo."
  );

  assert(
    Number(rechazada.reserva.montoEstimado) === montoOriginal,
    "Airbnb: el rechazo modificó incorrectamente el monto."
  );

  assert(
    rechazada.reserva.fechaEgreso === base.fechaEgreso,
    "Airbnb: el rechazo modificó incorrectamente las fechas."
  );

  ok(
    "Airbnb rechazó la propuesta y la reserva original quedó intacta."
  );
}

// =========================================================
// BOOKING - CAMBIO DE ESTADÍA + HORARIO
// =========================================================

async function probarBookingEstadia() {
  titulo("BOOKING - CAMBIO DE ESTADÍA + HORARIO");

  const ventana = await buscarVentanaLibre();

  const base = await crearReservaExterna(
    "Booking",
    "ESTADIA",
    700000,
    ventana
  );

  ok(
    `Reserva Booking creada con ID ${base.reserva.idReserva} ` +
      `(${base.fechaIngreso} -> ${base.fechaEgreso}).`
  );

  const nuevaFechaEgreso = ventana.fechaEgresoExtendida;
  const nuevaHoraEgreso = "12:30";

  const operacion = await request(
    "POST",
    `/api/reservas/${base.reserva.idReserva}/booking/estadia`,
    {
      fechaEgreso: nuevaFechaEgreso,
      horaEgreso: nuevaHoraEgreso,
      montoEstimado: 750000,
    }
  );

  assert(
    operacion.operacion,
    "Booking: no se creó la operación."
  );

  const horaOperacion =
    operacion.operacion?.cambiosSolicitados?.horaEgreso ??
    operacion.operacion?.datos?.horaEgreso ??
    operacion.operacion?.horaEgreso;

  assert(
    normalizarHora(horaOperacion) === nuevaHoraEgreso,
    "Booking: la operación no conservó la nueva hora de check-out."
  );

  const idOperacion = operacion.operacion.idOperacion;

  ok(
    `Operación Booking creada con ID ${idOperacion} y horario correcto.`
  );

  const sincronizada = await request(
    "POST",
    `/api/reservas/booking/operaciones/${idOperacion}/sincronizar`
  );

  assert(
    sincronizada.reserva,
    "Booking: no se devolvió la reserva sincronizada."
  );

  assert(
    sincronizada.reserva.fechaEgreso === nuevaFechaEgreso,
    "Booking: no se actualizó la fecha de egreso."
  );

  assert(
    normalizarHora(sincronizada.reserva.horaEgreso) ===
      nuevaHoraEgreso,
    "Booking: no se actualizó la hora de check-out."
  );

  assert(
    Number(sincronizada.reserva.montoEstimado) === 750000,
    "Booking: no se actualizó el monto."
  );

  const persistida = await obtenerReserva(
    base.reserva.idReserva
  );

  assert(
    persistida.fechaEgreso === nuevaFechaEgreso,
    "Booking: la fecha de egreso no quedó persistida en HostFlow."
  );

  assert(
    normalizarHora(persistida.horaEgreso) ===
      nuevaHoraEgreso,
    "Booking: la hora de check-out no quedó persistida en Azure."
  );

  ok(
    "Booking confirmó el cambio de estadía y la hora quedó persistida correctamente."
  );
}

// =========================================================
// BOOKING - NO SHOW
// =========================================================

async function probarBookingNoShow() {
  titulo("BOOKING - NO SHOW");

  const ventana = await buscarVentanaLibre();

  const base = await crearReservaExterna(
    "Booking",
    "NOSHOW",
    710000,
    ventana
  );

  ok(
    `Reserva Booking creada con ID ${base.reserva.idReserva} ` +
      `(${base.fechaIngreso} -> ${base.fechaEgreso}).`
  );

  const reporte = await request(
    "POST",
    `/api/reservas/${base.reserva.idReserva}/booking/no-show`,
    {
      condonarCargos: true,
    }
  );

  assert(
    reporte.operacion,
    "Booking: no se creó la operación de no-show."
  );

  const idOperacion = reporte.operacion.idOperacion;

  ok(`No-show enviado a Booking con operación ${idOperacion}.`);

  const sincronizada = await request(
    "POST",
    `/api/reservas/booking/operaciones/${idOperacion}/sincronizar`
  );

  assert(
    sincronizada.reserva.estado === "No show",
    "Booking: la reserva no quedó en estado No show."
  );

  ok(
    "Booking confirmó el no-show y HostFlow actualizó la reserva."
  );
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  console.log(
    "\nHOSTFLOW - TEST DE OPERACIONES CON CANALES + HORARIOS"
  );

  console.log(`Run ID: ${RUN_ID}`);
  console.log(`API: ${BASE_URL}`);

  await probarAirbnbAceptacion();
  await probarAirbnbRechazo();
  await probarBookingEstadia();
  await probarBookingNoShow();

  titulo("RESULTADO FINAL");

  console.log(
    "[OK] Todas las operaciones con canales y horarios pasaron correctamente."
  );

  console.log("\nAirbnb:");
  console.log("  - Propuesta de cambio");
  console.log("  - Hora check-in");
  console.log("  - Hora check-out");
  console.log("  - Persistencia luego de aceptación");
  console.log("  - Rechazo sin modificar reserva");

  console.log("\nBooking:");
  console.log("  - Cambio de estadía");
  console.log("  - Hora check-out");
  console.log("  - Persistencia luego de sincronización");
  console.log("  - No-show");
}

main().catch((error) => {
  console.error("\n[FAIL] PRUEBA FALLIDA\n");
  console.error(error.message);
  process.exit(1);
});
