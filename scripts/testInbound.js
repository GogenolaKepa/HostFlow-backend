const http = require("http");

const BASE_URL =
  "http://127.0.0.1:4000";

const ID_PROPIEDAD = 1;

const RUN_ID =
  Date.now()
    .toString()
    .slice(-8);

// =========================================================
// HELPERS
// =========================================================

function request(
  method,
  path,
  body = null
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const url =
        new URL(
          path,
          BASE_URL
        );

      const payload =
        body !== null
          ? JSON.stringify(
              body
            )
          : null;

      const headers = {};

      if (payload) {
        headers[
          "Content-Type"
        ] =
          "application/json";

        headers[
          "Content-Length"
        ] =
          Buffer.byteLength(
            payload
          );
      }

      const req =
        http.request(
          {
            hostname:
              url.hostname,

            port:
              url.port,

            path:
              url.pathname +
              url.search,

            method,

            headers,
          },

          (res) => {
            let data = "";

            res.on(
              "data",
              (chunk) => {
                data += chunk;
              }
            );

            res.on(
              "end",
              () => {
                let json = null;

                try {
                  json =
                    data
                      ? JSON.parse(
                          data
                        )
                      : {};
                } catch {
                  return reject(
                    new Error(
                      `Respuesta JSON inválida:\n${data}`
                    )
                  );
                }

                if (
                  res.statusCode <
                    200 ||
                  res.statusCode >=
                    300
                ) {
                  return reject(
                    new Error(
                      `${method} ${path}\n` +
                      `HTTP ${res.statusCode}\n` +
                      JSON.stringify(
                        json,
                        null,
                        2
                      )
                    )
                  );
                }

                resolve(json);
              }
            );
          }
        );

      req.on(
        "error",
        reject
      );

      if (payload) {
        req.write(
          payload
        );
      }

      req.end();
    }
  );
}

function assert(
  condicion,
  mensaje
) {
  if (!condicion) {
    throw new Error(
      mensaje
    );
  }
}

function fechaMasDias(
  dias
) {
  const fecha =
    new Date();

  fecha.setUTCDate(
    fecha.getUTCDate() +
      dias
  );

  return fecha
    .toISOString()
    .slice(
      0,
      10
    );
}

function logOk(
  mensaje
) {
  console.log(
    `[OK] ${mensaje}`
  );
}

function titulo(
  texto
) {
  console.log(
    "\n" +
    "=".repeat(60)
  );

  console.log(
    texto
  );

  console.log(
    "=".repeat(60)
  );
}

// =========================================================
// FLUJO NORMAL + HORARIOS
// =========================================================

