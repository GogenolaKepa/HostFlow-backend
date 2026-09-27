const http = require("http");

const BASE_URL =
  "http://127.0.0.1:4000";

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
          ? JSON.stringify(body)
          : null;

      const headers = {};

      if (payload) {
        headers["Content-Type"] =
          "application/json";

        headers["Content-Length"] =
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
                let json;

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
                  res.statusCode < 200 ||
                  res.statusCode >= 300
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
        req.write(payload);
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

function titulo(
  texto
) {
  console.log(
    "\n" +
    "=".repeat(60)
  );

  console.log(texto);

  console.log(
    "=".repeat(60)
  );
}

function ok(
  mensaje
) {
  console.log(
    `[OK] ${mensaje}`
  );
}

function extraerPropiedad(
  respuesta
) {
  return (
    respuesta.propiedad ||
    respuesta.resultado ||
    respuesta
  );
}

function extraerEvento(
  respuesta
) {
  return (
    respuesta.evento ||
    respuesta
  );
}

function extraerIdExternoPublicacion(
  respuesta
) {
  return (
    respuesta
      ?.respuestaProveedor
      ?.idExterno ||

    respuesta
      ?.vinculacion
      ?.idExterno ||

    respuesta
      ?.resultado
      ?.respuestaProveedor
      ?.idExterno ||

    respuesta
      ?.resultado
      ?.vinculacion
      ?.idExterno ||

    null
  );
}

// =========================================================
// CREAR PROPIEDAD
// =========================================================

async function crearPropiedad() {
  titulo(
    "CREAR PROPIEDAD EN HOSTFLOW"
  );

  const respuesta =
    await request(
      "POST",
      "/api/propiedades",
      {
        nombre:
          `Propiedad Test ${RUN_ID}`,

        tipo:
          "Departamento",

        direccion:
          `Test ${RUN_ID} 123`,

        ciudad:
          "Rosario",

        provincia:
          "Santa Fe",

        capacidadMaxima:
          4,

        precioBase:
          100000,

        estado:
          "Activa",
      }
    );

  const propiedad =
    extraerPropiedad(
      respuesta
    );

  assert(
    propiedad &&
    propiedad.idPropiedad,
    "No se pudo obtener el ID de la propiedad creada."
  );

  ok(
    `Propiedad creada con ID ${propiedad.idPropiedad}.`
  );

  return propiedad;
}

// =========================================================
// PUBLICAR EN UN CANAL
// =========================================================

async function publicar(
  idPropiedad,
  canal
) {
  const respuesta =
    await request(
      "POST",

      `/api/propiedades/${idPropiedad}/canales/publicar`,

      {
        canal,
      }
    );

  const idExterno =
    extraerIdExternoPublicacion(
      respuesta
    );

  assert(
    idExterno,
    `${canal}: no se obtuvo idExterno al publicar.`
  );

  ok(
    `${canal}: propiedad publicada como ${idExterno}.`
  );

  return {
    respuesta,
    idExterno,
  };
}

// =========================================================
// DETALLE
// =========================================================

async function obtenerPropiedad(
  idPropiedad
) {
  const respuesta =
    await request(
      "GET",
      `/api/propiedades/${idPropiedad}`
    );

  return extraerPropiedad(
    respuesta
  );
}

// =========================================================
// AIRBNB -> HOSTFLOW -> BOOKING
// =========================================================

async function probarCambioAirbnb({
  idPropiedad,
  idExternoAirbnb,
}) {
  titulo(
    "AIRBNB -> HOSTFLOW -> BOOKING"
  );

  const eventoRespuesta =
    await request(
      "POST",

      "/api/integraciones/airbnb/propiedades/modificacion",

      {
        idExterno:
          idExternoAirbnb,

        precioBase:
          125000,

        capacidadMaxima:
          5,
      }
    );

  const evento =
    extraerEvento(
      eventoRespuesta
    );

  assert(
    evento.idEvento,
    "Airbnb: no se creó el evento."
  );

  assert(
    evento.estado ===
      "Pendiente",
    "Airbnb: el evento no quedó Pendiente."
  );

  ok(
    `Airbnb: evento ${evento.idEvento} creado.`
  );

  const procesado =
    await request(
      "POST",

      `/api/integraciones/airbnb/propiedades/eventos/${evento.idEvento}/procesar`
    );

  assert(
    procesado.evento?.estado ===
      "Procesado",
    "Airbnb: el evento no quedó Procesado."
  );

  assert(
    Number(
      procesado
        .propiedad
        ?.precioBase
    ) === 125000,
    "Airbnb: HostFlow no actualizó el precio."
  );

  assert(
    Number(
      procesado
        .propiedad
        ?.capacidadMaxima
    ) === 5,
    "Airbnb: HostFlow no actualizó la capacidad."
  );

  const syncBooking =
    procesado
      .sincronizaciones
      ?.find(
        (item) =>
          item.canal ===
          "Booking"
      );

  assert(
    syncBooking,
    "Airbnb: el cambio no fue propagado a Booking."
  );

  assert(
    syncBooking.estado ===
      "Sincronizada",
    "Airbnb: Booking no quedó sincronizado."
  );

  const syncAirbnb =
    procesado
      .sincronizaciones
      ?.find(
        (item) =>
          item.canal ===
          "Airbnb"
      );

  assert(
    !syncAirbnb,
    "Airbnb recibió nuevamente su propio cambio."
  );

  ok(
    "Airbnb modificó HostFlow y el cambio se propagó solamente a Booking."
  );

  // =====================================================
  // IDEMPOTENCIA
  // =====================================================

  const reprocesado =
    await request(
      "POST",

      `/api/integraciones/airbnb/propiedades/eventos/${evento.idEvento}/procesar`
    );

  assert(
    reprocesado.reprocesado ===
      true,
    "Airbnb: falló la idempotencia."
  );

  ok(
    "Airbnb: idempotencia correcta."
  );

  const propiedad =
    await obtenerPropiedad(
      idPropiedad
    );

  assert(
    Number(
      propiedad.precioBase
    ) === 125000,
    "Airbnb: el precio persistido en Azure no coincide."
  );

  assert(
    Number(
      propiedad.capacidadMaxima
    ) === 5,
    "Airbnb: la capacidad persistida no coincide."
  );
}

// =========================================================
// BOOKING -> HOSTFLOW -> AIRBNB
// =========================================================

async function probarCambioBooking({
  idPropiedad,
  idExternoBooking,
}) {
  titulo(
    "BOOKING -> HOSTFLOW -> AIRBNB"
  );

  const eventoRespuesta =
    await request(
      "POST",

      "/api/integraciones/booking/propiedades/modificacion",

      {
        idExterno:
          idExternoBooking,

        nombre:
          `Propiedad Booking ${RUN_ID}`,

        precioBase:
          140000,
      }
    );

  const evento =
    extraerEvento(
      eventoRespuesta
    );

  assert(
    evento.idEvento,
    "Booking: no se creó el evento."
  );

  assert(
    evento.estado ===
      "Pendiente",
    "Booking: el evento no quedó Pendiente."
  );

  ok(
    `Booking: evento ${evento.idEvento} creado.`
  );

  const procesado =
    await request(
      "POST",

      `/api/integraciones/booking/propiedades/eventos/${evento.idEvento}/procesar`
    );

  assert(
    procesado.evento?.estado ===
      "Procesado",
    "Booking: el evento no quedó Procesado."
  );

  assert(
    procesado
      .propiedad
      ?.nombre ===
      `Propiedad Booking ${RUN_ID}`,
    "Booking: HostFlow no actualizó el nombre."
  );

  assert(
    Number(
      procesado
        .propiedad
        ?.precioBase
    ) === 140000,
    "Booking: HostFlow no actualizó el precio."
  );

  const syncAirbnb =
    procesado
      .sincronizaciones
      ?.find(
        (item) =>
          item.canal ===
          "Airbnb"
      );

  assert(
    syncAirbnb,
    "Booking: el cambio no fue propagado a Airbnb."
  );

  assert(
    syncAirbnb.estado ===
      "Sincronizada",
    "Booking: Airbnb no quedó sincronizado."
  );

  const syncBooking =
    procesado
      .sincronizaciones
      ?.find(
        (item) =>
          item.canal ===
          "Booking"
      );

  assert(
    !syncBooking,
    "Booking recibió nuevamente su propio cambio."
  );

  ok(
    "Booking modificó HostFlow y el cambio se propagó solamente a Airbnb."
  );

  // =====================================================
  // IDEMPOTENCIA
  // =====================================================

  const reprocesado =
    await request(
      "POST",

      `/api/integraciones/booking/propiedades/eventos/${evento.idEvento}/procesar`
    );

  assert(
    reprocesado.reprocesado ===
      true,
    "Booking: falló la idempotencia."
  );

  ok(
    "Booking: idempotencia correcta."
  );

  const propiedad =
    await obtenerPropiedad(
      idPropiedad
    );

  assert(
    propiedad.nombre ===
      `Propiedad Booking ${RUN_ID}`,
    "Booking: el nombre persistido no coincide."
  );

  assert(
    Number(
      propiedad.precioBase
    ) === 140000,
    "Booking: el precio persistido no coincide."
  );
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  console.log(
    "\nHOSTFLOW - TEST AUTOMÁTICO DE PROPIEDADES"
  );

  console.log(
    `Run ID: ${RUN_ID}`
  );

  console.log(
    `API: ${BASE_URL}`
  );

  const propiedad =
    await crearPropiedad();

  titulo(
    "PUBLICAR EN AIRBNB Y BOOKING"
  );

  const airbnb =
    await publicar(
      propiedad.idPropiedad,
      "Airbnb"
    );

  const booking =
    await publicar(
      propiedad.idPropiedad,
      "Booking"
    );

  await probarCambioAirbnb({
    idPropiedad:
      propiedad.idPropiedad,

    idExternoAirbnb:
      airbnb.idExterno,
  });

  await probarCambioBooking({
    idPropiedad:
      propiedad.idPropiedad,

    idExternoBooking:
      booking.idExterno,
  });

  titulo(
    "RESULTADO FINAL"
  );

  console.log(
    "[OK] Todas las pruebas de propiedades pasaron correctamente."
  );

  console.log(
    "\nValidado:"
  );

  console.log(
    "  - Crear propiedad en HostFlow"
  );

  console.log(
    "  - Publicar en Airbnb"
  );

  console.log(
    "  - Publicar en Booking"
  );

  console.log(
    "  - Airbnb -> HostFlow"
  );

  console.log(
    "  - HostFlow -> Booking"
  );

  console.log(
    "  - Booking -> HostFlow"
  );

  console.log(
    "  - HostFlow -> Airbnb"
  );

  console.log(
    "  - Prevención de loops"
  );

  console.log(
    "  - Idempotencia Airbnb"
  );

  console.log(
    "  - Idempotencia Booking"
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