async function probarFlujoNormal(
  canal,
  offsetDias
) {
  titulo(
    `${canal} - FLUJO NORMAL + HORARIOS`
  );

  const canalUrl =
    canal.toLowerCase();

  const idExterno =
    `${canal.toUpperCase()}-AUTO-${RUN_ID}`;

  const fechaIngreso =
    fechaMasDias(
      1500 +
      offsetDias
    );

  const fechaEgreso =
    fechaMasDias(
      1504 +
      offsetDias
    );

  const horaIngresoInicial =
    canal === "Airbnb"
      ? "15:30"
      : "14:45";

  const horaEgresoInicial =
    canal === "Airbnb"
      ? "10:45"
      : "11:15";

  const horaIngresoModificada =
    canal === "Airbnb"
      ? "17:00"
      : "16:30";

  const horaEgresoModificada =
    canal === "Airbnb"
      ? "12:00"
      : "13:15";

  const montoInicial =
    canal === "Airbnb"
      ? 310000
      : 410000;

  const montoModificado =
    montoInicial +
    50000;

  // =====================================================
  // NUEVA RESERVA
  // =====================================================

  const nueva =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/simulacion/nueva-reserva`,

      {
        idExterno,

        idPropiedad:
          ID_PROPIEDAD,

        nombreHuesped:
          "Test",

        apellidoHuesped:
          canal,

        fechaIngreso,

        horaIngreso:
          horaIngresoInicial,

        fechaEgreso,

        horaEgreso:
          horaEgresoInicial,

        cantidadHuespedes:
          2,

        montoEstimado:
          montoInicial,

        estadoReserva:
          "Confirmada",
      }
    );

  assert(
    nueva.evento.estado ===
      "Pendiente",

    `${canal}: la nueva reserva no quedó Pendiente.`
  );

  assert(
    nueva.evento.datos.horaIngreso ===
      horaIngresoInicial,

    `${canal}: el evento no conservó horaIngreso.`
  );

  assert(
    nueva.evento.datos.horaEgreso ===
      horaEgresoInicial,

    `${canal}: el evento no conservó horaEgreso.`
  );

  logOk(
    `${canal}: evento NUEVA_RESERVA creado con horarios.`
  );

  // =====================================================
  // PROCESAR NUEVA RESERVA
  // =====================================================

  const nuevaProcesada =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/eventos/${nueva.evento.idEvento}/procesar`
    );

  assert(
    nuevaProcesada
      .evento
      .estado ===
      "Procesado",

    `${canal}: el evento no quedó Procesado.`
  );

  assert(
    nuevaProcesada
      .reserva
      .canal === canal,

    `${canal}: canal incorrecto en la reserva.`
  );

  assert(
    nuevaProcesada
      .reserva
      .idExterno ===
      idExterno,

    `${canal}: idExterno incorrecto.`
  );

  assert(
    nuevaProcesada
      .reserva
      .horaIngreso ===
      horaIngresoInicial,

    `${canal}: horaIngreso no se persistió correctamente. Esperada ${horaIngresoInicial}, recibida ${nuevaProcesada.reserva.horaIngreso}.`
  );

  assert(
    nuevaProcesada
      .reserva
      .horaEgreso ===
      horaEgresoInicial,

    `${canal}: horaEgreso no se persistió correctamente. Esperada ${horaEgresoInicial}, recibida ${nuevaProcesada.reserva.horaEgreso}.`
  );

  const idReserva =
    nuevaProcesada
      .reserva
      .idReserva;

  logOk(
    `${canal}: reserva creada con ID ${idReserva} y horarios ${horaIngresoInicial} / ${horaEgresoInicial}.`
  );

  // =====================================================
  // IDEMPOTENCIA
  // =====================================================

  const reprocesada =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/eventos/${nueva.evento.idEvento}/procesar`
    );

  assert(
    reprocesada
      .reprocesado ===
      true,

    `${canal}: falló la prueba de idempotencia.`
  );

  assert(
    reprocesada
      .reserva
      .idReserva ===
      idReserva,

    `${canal}: el reprocesamiento cambió la reserva.`
  );

  assert(
    reprocesada
      .reserva
      .horaIngreso ===
      horaIngresoInicial,

    `${canal}: la idempotencia alteró horaIngreso.`
  );

  assert(
    reprocesada
      .reserva
      .horaEgreso ===
      horaEgresoInicial,

    `${canal}: la idempotencia alteró horaEgreso.`
  );

  logOk(
    `${canal}: idempotencia correcta.`
  );

  // =====================================================
  // MODIFICACIÓN + HORARIOS
  // =====================================================

  const modificacion =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/simulacion/modificacion`,

      {
        idExterno,

        idPropiedad:
          ID_PROPIEDAD,

        nombreHuesped:
          "Test",

        apellidoHuesped:
          canal,

        fechaIngreso,

        horaIngreso:
          horaIngresoModificada,

        fechaEgreso,

        horaEgreso:
          horaEgresoModificada,

        cantidadHuespedes:
          2,

        montoEstimado:
          montoModificado,

        estadoReserva:
          "Confirmada",
      }
    );

  assert(
    modificacion.evento.datos.horaIngreso ===
      horaIngresoModificada,

    `${canal}: la modificación no conservó horaIngreso.`
  );

  assert(
    modificacion.evento.datos.horaEgreso ===
      horaEgresoModificada,

    `${canal}: la modificación no conservó horaEgreso.`
  );

  const modificacionProcesada =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/eventos/${modificacion.evento.idEvento}/procesar`
    );

  assert(
    Number(
      modificacionProcesada
        .reserva
        .montoEstimado
    ) ===
      montoModificado,

    `${canal}: el monto no fue modificado.`
  );

  assert(
    modificacionProcesada
      .reserva
      .horaIngreso ===
      horaIngresoModificada,

    `${canal}: horaIngreso no fue modificada. Esperada ${horaIngresoModificada}, recibida ${modificacionProcesada.reserva.horaIngreso}.`
  );

  assert(
    modificacionProcesada
      .reserva
      .horaEgreso ===
      horaEgresoModificada,

    `${canal}: horaEgreso no fue modificada. Esperada ${horaEgresoModificada}, recibida ${modificacionProcesada.reserva.horaEgreso}.`
  );

  logOk(
    `${canal}: modificación y horarios sincronizados.`
  );

  // =====================================================
  // CANCELACIÓN
  // =====================================================

  const cancelacion =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/simulacion/cancelacion`,

      {
        idExterno,
      }
    );

  assert(
    cancelacion
      .evento
      .datos
      .estadoReserva ===
      "Cancelada",

    `${canal}: el evento de cancelación no contiene estado Cancelada.`
  );

  const cancelacionProcesada =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/eventos/${cancelacion.evento.idEvento}/procesar`
    );

  assert(
    cancelacionProcesada
      .reserva
      .estado ===
      "Cancelada",

    `${canal}: la reserva no quedó Cancelada.`
  );

  assert(
    cancelacionProcesada
      .reserva
      .horaIngreso ===
      horaIngresoModificada,

    `${canal}: la cancelación alteró horaIngreso.`
  );

  assert(
    cancelacionProcesada
      .reserva
      .horaEgreso ===
      horaEgresoModificada,

    `${canal}: la cancelación alteró horaEgreso.`
  );

  logOk(
    `${canal}: cancelación sincronizada sin perder horarios.`
  );

  // =====================================================
  // TIMELINE
  // =====================================================

  const timeline =
    await request(
      "GET",

      `/api/reservas/${idReserva}/eventos`
    );

  const tipos =
    timeline.eventos.map(
      (evento) =>
        evento.tipo
    );

  assert(
    tipos.includes(
      "RESERVA_RECIBIDA"
    ),

    `${canal}: falta RESERVA_RECIBIDA en timeline.`
  );

  assert(
    tipos.includes(
      "RESERVA_MODIFICADA"
    ),

    `${canal}: falta RESERVA_MODIFICADA en timeline.`
  );

  assert(
    tipos.includes(
      "RESERVA_CANCELADA"
    ),

    `${canal}: falta RESERVA_CANCELADA en timeline.`
  );

  logOk(
    `${canal}: timeline correcto.`
  );

  return {
    canal,
    idReserva,
    idExterno,
  };
}

// =========================================================
// EVENTO FUERA DE ORDEN
// =========================================================

async function probarEventoFueraDeOrden(
  canal,
  offsetDias
) {
  titulo(
    `${canal} - EVENTO FUERA DE ORDEN`
  );

  const canalUrl =
    canal.toLowerCase();

  const idExterno =
    `${canal.toUpperCase()}-OLD-${RUN_ID}`;

  const fechaIngreso =
    fechaMasDias(
      1700 +
      offsetDias
    );

  const fechaEgreso =
    fechaMasDias(
      1704 +
      offsetDias
    );

  const horaIngresoBase =
    "15:00";

  const horaEgresoBase =
    "10:00";

  // =====================================================
  // CREAR RESERVA
  // =====================================================

  const nueva =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/simulacion/nueva-reserva`,

      {
        idExterno,

        idPropiedad:
          ID_PROPIEDAD,

        nombreHuesped:
          "Evento",

        apellidoHuesped:
          "FueraOrden",

        fechaIngreso,

        horaIngreso:
          horaIngresoBase,

        fechaEgreso,

        horaEgreso:
          horaEgresoBase,

        cantidadHuespedes:
          2,

        montoEstimado:
          500000,

        estadoReserva:
          "Confirmada",
      }
    );

  const nuevaProcesada =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/eventos/${nueva.evento.idEvento}/procesar`
    );

  const idReserva =
    nuevaProcesada
      .reserva
      .idReserva;

  assert(
    nuevaProcesada.reserva.horaIngreso ===
      horaIngresoBase,
    `${canal}: la reserva base no guardó horaIngreso.`
  );

  assert(
    nuevaProcesada.reserva.horaEgreso ===
      horaEgresoBase,
    `${canal}: la reserva base no guardó horaEgreso.`
  );

  logOk(
    `${canal}: reserva base creada con horarios.`
  );

  // =====================================================
  // CREAR MODIFICACIÓN, PERO NO PROCESAR
  // =====================================================

  const modificacionVieja =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/simulacion/modificacion`,

      {
        idExterno,

        idPropiedad:
          ID_PROPIEDAD,

        fechaIngreso,

        horaIngreso:
          "20:00",

        fechaEgreso,

        horaEgreso:
          "18:00",

        cantidadHuespedes:
          2,

        montoEstimado:
          999999,

        estadoReserva:
          "Confirmada",
      }
    );

  logOk(
    `${canal}: modificación vieja con otros horarios quedó pendiente.`
  );

  // =====================================================
  // CANCELAR DESPUÉS
  // =====================================================

  const cancelacion =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/simulacion/cancelacion`,

      {
        idExterno,
      }
    );

  const cancelacionProcesada =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/eventos/${cancelacion.evento.idEvento}/procesar`
    );

  assert(
    cancelacionProcesada
      .reserva
      .estado ===
      "Cancelada",

    `${canal}: no se pudo cancelar la reserva.`
  );

  logOk(
    `${canal}: cancelación procesada antes que la modificación.`
  );

  // =====================================================
  // PROCESAR MODIFICACIÓN VIEJA
  // =====================================================

  const modificacionProcesada =
    await request(
      "POST",

      `/api/integraciones/${canalUrl}/eventos/${modificacionVieja.evento.idEvento}/procesar`
    );

  assert(
    modificacionProcesada
      .ignorado ===
      true,

    `${canal}: la modificación vieja NO fue ignorada.`
  );

  assert(
    modificacionProcesada
      .reserva
      .estado ===
      "Cancelada",

    `${canal}: la modificación vieja alteró la reserva cancelada.`
  );

  assert(
    Number(
      modificacionProcesada
        .reserva
        .montoEstimado
    ) !==
      999999,

    `${canal}: la modificación vieja cambió el monto.`
  );

  assert(
    modificacionProcesada
      .reserva
      .horaIngreso ===
      horaIngresoBase,

    `${canal}: la modificación vieja cambió horaIngreso.`
  );

  assert(
    modificacionProcesada
      .reserva
      .horaEgreso ===
      horaEgresoBase,

    `${canal}: la modificación vieja cambió horaEgreso.`
  );

  logOk(
    `${canal}: evento fuera de orden ignorado correctamente, incluyendo horarios.`
  );

  return {
    canal,
    idReserva,
    idExterno,
  };
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  console.log(
    "\nHOSTFLOW - TEST AUTOMÁTICO DE INBOUND + HORARIOS"
  );

  console.log(
    `Run ID: ${RUN_ID}`
  );

  console.log(
    `API: ${BASE_URL}`
  );

  await probarFlujoNormal(
    "Airbnb",
    0
  );

  await probarFlujoNormal(
    "Booking",
    20
  );

  await probarEventoFueraDeOrden(
    "Airbnb",
    40
  );

  await probarEventoFueraDeOrden(
    "Booking",
    60
  );

  titulo(
    "RESULTADO FINAL"
  );

  console.log(
    "[OK] Todas las pruebas inbound con horarios pasaron correctamente."
  );

  console.log(
    "\nAirbnb:"
  );

  console.log(
    "  - Nueva reserva con horarios"
  );

  console.log(
    "  - Persistencia horaIngreso/horaEgreso"
  );

  console.log(
    "  - Idempotencia"
  );

  console.log(
    "  - Modificación de horarios"
  );

  console.log(
    "  - Cancelación sin perder horarios"
  );

  console.log(
    "  - Timeline"
  );

  console.log(
    "  - Evento fuera de orden"
  );

  console.log(
    "\nBooking:"
  );

  console.log(
    "  - Nueva reserva con horarios"
  );

  console.log(
    "  - Persistencia horaIngreso/horaEgreso"
  );

  console.log(
    "  - Idempotencia"
  );

  console.log(
    "  - Modificación de horarios"
  );

  console.log(
    "  - Cancelación sin perder horarios"
  );

  console.log(
    "  - Timeline"
  );

  console.log(
    "  - Evento fuera de orden"
  );
}

main()
  .catch(
    (error) => {
      console.error(
        "\n[FAIL] PRUEBA FALLIDA\n"
      );

      console.error(
        error.message
      );

      process.exit(1);
    }
  );