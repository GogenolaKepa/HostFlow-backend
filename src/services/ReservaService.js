const ChannelService = require("./ChannelService");
const AirbnbChannelService = require("./AirbnbChannelService");
const BookingChannelService = require("./BookingChannelService");
const BookingInboundService = require("./BookingInboundService");
const AirbnbInboundService = require("./AirbnbInboundService");
const ReservaRepository = require("../repositories/ReservaRepository");
const ReservaEventoRepository = require("../repositories/ReservaEventoRepository");
const ReservaMensajeRepository = require("../repositories/ReservaMensajeRepository");
const ReservaIncidenciaRepository = require("../repositories/ReservaIncidenciaRepository");
const ReservaObservacionRepository = require("../repositories/ReservaObservacionRepository");

class ReservaService {
  // =========================================================
  // FECHA ACTUAL DE NEGOCIO - ARGENTINA
  // =========================================================
  //
  // Construimos YYYY-MM-DD usando la zona horaria de Argentina
  // para no depender de la configuración horaria del servidor.
  // =========================================================

  // =========================================================
  // REGISTRAR EVENTO DE RESERVA
  // =========================================================
  //
  // El timeline complementa la operación principal.
  // Si el registro del evento falla, dejamos el error en consola
  // pero no convertimos una reserva ya guardada en un error para
  // el usuario. Más adelante podemos llevar ambas escrituras a
  // una misma transacción si queremos atomicidad total.
  // =========================================================

  async registrarEventoReserva(datosEvento) {
    try {
      return await ReservaEventoRepository
        .crearEvento(datosEvento);
    } catch (error) {
      console.error(
        "[HostFlow] No se pudo registrar el evento de la reserva:",
        error
      );

      return null;
    }
  }

  async registrarConflictoReserva({
    idReserva,
    canal,
    fechaIngreso,
    fechaEgreso,
    contexto,
    idExterno = null,
    idOperacion = null,
    idSolicitud = null,
  }) {
    return await this.registrarEventoReserva({
      idReserva,

      tipo:
        "CONFLICTO_DETECTADO",

      titulo:
        "Conflicto de disponibilidad detectado",

      descripcion:
        "HostFlow detectó una superposición con otra reserva. Como el cambio proviene de un canal externo confirmado, la información del canal se conserva y el conflicto queda registrado para revisión.",

      origen:
        "Sistema",

      datosJson: {
        canal:
          canal || null,

        contexto:
          contexto || null,

        fechaIngreso:
          fechaIngreso || null,

        fechaEgreso:
          fechaEgreso || null,

        idExterno:
          idExterno || null,

        idOperacion:
          idOperacion || null,

        idSolicitud:
          idSolicitud || null,
      },
    });
  }

  obtenerFechaActualArgentina() {
    const partes =
      new Intl.DateTimeFormat(
        "es-AR",
        {
          timeZone:
            "America/Argentina/Buenos_Aires",

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit",
        }
      ).formatToParts(
        new Date()
      );

    const valores = {};

    partes.forEach(
      (parte) => {
        if (
          parte.type !==
          "literal"
        ) {
          valores[
            parte.type
          ] =
            parte.value;
        }
      }
    );

    return `${valores.year}-${valores.month}-${valores.day}`;
  }

  // =========================================================
  // FINALIZAR RESERVAS VENCIDAS
  // =========================================================
  //
  // Regla:
  //
  // Confirmada + FechaEgreso < hoy
  //              ↓
  //          Finalizada
  //
  // La persistencia real se realiza en Azure SQL mediante
  // ReservaRepository.
  // =========================================================

  async finalizarReservasVencidas() {
    const fechaActual =
      this.obtenerFechaActualArgentina();

    const resultado =
      await ReservaRepository
        .finalizarReservasVencidas(
          fechaActual
        );

    // =========================================================
    // TIMELINE - FINALIZACIÓN AUTOMÁTICA
    // =========================================================
    //
    // El Repository devuelve únicamente los IDs de reservas
    // que efectivamente pasaron de Confirmada a Finalizada.
    //
    // Como una reserva ya Finalizada no vuelve a entrar en ese
    // UPDATE, este evento se registra una sola vez.
    // =========================================================

    for (
      const idReserva
      of resultado.idsReservas || []
    ) {
      const reserva =
        await ReservaRepository
          .obtenerPorId(
            idReserva
          );

      await this.registrarEventoReserva({
        idReserva,

        tipo:
          "RESERVA_FINALIZADA",

        titulo:
          "Reserva finalizada automáticamente",

        descripcion:
          "HostFlow marcó la reserva como finalizada porque la fecha de egreso ya había pasado.",

        origen:
          "Sistema",

        datosJson: {
          estadoAnterior:
            "Confirmada",

          estadoNuevo:
            "Finalizada",

          fechaEgreso:
            reserva?.fechaEgreso ||
            null,

          canal:
            reserva?.canal ||
            null,

          propiedad:
            reserva?.propiedad ||
            null,

          huesped:
            reserva?.huesped ||
            null,
        },
      });
    }

    return resultado;
  }

  async obtenerReservas() {
    await this
      .finalizarReservasVencidas();
  const reservasDb =
    await ReservaRepository.obtenerTodas();

  return reservasDb.map(
    (reserva) => {
      const solicitudAirbnbPendiente =
        reserva.canal === "Airbnb"
          ? AirbnbChannelService.obtenerSolicitudPendientePorReserva(
              reserva.idReserva
            )
          : null;

      const operacionBookingPendiente =
        reserva.canal === "Booking"
          ? BookingChannelService.obtenerOperacionPendientePorReserva(
              reserva.idReserva
            )
          : null;

      return {
        ...reserva,

        tipoGestion:
          ChannelService.obtenerTipoGestion(
            reserva.canal
          ),

        accionesDisponibles:
          ChannelService.obtenerAccionesDisponibles(
            reserva
          ),

        solicitudAirbnbPendiente:
          solicitudAirbnbPendiente
            ? {
                idSolicitud:
                  solicitudAirbnbPendiente.idSolicitud,
                estado:
                  solicitudAirbnbPendiente.estado,
                fechaSolicitud:
                  solicitudAirbnbPendiente.fechaSolicitud,
                cambiosSolicitados:
                  solicitudAirbnbPendiente.cambiosSolicitados,
              }
            : null,

        operacionBookingPendiente:
          operacionBookingPendiente
            ? {
                idOperacion:
                  operacionBookingPendiente.idOperacion,
                tipo:
                  operacionBookingPendiente.tipo,
                estado:
                  operacionBookingPendiente.estado,
                fechaOperacion:
                  operacionBookingPendiente.fechaOperacion,
                cambiosSolicitados:
                  operacionBookingPendiente.cambiosSolicitados ||
                  null,
              }
            : null,
      };
    }
  );
}

  // =========================================================
  // HISTORIAL / TIMELINE DE UNA RESERVA
  // =========================================================
  //
  // Devuelve los eventos persistidos de una reserva
  // ordenados cronológicamente.
  // =========================================================

  async obtenerEventosReserva(idReserva) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    return await ReservaEventoRepository
      .obtenerPorReserva(
        reserva.idReserva
      );
  }

  // =========================================================
  // MENSAJES DE UNA RESERVA
  // =========================================================

  async obtenerMensajesReserva(
    idReserva
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    return await ReservaMensajeRepository
      .obtenerPorReserva(
        reserva.idReserva
      );
  }

  async registrarMensajeReserva(
    idReserva,
    datos = {}
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    const mensaje =
      String(
        datos.mensaje || ""
      ).trim();

    if (!mensaje) {
      throw new Error(
        "El mensaje no puede estar vacío."
      );
    }

    const direccion =
      datos.direccion ===
        "Entrante"
        ? "Entrante"
        : "Saliente";

    const remitenteTipo =
      datos.remitenteTipo ||
      (
        direccion ===
          "Entrante"
          ? "Huesped"
          : "Anfitrion"
      );

    const remitenteNombre =
      datos.remitenteNombre ||
      (
        direccion ===
          "Entrante"
          ? reserva.huesped
          : "HostFlow"
      );

    let origen =
      datos.origen;

    if (!origen) {
      if (
        direccion ===
          "Entrante" &&
        (
          reserva.canal ===
            "Airbnb" ||
          reserva.canal ===
            "Booking"
        )
      ) {
        origen =
          reserva.canal;
      } else if (
        reserva.canal ===
          "Manual"
      ) {
        origen =
          "Manual";
      } else {
        origen =
          "HostFlow";
      }
    }

    const estado =
      datos.estado ||
      (
        direccion ===
          "Saliente"
          ? "Enviado"
          : "Registrado"
      );

    const metadataBase =
      datos.metadataJson &&
      typeof datos.metadataJson ===
        "object" &&
      !Array.isArray(
        datos.metadataJson
      )
        ? datos.metadataJson
        : {};

    return await ReservaMensajeRepository
      .crearMensaje({
        idReserva:
          reserva.idReserva,

        direccion,

        remitenteTipo,

        remitenteNombre,

        mensaje,

        origen,

        idExterno:
          datos.idExterno ||
          null,

        estado,

        fechaMensaje:
          datos.fechaMensaje ||
          null,

        metadataJson: {
          ...metadataBase,

          canalReserva:
            reserva.canal,

          idExternoReserva:
            reserva.idExterno ||
            null,
        },
      });
  }

  // =========================================================
  // INCIDENCIAS DE UNA RESERVA
  // =========================================================

  async obtenerIncidenciasReserva(
    idReserva
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    return await ReservaIncidenciaRepository
      .obtenerPorReserva(
        reserva.idReserva
      );
  }

  async registrarIncidenciaReserva(
    idReserva,
    datos = {}
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    const tipo =
      String(
        datos.tipo || ""
      ).trim();

    const titulo =
      String(
        datos.titulo || ""
      ).trim();

    const descripcion =
      String(
        datos.descripcion || ""
      ).trim();

    if (!tipo) {
      throw new Error(
        "El tipo de incidencia es obligatorio."
      );
    }

    if (!titulo) {
      throw new Error(
        "El título de la incidencia es obligatorio."
      );
    }

    if (!descripcion) {
      throw new Error(
        "La descripción de la incidencia es obligatoria."
      );
    }

    const severidad =
      datos.severidad ||
      "Baja";

    const origen =
      datos.origen ||
      "HostFlow";

    const incidencia =
      await ReservaIncidenciaRepository
        .crearIncidencia({
          idReserva:
            reserva.idReserva,

          tipo,

          titulo,

          descripcion,

          severidad,

          estado:
            "Abierta",

          origen,

          fechaIncidencia:
            datos.fechaIncidencia ||
            null,

          datosJson:
            datos.datosJson ||
            null,
        });

    await this.registrarEventoReserva({
      idReserva:
        reserva.idReserva,

      tipo:
        "INCIDENCIA_REGISTRADA",

      titulo:
        "Incidencia registrada",

      descripcion:
        `Se registró la incidencia "${incidencia.titulo}".`,

      origen:
        incidencia.origen ===
          "Manual"
          ? "Manual"
          : "HostFlow",

      datosJson: {
        idIncidenciaReserva:
          incidencia.idIncidenciaReserva,

        tipo:
          incidencia.tipo,

        titulo:
          incidencia.titulo,

        severidad:
          incidencia.severidad,

        estado:
          incidencia.estado,
      },
    });

    return incidencia;
  }

  async actualizarIncidenciaReserva(
    idReserva,
    idIncidenciaReserva,
    datos = {}
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    const incidenciaActual =
      await ReservaIncidenciaRepository
        .obtenerPorId(
          idIncidenciaReserva
        );

    if (
      !incidenciaActual ||
      Number(
        incidenciaActual.idReserva
      ) !==
        Number(
          reserva.idReserva
        )
    ) {
      throw new Error(
        "La incidencia no pertenece a la reserva indicada."
      );
    }

    if (
      datos.estado ===
      "Resuelta"
    ) {
      throw new Error(
        "Para resolver una incidencia utilizá la acción específica de resolución."
      );
    }

    const incidenciaActualizada =
      await ReservaIncidenciaRepository
        .actualizarIncidencia(
          idIncidenciaReserva,
          datos
        );

    await this.registrarEventoReserva({
      idReserva:
        reserva.idReserva,

      tipo:
        "INCIDENCIA_ACTUALIZADA",

      titulo:
        "Incidencia actualizada",

      descripcion:
        `Se actualizaron datos de la incidencia "${incidenciaActualizada.titulo}".`,

      origen:
        "HostFlow",

      datosJson: {
        idIncidenciaReserva:
          incidenciaActualizada
            .idIncidenciaReserva,

        antes: {
          tipo:
            incidenciaActual.tipo,

          titulo:
            incidenciaActual.titulo,

          severidad:
            incidenciaActual.severidad,

          estado:
            incidenciaActual.estado,
        },

        despues: {
          tipo:
            incidenciaActualizada.tipo,

          titulo:
            incidenciaActualizada.titulo,

          severidad:
            incidenciaActualizada
              .severidad,

          estado:
            incidenciaActualizada.estado,
        },
      },
    });

    return incidenciaActualizada;
  }

  async resolverIncidenciaReserva(
    idReserva,
    idIncidenciaReserva,
    resolucion
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    const incidenciaActual =
      await ReservaIncidenciaRepository
        .obtenerPorId(
          idIncidenciaReserva
        );

    if (
      !incidenciaActual ||
      Number(
        incidenciaActual.idReserva
      ) !==
        Number(
          reserva.idReserva
        )
    ) {
      throw new Error(
        "La incidencia no pertenece a la reserva indicada."
      );
    }

    if (
      incidenciaActual.estado ===
      "Resuelta"
    ) {
      throw new Error(
        "La incidencia ya se encuentra resuelta."
      );
    }

    const resolucionNormalizada =
      String(
        resolucion || ""
      ).trim();

    if (!resolucionNormalizada) {
      throw new Error(
        "Debe indicar cómo se resolvió la incidencia."
      );
    }

    const incidenciaResuelta =
      await ReservaIncidenciaRepository
        .resolverIncidencia(
          idIncidenciaReserva,
          resolucionNormalizada
        );

    await this.registrarEventoReserva({
      idReserva:
        reserva.idReserva,

      tipo:
        "INCIDENCIA_RESUELTA",

      titulo:
        "Incidencia resuelta",

      descripcion:
        `Se resolvió la incidencia "${incidenciaResuelta.titulo}".`,

      origen:
        "HostFlow",

      datosJson: {
        idIncidenciaReserva:
          incidenciaResuelta
            .idIncidenciaReserva,

        tipo:
          incidenciaResuelta.tipo,

        severidad:
          incidenciaResuelta
            .severidad,

        estadoAnterior:
          incidenciaActual.estado,

        estadoNuevo:
          incidenciaResuelta.estado,

        resolucion:
          incidenciaResuelta.resolucion,
      },
    });

    return incidenciaResuelta;
  }

  // =========================================================
  // OBSERVACIONES INTERNAS DE UNA RESERVA
  // =========================================================
  //
  // Las observaciones son notas internas del administrador.
  // No representan mensajes al huésped y, por diseño, no
  // generan eventos en el timeline para evitar ruido operativo.
  // =========================================================

  async obtenerObservacionesReserva(
    idReserva
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    return await ReservaObservacionRepository
      .obtenerPorReserva(
        reserva.idReserva
      );
  }

  async registrarObservacionReserva(
    idReserva,
    datos = {}
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    const observacion =
      String(
        datos.observacion || ""
      ).trim();

    if (!observacion) {
      throw new Error(
        "La observación no puede estar vacía."
      );
    }

    return await ReservaObservacionRepository
      .crearObservacion({
        idReserva:
          reserva.idReserva,

        categoria:
          datos.categoria ||
          "General",

        observacion,

        fijada:
          datos.fijada === true,

        autorNombre:
          datos.autorNombre ||
          "HostFlow",
      });
  }

  async actualizarObservacionReserva(
    idReserva,
    idObservacionReserva,
    datos = {}
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    const observacionActual =
      await ReservaObservacionRepository
        .obtenerPorId(
          idObservacionReserva
        );

    if (
      !observacionActual ||
      Number(
        observacionActual.idReserva
      ) !==
        Number(
          reserva.idReserva
        )
    ) {
      throw new Error(
        "La observación no pertenece a la reserva indicada."
      );
    }

    const observacionActualizada =
      await ReservaObservacionRepository
        .actualizarObservacion(
          idObservacionReserva,
          {
            categoria:
              datos.categoria,

            observacion:
              datos.observacion,

            fijada:
              datos.fijada,

            autorNombre:
              datos.autorNombre,
          }
        );

    return observacionActualizada;
  }

  async cambiarFijadaObservacionReserva(
    idReserva,
    idObservacionReserva,
    fijada
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    const observacionActual =
      await ReservaObservacionRepository
        .obtenerPorId(
          idObservacionReserva
        );

    if (
      !observacionActual ||
      Number(
        observacionActual.idReserva
      ) !==
        Number(
          reserva.idReserva
        )
    ) {
      throw new Error(
        "La observación no pertenece a la reserva indicada."
      );
    }

    if (
      typeof fijada !== "boolean"
    ) {
      throw new Error(
        "Debe indicar si la observación queda fijada o no."
      );
    }

    return await ReservaObservacionRepository
      .cambiarFijada(
        idObservacionReserva,
        fijada
      );
  }

  async eliminarObservacionReserva(
    idReserva,
    idObservacionReserva
  ) {
    const reserva =
      await ReservaRepository.obtenerPorId(
        idReserva
      );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    const observacionActual =
      await ReservaObservacionRepository
        .obtenerPorId(
          idObservacionReserva
        );

    if (
      !observacionActual ||
      Number(
        observacionActual.idReserva
      ) !==
        Number(
          reserva.idReserva
        )
    ) {
      throw new Error(
        "La observación no pertenece a la reserva indicada."
      );
    }

    return await ReservaObservacionRepository
      .eliminarObservacion(
        idObservacionReserva
      );
  }

  async obtenerReservaPorId(idReserva) {
  await this
    .finalizarReservasVencidas();

  const reserva =
    await ReservaRepository.obtenerPorId(
      idReserva
    );

  if (!reserva) {
    throw new Error(
      "La reserva no existe."
    );
  }

  const solicitudAirbnbPendiente =
    reserva.canal === "Airbnb"
      ? AirbnbChannelService.obtenerSolicitudPendientePorReserva(
          reserva.idReserva
        )
      : null;

  const operacionBookingPendiente =
    reserva.canal === "Booking"
      ? BookingChannelService.obtenerOperacionPendientePorReserva(
          reserva.idReserva
        )
      : null;

  return {
    ...reserva,

    tipoGestion:
      ChannelService.obtenerTipoGestion(
        reserva.canal
      ),

    accionesDisponibles:
      ChannelService.obtenerAccionesDisponibles(
        reserva
      ),

    solicitudAirbnbPendiente:
      solicitudAirbnbPendiente
        ? {
            idSolicitud:
              solicitudAirbnbPendiente.idSolicitud,

            estado:
              solicitudAirbnbPendiente.estado,

            fechaSolicitud:
              solicitudAirbnbPendiente.fechaSolicitud,

            cambiosSolicitados:
              solicitudAirbnbPendiente.cambiosSolicitados,
          }
        : null,

    operacionBookingPendiente:
      operacionBookingPendiente
        ? {
            idOperacion:
              operacionBookingPendiente.idOperacion,

            tipo:
              operacionBookingPendiente.tipo,

            estado:
              operacionBookingPendiente.estado,

            fechaOperacion:
              operacionBookingPendiente.fechaOperacion,

            cambiosSolicitados:
              operacionBookingPendiente.cambiosSolicitados ||
              null,
          }
        : null,
  };
}

  // =========================================================
  // RESERVAS MANUALES
  // =========================================================

  async crearReserva(datos) {
  await this
    .finalizarReservasVencidas();

  const {
    idPropiedad,
    idHuesped,
    fechaIngreso,
    fechaEgreso,
    cantidadHuespedes,
    montoEstimado,
  } = datos;

  // =========================================================
  // DATOS OBLIGATORIOS
  // =========================================================

  if (
    !idPropiedad ||
    !idHuesped ||
    !fechaIngreso ||
    !fechaEgreso
  ) {
    throw new Error(
      "Faltan datos obligatorios para registrar la reserva."
    );
  }

  // =========================================================
  // VALIDACIÓN DE FECHAS
  // =========================================================

  if (
    new Date(fechaEgreso) <=
    new Date(fechaIngreso)
  ) {
    throw new Error(
      "La fecha de egreso debe ser posterior a la fecha de ingreso."
    );
  }

  // =========================================================
  // PROPIEDAD
  // =========================================================

  const propiedad =
    await ReservaRepository.obtenerPropiedadPorId(
      idPropiedad
    );

  if (!propiedad) {
    throw new Error(
      "La propiedad seleccionada no existe."
    );
  }

  if (propiedad.estado !== "Activa") {
    throw new Error(
      "La propiedad no se encuentra disponible para recibir reservas."
    );
  }

  // =========================================================
  // HUÉSPED
  // =========================================================

  const huesped =
    await ReservaRepository.obtenerHuespedPorId(
      idHuesped
    );

  if (!huesped) {
    throw new Error(
      "El huésped seleccionado no existe."
    );
  }

  // =========================================================
  // CAPACIDAD
  // =========================================================

  const cantidad =
    Number(cantidadHuespedes) || 1;

  if (
    cantidad >
    propiedad.capacidadMaxima
  ) {
    throw new Error(
      "La cantidad de huéspedes supera la capacidad máxima de la propiedad."
    );
  }

  // =========================================================
  // DISPONIBILIDAD
  // =========================================================

  const existeConflicto =
    await ReservaRepository.existeConflictoFechas(
      idPropiedad,
      fechaIngreso,
      fechaEgreso
    );

  if (existeConflicto) {
    throw new Error(
      "La propiedad ya posee una reserva en ese rango de fechas."
    );
  }

  // =========================================================
  // CREAR RESERVA EN AZURE SQL
  // =========================================================

  const montoFinal =
    montoEstimado !== undefined &&
    montoEstimado !== null &&
    montoEstimado !== ""
      ? Number(montoEstimado)
      : 0;

  const reservaCreada =
    await ReservaRepository.crearReservaManual({
      idPropiedad,
      idHuesped,
      fechaIngreso,
      fechaEgreso,
      cantidadHuespedes: cantidad,
      montoEstimado:
        montoFinal,
    });

  // =========================================================
  // TIMELINE - RESERVA CREADA
  // =========================================================
  //
  // Este es el primer evento persistido del historial real.
  // No generamos eventos retroactivos para reservas antiguas.
  // =========================================================

  await this.registrarEventoReserva({
    idReserva:
      reservaCreada.idReserva,

    tipo:
      "RESERVA_CREADA",

    titulo:
      "Reserva creada en HostFlow",

    descripcion:
      "La reserva fue registrada manualmente desde HostFlow.",

    origen:
      "Manual",

    datosJson: {
      canal:
        "Manual",

      estado:
        "Confirmada",

      idPropiedad:
        Number(idPropiedad),

      propiedad:
        propiedad.nombre,

      idHuesped:
        Number(idHuesped),

      huesped:
        `${huesped.nombre} ${huesped.apellido}`,

      fechaIngreso,

      fechaEgreso,

      cantidadHuespedes:
        cantidad,

      montoEstimado:
        montoFinal,
    },
  });

  /*
   * Volvemos a obtenerla mediante el Service
   * para agregar tipoGestion, acciones disponibles,
   * operaciones de canal, etc.
   */
  return await this.obtenerReservaPorId(
    reservaCreada.idReserva
  );
}

  async modificarReserva(idReserva, datos) {
  await this
    .finalizarReservasVencidas();

  // =========================================================
  // OBTENER RESERVA DESDE AZURE SQL
  // =========================================================

  const reserva =
    await ReservaRepository.obtenerPorId(
      idReserva
    );

  if (!reserva) {
    throw new Error(
      "La reserva no existe."
    );
  }

  // =========================================================
  // SOLO LAS RESERVAS MANUALES SE EDITAN DIRECTAMENTE
  // =========================================================

  if (
    !ChannelService.permiteEdicionDirecta(
      reserva.canal
    )
  ) {
    throw new Error(
      `Las reservas provenientes de ${reserva.canal} no pueden modificarse directamente desde HostFlow.`
    );
  }

  if (
    reserva.estado === "Cancelada" ||
    reserva.estado === "Finalizada"
  ) {
    throw new Error(
      "La reserva ya no admite modificaciones."
    );
  }

  // =========================================================
  // NUEVOS DATOS
  // =========================================================

  const nuevaFechaIngreso =
    datos.fechaIngreso ||
    reserva.fechaIngreso;

  const nuevaFechaEgreso =
    datos.fechaEgreso ||
    reserva.fechaEgreso;

  const nuevoEstado =
    datos.estado ||
    reserva.estado;

  const nuevoMonto =
    datos.montoEstimado !== undefined &&
    datos.montoEstimado !== null &&
    datos.montoEstimado !== ""
      ? Number(datos.montoEstimado)
      : Number(reserva.montoEstimado);

  // =========================================================
  // VALIDACIONES
  // =========================================================

  if (
    new Date(nuevaFechaEgreso) <=
    new Date(nuevaFechaIngreso)
  ) {
    throw new Error(
      "La fecha de egreso debe ser posterior a la fecha de ingreso."
    );
  }

  if (
    Number.isNaN(nuevoMonto) ||
    nuevoMonto < 0
  ) {
    throw new Error(
      "El monto estimado no es válido."
    );
  }

  // =========================================================
  // CONFLICTO DE FECHAS EN AZURE SQL
  // =========================================================

  const existeConflicto =
    await ReservaRepository.existeConflictoFechas(
      reserva.idPropiedad,
      nuevaFechaIngreso,
      nuevaFechaEgreso,
      reserva.idReserva
    );

  if (existeConflicto) {
    throw new Error(
      "La modificación genera un conflicto de fechas."
    );
  }

  // =========================================================
  // ACTUALIZAR EN AZURE SQL
  // =========================================================

  await ReservaRepository.actualizarReservaManual(
    reserva.idReserva,
    {
      fechaIngreso: nuevaFechaIngreso,
      fechaEgreso: nuevaFechaEgreso,
      estado: nuevoEstado,
      montoEstimado: nuevoMonto,
    }
  );

  // =========================================================
  // TIMELINE - RESERVA MODIFICADA
  // =========================================================

  const camposModificados = [];

  if (
    reserva.fechaIngreso !==
    nuevaFechaIngreso
  ) {
    camposModificados.push(
      "fechaIngreso"
    );
  }

  if (
    reserva.fechaEgreso !==
    nuevaFechaEgreso
  ) {
    camposModificados.push(
      "fechaEgreso"
    );
  }

  if (
    reserva.estado !==
    nuevoEstado
  ) {
    camposModificados.push(
      "estado"
    );
  }

  if (
    Number(
      reserva.montoEstimado
    ) !==
    Number(nuevoMonto)
  ) {
    camposModificados.push(
      "montoEstimado"
    );
  }

  if (
    camposModificados.length > 0
  ) {
    await this.registrarEventoReserva({
      idReserva:
        reserva.idReserva,

      tipo:
        "RESERVA_MODIFICADA",

      titulo:
        "Reserva modificada en HostFlow",

      descripcion:
        "Se actualizaron datos de la reserva manual.",

      origen:
        "Manual",

      datosJson: {
        camposModificados,

        antes: {
          fechaIngreso:
            reserva.fechaIngreso,

          fechaEgreso:
            reserva.fechaEgreso,

          estado:
            reserva.estado,

          montoEstimado:
            Number(
              reserva.montoEstimado
            ),
        },

        despues: {
          fechaIngreso:
            nuevaFechaIngreso,

          fechaEgreso:
            nuevaFechaEgreso,

          estado:
            nuevoEstado,

          montoEstimado:
            Number(
              nuevoMonto
            ),
        },
      },
    });
  }

  // Volvemos a obtenerla para agregar
  // tipoGestion, accionesDisponibles, etc.
  return await this.obtenerReservaPorId(
    reserva.idReserva
  );
}

  async cancelarReserva(idReserva) {
  await this
    .finalizarReservasVencidas();

  // =========================================================
  // OBTENER RESERVA DESDE AZURE SQL
  // =========================================================

  const reserva =
    await ReservaRepository.obtenerPorId(
      idReserva
    );

  if (!reserva) {
    throw new Error(
      "La reserva no existe."
    );
  }

  // =========================================================
  // VALIDAR QUE EL CANAL PERMITA CANCELACIÓN DIRECTA
  // =========================================================

  if (
    !ChannelService.permiteCancelacionDirecta(
      reserva.canal
    )
  ) {
    throw new Error(
      `Las reservas provenientes de ${reserva.canal} no pueden cancelarse directamente desde HostFlow.`
    );
  }

  // =========================================================
  // VALIDAR ESTADO
  // =========================================================

  if (reserva.estado === "Cancelada") {
    throw new Error(
      "La reserva ya se encuentra cancelada."
    );
  }

  if (reserva.estado === "Finalizada") {
    throw new Error(
      "Una reserva finalizada no puede cancelarse."
    );
  }

  // =========================================================
  // CANCELAR EN AZURE SQL
  // =========================================================

  await ReservaRepository.cancelarReservaManual(
    reserva.idReserva
  );

  // =========================================================
  // TIMELINE - RESERVA CANCELADA
  // =========================================================

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "RESERVA_CANCELADA",

    titulo:
      "Reserva cancelada en HostFlow",

    descripcion:
      "La reserva manual fue cancelada desde HostFlow.",

    origen:
      "Manual",

    datosJson: {
      estadoAnterior:
        reserva.estado,

      estadoNuevo:
        "Cancelada",

      fechaIngreso:
        reserva.fechaIngreso,

      fechaEgreso:
        reserva.fechaEgreso,

      montoEstimado:
        Number(
          reserva.montoEstimado
        ),
    },
  });

  // La volvemos a obtener para que regrese con
  // tipoGestion, accionesDisponibles, etc.
  return await this.obtenerReservaPorId(
    reserva.idReserva
  );
}

  // =========================================================
  // AIRBNB
  // =========================================================

  async proponerCambioAirbnb(
  idReserva,
  datos
) {
  await this
    .finalizarReservasVencidas();

  // =========================================================
  // OBTENER RESERVA DESDE AZURE SQL
  // =========================================================

  const reserva =
    await ReservaRepository.obtenerPorId(
      idReserva
    );

  if (!reserva) {
    throw new Error(
      "La reserva no existe."
    );
  }

  if (reserva.canal !== "Airbnb") {
    throw new Error(
      "La reserva seleccionada no pertenece a Airbnb."
    );
  }

  if (
    reserva.estado === "Cancelada" ||
    reserva.estado === "Finalizada"
  ) {
    throw new Error(
      "La reserva ya no admite propuestas de cambio."
    );
  }

  // =========================================================
  // EVITAR DOS PROPUESTAS PENDIENTES
  // =========================================================

  const solicitudPendiente =
    AirbnbChannelService
      .obtenerSolicitudPendientePorReserva(
        reserva.idReserva
      );

  if (solicitudPendiente) {
    throw new Error(
      "La reserva ya posee una propuesta de cambio pendiente en Airbnb."
    );
  }

  // =========================================================
  // DATOS PROPUESTOS
  // =========================================================

  const nuevaFechaIngreso =
    datos.fechaIngreso ||
    reserva.fechaIngreso;

  const nuevaFechaEgreso =
    datos.fechaEgreso ||
    reserva.fechaEgreso;

  const nuevaCantidadHuespedes =
    datos.cantidadHuespedes !==
      undefined
      ? Number(
          datos.cantidadHuespedes
        )
      : Number(
          reserva.cantidadHuespedes
        );

  const nuevoMonto =
    datos.montoEstimado !== undefined
      ? Number(
          datos.montoEstimado
        )
      : Number(
          reserva.montoEstimado
        );

  // =========================================================
  // VALIDACIONES
  // =========================================================

  if (
    new Date(nuevaFechaEgreso) <=
    new Date(nuevaFechaIngreso)
  ) {
    throw new Error(
      "La fecha de egreso debe ser posterior a la fecha de ingreso."
    );
  }

  if (
    Number.isNaN(
      nuevaCantidadHuespedes
    ) ||
    nuevaCantidadHuespedes <= 0
  ) {
    throw new Error(
      "La cantidad de huéspedes no es válida."
    );
  }

  if (
    Number.isNaN(nuevoMonto) ||
    nuevoMonto < 0
  ) {
    throw new Error(
      "El monto propuesto no es válido."
    );
  }

  // =========================================================
  // OBTENER PROPIEDAD REAL DESDE AZURE
  // =========================================================

  const propiedad =
    await ReservaRepository
      .obtenerPropiedadPorId(
        reserva.idPropiedad
      );

  if (!propiedad) {
    throw new Error(
      "La propiedad asociada a la reserva no existe."
    );
  }

  if (
    nuevaCantidadHuespedes >
    propiedad.capacidadMaxima
  ) {
    throw new Error(
      "La cantidad de huéspedes supera la capacidad máxima de la propiedad."
    );
  }

  // =========================================================
  // VALIDAR CONFLICTOS CONTRA AZURE SQL
  // =========================================================

  const existeConflicto =
    await ReservaRepository
      .existeConflictoFechas(
        reserva.idPropiedad,
        nuevaFechaIngreso,
        nuevaFechaEgreso,
        reserva.idReserva
      );

  if (existeConflicto) {
    throw new Error(
      "El cambio propuesto genera un conflicto con otra reserva."
    );
  }

  // =========================================================
  // SIMULACIÓN DE ENVÍO A AIRBNB
  // =========================================================

  const solicitud =
    AirbnbChannelService
      .proponerCambio(
        reserva,
        {
          fechaIngreso:
            nuevaFechaIngreso,

          fechaEgreso:
            nuevaFechaEgreso,

          cantidadHuespedes:
            nuevaCantidadHuespedes,

          montoEstimado:
            nuevoMonto,
        }
      );

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "PROPUESTA_CAMBIO_ENVIADA",

    titulo:
      "Propuesta de cambio enviada a Airbnb",

    descripcion:
      "HostFlow envió una propuesta de modificación para la reserva de Airbnb.",

    origen:
      "HostFlow",

    datosJson: {
      canal:
        "Airbnb",

      idSolicitud:
        solicitud.idSolicitud,

      antes: {
        fechaIngreso:
          reserva.fechaIngreso,

        fechaEgreso:
          reserva.fechaEgreso,

        cantidadHuespedes:
          Number(
            reserva.cantidadHuespedes
          ),

        montoEstimado:
          Number(
            reserva.montoEstimado
          ),
      },

      propuesto: {
        fechaIngreso:
          nuevaFechaIngreso,

        fechaEgreso:
          nuevaFechaEgreso,

        cantidadHuespedes:
          nuevaCantidadHuespedes,

        montoEstimado:
          nuevoMonto,
      },
    },
  });

  return solicitud;
}

  async procesarAceptacionAirbnb(
  idSolicitud
) {
  // =========================================================
  // OBTENER SOLICITUD SIMULADA DE AIRBNB
  // =========================================================

  const solicitud =
    AirbnbChannelService
      .obtenerSolicitudPorId(
        idSolicitud
      );

  if (!solicitud) {
    throw new Error(
      "La solicitud de Airbnb no existe."
    );
  }

  if (
    solicitud.estado !== "Pendiente"
  ) {
    throw new Error(
      "La solicitud ya fue procesada."
    );
  }

  // =========================================================
  // OBTENER RESERVA REAL DESDE AZURE SQL
  // =========================================================

  const reserva =
    await ReservaRepository.obtenerPorId(
      solicitud.idReserva
    );

  if (!reserva) {
    throw new Error(
      "La reserva asociada a la solicitud no existe."
    );
  }

  if (reserva.canal !== "Airbnb") {
    throw new Error(
      "La reserva asociada no pertenece a Airbnb."
    );
  }

  const cambios =
    solicitud.cambiosSolicitados;

  if (!cambios) {
    throw new Error(
      "La solicitud no contiene cambios para sincronizar."
    );
  }

  // =========================================================
  // DETECTAR CONFLICTO
  // =========================================================
  //
  // IMPORTANTE:
  // Airbnb ya confirmó el cambio.
  //
  // Si HostFlow detecta una superposición, NO debemos
  // rechazar la modificación externa.
  //
  // La sincronizamos igualmente y luego advertimos.
  // =========================================================

  const conflictoDetectado =
    await ReservaRepository
      .existeConflictoFechas(
        reserva.idPropiedad,
        cambios.fechaIngreso,
        cambios.fechaEgreso,
        reserva.idReserva
      );

  // =========================================================
  // SINCRONIZAR RESERVA EN AZURE SQL
  // =========================================================

  await ReservaRepository
    .sincronizarCambioExterno(
      reserva.idReserva,
      {
        fechaIngreso:
          cambios.fechaIngreso,

        fechaEgreso:
          cambios.fechaEgreso,

        cantidadHuespedes:
          cambios.cantidadHuespedes,

        montoEstimado:
          cambios.montoEstimado,
      }
    );

  // =========================================================
  // MARCAR SOLICITUD SIMULADA COMO ACEPTADA
  // =========================================================

  const solicitudAceptada =
    AirbnbChannelService
      .marcarSolicitudAceptada(
        idSolicitud
      );

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "PROPUESTA_CAMBIO_ACEPTADA",

    titulo:
      "Airbnb aceptó la propuesta de cambio",

    descripcion:
      "Airbnb confirmó la propuesta y HostFlow sincronizó los nuevos datos de la reserva.",

    origen:
      "Airbnb",

    datosJson: {
      canal:
        "Airbnb",

      idSolicitud:
        Number(idSolicitud),

      conflictoDetectado,

      antes: {
        fechaIngreso:
          reserva.fechaIngreso,

        fechaEgreso:
          reserva.fechaEgreso,

        cantidadHuespedes:
          Number(
            reserva.cantidadHuespedes
          ),

        montoEstimado:
          Number(
            reserva.montoEstimado
          ),
      },

      despues: {
        fechaIngreso:
          cambios.fechaIngreso,

        fechaEgreso:
          cambios.fechaEgreso,

        cantidadHuespedes:
          Number(
            cambios.cantidadHuespedes
          ),

        montoEstimado:
          Number(
            cambios.montoEstimado
          ),
      },
    },
  });

  if (conflictoDetectado) {
    await this.registrarConflictoReserva({
      idReserva:
        reserva.idReserva,

      canal:
        "Airbnb",

      fechaIngreso:
        cambios.fechaIngreso,

      fechaEgreso:
        cambios.fechaEgreso,

      contexto:
        "PROPUESTA_CAMBIO_ACEPTADA",

      idExterno:
        reserva.idExterno,

      idSolicitud:
        Number(idSolicitud),
    });
  }

  // =========================================================
  // OBTENER LA RESERVA YA ACTUALIZADA
  // =========================================================

  const reservaActualizada =
    await this.obtenerReservaPorId(
      reserva.idReserva
    );

  return {
    solicitud:
      solicitudAceptada,

    reserva:
      reservaActualizada,

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "El cambio fue confirmado por Airbnb, pero genera un conflicto con otra reserva en HostFlow."
        : null,
  };
}

  async procesarRechazoAirbnb(
  idSolicitud
) {
  // =========================================================
  // OBTENER SOLICITUD SIMULADA DE AIRBNB
  // =========================================================

  const solicitud =
    AirbnbChannelService
      .obtenerSolicitudPorId(
        idSolicitud
      );

  if (!solicitud) {
    throw new Error(
      "La solicitud de Airbnb no existe."
    );
  }

  if (
    solicitud.estado !== "Pendiente"
  ) {
    throw new Error(
      "La solicitud ya fue procesada."
    );
  }

  // =========================================================
  // OBTENER RESERVA REAL DESDE AZURE SQL
  // =========================================================

  const reserva =
    await ReservaRepository.obtenerPorId(
      solicitud.idReserva
    );

  if (!reserva) {
    throw new Error(
      "La reserva asociada a la solicitud no existe."
    );
  }

  if (reserva.canal !== "Airbnb") {
    throw new Error(
      "La reserva asociada no pertenece a Airbnb."
    );
  }

  // =========================================================
  // AIRBNB RECHAZA LA PROPUESTA
  // =========================================================
  //
  // No modificamos absolutamente nada en Azure.
  // La reserva original permanece como estaba.
  // =========================================================

  const solicitudRechazada =
    AirbnbChannelService
      .marcarSolicitudRechazada(
        idSolicitud
      );

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "PROPUESTA_CAMBIO_RECHAZADA",

    titulo:
      "Airbnb rechazó la propuesta de cambio",

    descripcion:
      "La propuesta fue rechazada por Airbnb y la reserva original permaneció sin cambios.",

    origen:
      "Airbnb",

    datosJson: {
      canal:
        "Airbnb",

      idSolicitud:
        Number(idSolicitud),

      cambiosPropuestos:
        solicitud.cambiosSolicitados ||
        null,
    },
  });

  const reservaActual =
    await this.obtenerReservaPorId(
      reserva.idReserva
    );

  return {
    solicitud:
      solicitudRechazada,

    reserva:
      reservaActual,
  };
}

  // =========================================================
  // BOOKING
  // =========================================================

  async cambiarEstadiaBooking(
  idReserva,
  datos
) {
  await this
    .finalizarReservasVencidas();

  const reserva =
    await ReservaRepository.obtenerPorId(
      idReserva
    );

  if (!reserva) {
    throw new Error(
      "La reserva no existe."
    );
  }

  if (reserva.canal !== "Booking") {
    throw new Error(
      "La reserva seleccionada no pertenece a Booking."
    );
  }

  if (
    reserva.estado === "Cancelada" ||
    reserva.estado === "Finalizada" ||
    reserva.estado === "No show"
  ) {
    throw new Error(
      "La reserva ya no admite cambios de estadía."
    );
  }

  const operacionPendiente =
    BookingChannelService
      .obtenerOperacionPendientePorReserva(
        reserva.idReserva
      );

  if (operacionPendiente) {
    throw new Error(
      "La reserva ya posee una operación pendiente de sincronización con Booking."
    );
  }

  const nuevaFechaEgreso =
    datos.fechaEgreso;

  const nuevoMonto =
    Number(datos.montoEstimado);

  if (!nuevaFechaEgreso) {
    throw new Error(
      "Debe indicar la nueva fecha de egreso."
    );
  }

  if (
    new Date(nuevaFechaEgreso) <=
    new Date(reserva.fechaIngreso)
  ) {
    throw new Error(
      "La fecha de egreso debe ser posterior a la fecha de ingreso."
    );
  }

  if (
    Number.isNaN(nuevoMonto) ||
    nuevoMonto < 0
  ) {
    throw new Error(
      "El monto indicado no es válido."
    );
  }

  const existeConflicto =
    await ReservaRepository
      .existeConflictoFechas(
        reserva.idPropiedad,
        reserva.fechaIngreso,
        nuevaFechaEgreso,
        reserva.idReserva
      );

  if (existeConflicto) {
    throw new Error(
      "El cambio de estadía genera un conflicto con otra reserva."
    );
  }

  const operacion =
    BookingChannelService
      .cambiarEstadia(
        reserva,
        {
          fechaEgreso:
            nuevaFechaEgreso,

          montoEstimado:
            nuevoMonto,
        }
      );

  await ReservaRepository
    .actualizarEstadoSincronizacion(
      reserva.idReserva,
      "Pendiente"
    );

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "CAMBIO_ESTADIA_ENVIADO",

    titulo:
      "Cambio de estadía enviado a Booking",

    descripcion:
      "HostFlow envió una solicitud de cambio y quedó pendiente de sincronización con Booking.",

    origen:
      "HostFlow",

    datosJson: {
      canal:
        "Booking",

      idOperacion:
        operacion.idOperacion,

      antes: {
        fechaEgreso:
          reserva.fechaEgreso,

        montoEstimado:
          Number(
            reserva.montoEstimado
          ),
      },

      solicitado: {
        fechaEgreso:
          nuevaFechaEgreso,

        montoEstimado:
          nuevoMonto,
      },
    },
  });

  return operacion;
}

async reportarNoShowBooking(
  idReserva,
  datos = {}
) {
  await this
    .finalizarReservasVencidas();

  const reserva =
    await ReservaRepository.obtenerPorId(
      idReserva
    );

  if (!reserva) {
    throw new Error(
      "La reserva no existe."
    );
  }

  if (reserva.canal !== "Booking") {
    throw new Error(
      "La reserva seleccionada no pertenece a Booking."
    );
  }

  const operacionPendiente =
    BookingChannelService
      .obtenerOperacionPendientePorReserva(
        reserva.idReserva
      );

  if (operacionPendiente) {
    throw new Error(
      "La reserva ya posee una operación pendiente de sincronización con Booking."
    );
  }

  if (
    reserva.estado === "Cancelada" ||
    reserva.estado === "Finalizada" ||
    reserva.estado === "No show"
  ) {
    throw new Error(
      "La reserva no admite ser reportada como no-show."
    );
  }

  const condonarCargos =
    datos.condonarCargos === true;

  const operacion =
    BookingChannelService
      .reportarNoShow(
        reserva,
        condonarCargos
      );

  await ReservaRepository
    .actualizarEstadoSincronizacion(
      reserva.idReserva,
      "Pendiente"
    );

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "REPORTE_NO_SHOW_ENVIADO",

    titulo:
      "No-show reportado a Booking",

    descripcion:
      "HostFlow envió el reporte de no-show y quedó pendiente de confirmación por Booking.",

    origen:
      "HostFlow",

    datosJson: {
      canal:
        "Booking",

      idOperacion:
        operacion.idOperacion,

      estadoActual:
        reserva.estado,

      condonarCargos,

      fechaIngreso:
        reserva.fechaIngreso,

      fechaEgreso:
        reserva.fechaEgreso,
    },
  });

  return operacion;
}

async procesarSincronizacionBooking(
  idOperacion
) {
  const operacion =
    BookingChannelService
      .obtenerOperacionPorId(
        idOperacion
      );

  if (!operacion) {
    throw new Error(
      "La operación de Booking no existe."
    );
  }

  if (
    operacion.estado !== "Encolada" &&
    operacion.estado !== "Enviada"
  ) {
    throw new Error(
      "La operación de Booking ya fue procesada."
    );
  }

  const reserva =
    await ReservaRepository.obtenerPorId(
      operacion.idReserva
    );

  if (!reserva) {
    throw new Error(
      "La reserva asociada a la operación no existe."
    );
  }

  if (reserva.canal !== "Booking") {
    throw new Error(
      "La reserva asociada no pertenece a Booking."
    );
  }

  let conflictoDetectado = false;
  let eventoTimeline = null;

  if (
    operacion.tipo ===
    "CAMBIO_ESTADIA"
  ) {
    const cambios =
      operacion.cambiosSolicitados;

    if (!cambios) {
      throw new Error(
        "La operación no contiene los cambios de estadía."
      );
    }

    conflictoDetectado =
      await ReservaRepository
        .existeConflictoFechas(
          reserva.idPropiedad,
          reserva.fechaIngreso,
          cambios.fechaEgreso,
          reserva.idReserva
        );

    await ReservaRepository
      .sincronizarCambioExterno(
        reserva.idReserva,
        {
          fechaIngreso:
            reserva.fechaIngreso,

          fechaEgreso:
            cambios.fechaEgreso,

          cantidadHuespedes:
            reserva.cantidadHuespedes,

          montoEstimado:
            cambios.montoEstimado,
        }
      );

    eventoTimeline = {
      tipo:
        "CAMBIO_ESTADIA_SINCRONIZADO",

      titulo:
        "Booking confirmó el cambio de estadía",

      descripcion:
        "Booking procesó la operación y HostFlow sincronizó los nuevos datos de la reserva.",

      datosJson: {
        canal:
          "Booking",

        idOperacion:
          Number(idOperacion),

        conflictoDetectado,

        antes: {
          fechaIngreso:
            reserva.fechaIngreso,

          fechaEgreso:
            reserva.fechaEgreso,

          montoEstimado:
            Number(
              reserva.montoEstimado
            ),
        },

        despues: {
          fechaIngreso:
            reserva.fechaIngreso,

          fechaEgreso:
            cambios.fechaEgreso,

          montoEstimado:
            Number(
              cambios.montoEstimado
            ),
        },
      },
    };
  } else if (
    operacion.tipo === "NO_SHOW"
  ) {
    await ReservaRepository
      .sincronizarEstadoExterno(
        reserva.idReserva,
        "No show"
      );

    eventoTimeline = {
      tipo:
        "NO_SHOW_CONFIRMADO",

      titulo:
        "Booking confirmó el no-show",

      descripcion:
        "Booking confirmó el reporte y HostFlow actualizó el estado de la reserva.",

      datosJson: {
        canal:
          "Booking",

        idOperacion:
          Number(idOperacion),

        estadoAnterior:
          reserva.estado,

        estadoNuevo:
          "No show",

        condonarCargos:
          operacion.condonarCargos ??
          operacion.datos?.condonarCargos ??
          null,

        fechaIngreso:
          reserva.fechaIngreso,

        fechaEgreso:
          reserva.fechaEgreso,
      },
    };
  } else {
    throw new Error(
      "El tipo de operación de Booking no es válido."
    );
  }

  const operacionSincronizada =
    BookingChannelService
      .marcarOperacionSincronizada(
        idOperacion
      );

  if (eventoTimeline) {
    await this.registrarEventoReserva({
      idReserva:
        reserva.idReserva,

      tipo:
        eventoTimeline.tipo,

      titulo:
        eventoTimeline.titulo,

      descripcion:
        eventoTimeline.descripcion,

      origen:
        "Booking",

      datosJson:
        eventoTimeline.datosJson,
    });
  }

  if (
    conflictoDetectado &&
    operacion.tipo === "CAMBIO_ESTADIA"
  ) {
    await this.registrarConflictoReserva({
      idReserva:
        reserva.idReserva,

      canal:
        "Booking",

      fechaIngreso:
        reserva.fechaIngreso,

      fechaEgreso:
        operacion.cambiosSolicitados
          ?.fechaEgreso,

      contexto:
        "CAMBIO_ESTADIA_SINCRONIZADO",

      idExterno:
        reserva.idExterno,

      idOperacion:
        Number(idOperacion),
    });
  }

  const reservaActualizada =
    await this.obtenerReservaPorId(
      reserva.idReserva
    );

  return {
    operacion:
      operacionSincronizada,

    reserva:
      reservaActualizada,

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "Booking confirmó el cambio, pero la nueva estadía genera un conflicto con otra reserva en HostFlow."
        : null,
  };
}

// =========================================================
// BOOKING - EVENTOS ENTRANTES
// =========================================================

async procesarEventoBooking(
  idEvento
) {
  // =========================================================
  // OBTENER EVENTO SIMULADO DE BOOKING
  // =========================================================

  const evento =
    BookingInboundService
      .obtenerEventoPorId(
        idEvento
      );

  if (!evento) {
    throw new Error(
      "El evento de Booking no existe."
    );
  }

  // =========================================================
  // EVENTO YA PROCESADO
  // =========================================================
  //
  // Si Booking vuelve a entregar exactamente
  // el mismo evento, no repetimos la operación.
  // =========================================================

  if (
    evento.estado === "Procesado"
  ) {
    const reservaExistente =
      await ReservaRepository
        .obtenerPorCanalEIdExterno(
          "Booking",
          evento.idExterno
        );

    const reservaActual =
      reservaExistente
        ? await this.obtenerReservaPorId(
            reservaExistente.idReserva
          )
        : null;

    return {
      evento,

      reserva:
        reservaActual,

      reprocesado: true,

      conflictoDetectado: false,

      advertencia:
        "El evento ya había sido procesado anteriormente.",
    };
  }

  // =========================================================
  // PROCESAR SEGÚN TIPO
  // =========================================================

  switch (evento.tipo) {
    case "NUEVA_RESERVA":
      return await this
        .procesarNuevaReservaBooking(
          evento
        );

    case "RESERVA_MODIFICADA":
      return await this
        .procesarModificacionReservaBooking(
          evento
        );

    case "RESERVA_CANCELADA":
      return await this
        .procesarCancelacionReservaBooking(
          evento
        );

    default:
      throw new Error(
        "El tipo de evento recibido desde Booking no es válido."
      );
  }
}

async procesarNuevaReservaBooking(
  evento
) {
  // =========================================================
  // IDEMPOTENCIA - BUSCAR ID EXTERNO EN AZURE
  // =========================================================

  const reservaExistente =
    await ReservaRepository
      .obtenerPorCanalEIdExterno(
        "Booking",
        evento.idExterno
      );

  if (reservaExistente) {
    const eventoProcesado =
      BookingInboundService
        .marcarEventoProcesado(
          evento.idEvento
        );

    const reservaActual =
      await this.obtenerReservaPorId(
        reservaExistente.idReserva
      );

    return {
      evento:
        eventoProcesado,

      reserva:
        reservaActual,

      duplicada: true,

      conflictoDetectado: false,

      advertencia:
        "La reserva ya existía en HostFlow. No se creó un duplicado.",
    };
  }

  // =========================================================
  // DATOS RECIBIDOS DESDE BOOKING
  // =========================================================

  const datos =
    evento.datos;

  if (!datos) {
    throw new Error(
      "El evento de Booking no contiene los datos de la reserva."
    );
  }

  // =========================================================
  // VALIDAR PROPIEDAD
  // =========================================================

  const propiedad =
    await ReservaRepository
      .obtenerPropiedadPorId(
        datos.idPropiedad
      );

  if (!propiedad) {
    throw new Error(
      "La propiedad asociada a la reserva de Booking no existe en HostFlow."
    );
  }

  // =========================================================
  // VALIDAR FECHAS
  // =========================================================

  if (
    !datos.fechaIngreso ||
    !datos.fechaEgreso
  ) {
    throw new Error(
      "Booking no proporcionó las fechas necesarias para procesar la reserva."
    );
  }

  if (
    new Date(datos.fechaEgreso) <=
    new Date(datos.fechaIngreso)
  ) {
    throw new Error(
      "Booking envió un rango de fechas inválido."
    );
  }

  // =========================================================
  // VALIDAR CANTIDAD DE HUÉSPEDES
  // =========================================================

  const cantidadHuespedes =
    Number(datos.cantidadHuespedes) ||
    1;

  if (
    cantidadHuespedes >
    propiedad.capacidadMaxima
  ) {
    throw new Error(
      "La reserva recibida de Booking supera la capacidad máxima registrada para la propiedad."
    );
  }

  // =========================================================
  // BUSCAR / CREAR HUÉSPED EN AZURE
  // =========================================================

  const nombreHuesped =
    datos.nombreHuesped ||
    "Huésped";

  const apellidoHuesped =
    datos.apellidoHuesped ||
    "Booking";

  let huesped =
    await ReservaRepository
      .obtenerHuespedPorNombreYApellido(
        nombreHuesped,
        apellidoHuesped
      );

  if (!huesped) {
    huesped =
      await ReservaRepository
        .crearHuespedExterno({
          nombre:
            nombreHuesped,

          apellido:
            apellidoHuesped,

          email:
            datos.emailHuesped ||
            null,

          telefono:
            datos.telefonoHuesped ||
            null,

          documento:
            datos.documentoHuesped ||
            null,

          nacionalidad:
            datos.nacionalidadHuesped ||
            null,

          origenRegistro:
            "Booking",
        });
  }

  // =========================================================
  // DETECTAR CONFLICTO
  // =========================================================
  //
  // Booking ya es la fuente de esta reserva.
  //
  // Si existe un conflicto, HostFlow NO rechaza
  // el evento. Registra igualmente la reserva y
  // luego informa la advertencia.
  // =========================================================

  const conflictoDetectado =
    await ReservaRepository
      .existeConflictoFechas(
        propiedad.idPropiedad,
        datos.fechaIngreso,
        datos.fechaEgreso
      );

  // =========================================================
  // CREAR RESERVA BOOKING EN AZURE
  // =========================================================

  const nuevaReserva =
    await ReservaRepository
      .crearReservaExterna({
        idPropiedad:
          propiedad.idPropiedad,

        idHuesped:
          huesped.idHuesped,

        canal:
          "Booking",

        estado:
          datos.estadoReserva ||
          "Confirmada",

        fechaIngreso:
          datos.fechaIngreso,

        fechaEgreso:
          datos.fechaEgreso,

        cantidadHuespedes,

        montoEstimado:
          Number(
            datos.montoEstimado
          ) || 0,

        idExterno:
          evento.idExterno,
      });


  await this.registrarEventoReserva({
    idReserva:
      nuevaReserva.idReserva,

    tipo:
      "RESERVA_RECIBIDA",

    titulo:
      "Reserva recibida desde Booking",

    descripcion:
      "HostFlow recibió y sincronizó una nueva reserva confirmada desde Booking.",

    origen:
      "Booking",

    datosJson: {
      canal:
        "Booking",

      idExterno:
        evento.idExterno,

      idEventoExterno:
        evento.idEvento,

      estado:
        datos.estadoReserva ||
        "Confirmada",

      propiedad:
        propiedad.nombre,

      huesped:
        `${huesped.nombre} ${huesped.apellido}`,

      fechaIngreso:
        datos.fechaIngreso,

      fechaEgreso:
        datos.fechaEgreso,

      cantidadHuespedes,

      montoEstimado:
        Number(
          datos.montoEstimado
        ) || 0,

      conflictoDetectado,
    },
  });

if (conflictoDetectado) {
    await this.registrarConflictoReserva({
      idReserva:
        nuevaReserva.idReserva,

      canal:
        "Booking",

      fechaIngreso:
        datos.fechaIngreso,

      fechaEgreso:
        datos.fechaEgreso,

      contexto:
        "RESERVA_RECIBIDA",

      idExterno:
        evento.idExterno,
    });
  }

  // =========================================================
  // MARCAR EVENTO COMO PROCESADO
  // =========================================================

  const eventoProcesado =
    BookingInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  // =========================================================
  // DEVOLVER RESERVA COMPLETA
  // =========================================================

  const reservaActual =
    await this.obtenerReservaPorId(
      nuevaReserva.idReserva
    );

  return {
    evento:
      eventoProcesado,

    reserva:
      reservaActual,

    duplicada: false,

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "La reserva fue recibida desde Booking, pero genera un conflicto con otra reserva existente en HostFlow."
        : null,
  };
}

async procesarModificacionReservaBooking(
  evento
) {
  const reserva =
    await ReservaRepository
      .obtenerPorCanalEIdExterno(
        "Booking",
        evento.idExterno
      );

  if (!reserva) {
    throw new Error(
      "No existe en HostFlow una reserva Booking con el identificador externo recibido."
    );
  }

  const datos =
    evento.datos;

  if (!datos) {
    throw new Error(
      "El evento de Booking no contiene datos para modificar la reserva."
    );
  }

  const nuevaFechaIngreso =
    datos.fechaIngreso ||
    reserva.fechaIngreso;

  const nuevaFechaEgreso =
    datos.fechaEgreso ||
    reserva.fechaEgreso;

  const nuevaCantidadHuespedes =
    datos.cantidadHuespedes !==
    undefined
      ? Number(
          datos.cantidadHuespedes
        )
      : Number(
          reserva.cantidadHuespedes
        );

  const nuevoMontoEstimado =
    datos.montoEstimado !==
    undefined
      ? Number(
          datos.montoEstimado
        )
      : Number(
          reserva.montoEstimado
        );

  if (
    new Date(nuevaFechaEgreso) <=
    new Date(nuevaFechaIngreso)
  ) {
    throw new Error(
      "Booking envió una modificación con fechas inválidas."
    );
  }

  if (
    nuevaCantidadHuespedes <= 0
  ) {
    throw new Error(
      "Booking envió una cantidad de huéspedes inválida."
    );
  }

  if (
    nuevoMontoEstimado < 0
  ) {
    throw new Error(
      "Booking envió un monto inválido."
    );
  }

  const conflictoDetectado =
    await ReservaRepository
      .existeConflictoFechas(
        reserva.idPropiedad,
        nuevaFechaIngreso,
        nuevaFechaEgreso,
        reserva.idReserva
      );

  await ReservaRepository
    .sincronizarReservaExterna(
      reserva.idReserva,
      {
        fechaIngreso:
          nuevaFechaIngreso,

        fechaEgreso:
          nuevaFechaEgreso,

        cantidadHuespedes:
          nuevaCantidadHuespedes,

        montoEstimado:
          nuevoMontoEstimado,

        estado:
          datos.estadoReserva ||
          null,
      }
    );

  const camposModificados = [];

  if (
    reserva.fechaIngreso !==
    nuevaFechaIngreso
  ) {
    camposModificados.push(
      "fechaIngreso"
    );
  }

  if (
    reserva.fechaEgreso !==
    nuevaFechaEgreso
  ) {
    camposModificados.push(
      "fechaEgreso"
    );
  }

  if (
    Number(
      reserva.cantidadHuespedes
    ) !==
    Number(
      nuevaCantidadHuespedes
    )
  ) {
    camposModificados.push(
      "cantidadHuespedes"
    );
  }

  if (
    Number(
      reserva.montoEstimado
    ) !==
    Number(
      nuevoMontoEstimado
    )
  ) {
    camposModificados.push(
      "montoEstimado"
    );
  }

  if (
    datos.estadoReserva &&
    reserva.estado !==
      datos.estadoReserva
  ) {
    camposModificados.push(
      "estado"
    );
  }

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "RESERVA_MODIFICADA",

    titulo:
      "Reserva modificada desde Booking",

    descripcion:
      "Booking informó cambios y HostFlow sincronizó la reserva local.",

    origen:
      "Booking",

    datosJson: {
      canal:
        "Booking",

      idExterno:
        evento.idExterno,

      idEventoExterno:
        evento.idEvento,

      conflictoDetectado,

      camposModificados,

      antes: {
        fechaIngreso:
          reserva.fechaIngreso,

        fechaEgreso:
          reserva.fechaEgreso,

        cantidadHuespedes:
          Number(
            reserva.cantidadHuespedes
          ),

        montoEstimado:
          Number(
            reserva.montoEstimado
          ),

        estado:
          reserva.estado,
      },

      despues: {
        fechaIngreso:
          nuevaFechaIngreso,

        fechaEgreso:
          nuevaFechaEgreso,

        cantidadHuespedes:
          nuevaCantidadHuespedes,

        montoEstimado:
          nuevoMontoEstimado,

        estado:
          datos.estadoReserva ||
          reserva.estado,
      },
    },
  });

if (conflictoDetectado) {
    await this.registrarConflictoReserva({
      idReserva:
        reserva.idReserva,

      canal:
        "Booking",

      fechaIngreso:
        nuevaFechaIngreso,

      fechaEgreso:
        nuevaFechaEgreso,

      contexto:
        "RESERVA_MODIFICADA",

      idExterno:
        evento.idExterno,
    });
  }

  const eventoProcesado =
    BookingInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  const reservaActualizada =
    await this.obtenerReservaPorId(
      reserva.idReserva
    );

  return {
    evento:
      eventoProcesado,

    reserva:
      reservaActualizada,

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "Booking modificó la reserva, pero los nuevos datos generan un conflicto con otra reserva en HostFlow."
        : null,
  };
}

async procesarCancelacionReservaBooking(
  evento
) {
  const reserva =
    await ReservaRepository
      .obtenerPorCanalEIdExterno(
        "Booking",
        evento.idExterno
      );

  if (!reserva) {
    throw new Error(
      "No existe en HostFlow una reserva Booking con el identificador externo recibido."
    );
  }

  await ReservaRepository
    .sincronizarEstadoExterno(
      reserva.idReserva,
      "Cancelada"
    );

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "RESERVA_CANCELADA",

    titulo:
      "Reserva cancelada desde Booking",

    descripcion:
      "Booking informó la cancelación y HostFlow sincronizó el estado de la reserva.",

    origen:
      "Booking",

    datosJson: {
      canal:
        "Booking",

      idExterno:
        evento.idExterno,

      idEventoExterno:
        evento.idEvento,

      estadoAnterior:
        reserva.estado,

      estadoNuevo:
        "Cancelada",

      fechaIngreso:
        reserva.fechaIngreso,

      fechaEgreso:
        reserva.fechaEgreso,

      montoEstimado:
        Number(
          reserva.montoEstimado
        ),
    },
  });

  const eventoProcesado =
    BookingInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  const reservaActualizada =
    await this.obtenerReservaPorId(
      reserva.idReserva
    );

  return {
    evento:
      eventoProcesado,

    reserva:
      reservaActualizada,

    conflictoDetectado: false,

    advertencia: null,
  };
}

// =========================================================
// AIRBNB - EVENTOS ENTRANTES
// =========================================================

async procesarEventoAirbnb(
  idEvento
) {
  // =========================================================
  // OBTENER EVENTO SIMULADO DE AIRBNB
  // =========================================================

  const evento =
    AirbnbInboundService
      .obtenerEventoPorId(
        idEvento
      );

  if (!evento) {
    throw new Error(
      "El evento de Airbnb no existe."
    );
  }

  // =========================================================
  // EVENTO YA PROCESADO
  // =========================================================

  if (
    evento.estado === "Procesado"
  ) {
    const reservaExistente =
      await ReservaRepository
        .obtenerPorCanalEIdExterno(
          "Airbnb",
          evento.idExterno
        );

    const reservaActual =
      reservaExistente
        ? await this.obtenerReservaPorId(
            reservaExistente.idReserva
          )
        : null;

    return {
      evento,

      reserva:
        reservaActual,

      reprocesado: true,

      conflictoDetectado: false,

      advertencia:
        "El evento de Airbnb ya había sido procesado anteriormente.",
    };
  }

  // =========================================================
  // PROCESAR SEGÚN TIPO
  // =========================================================

  switch (evento.tipo) {
    case "NUEVA_RESERVA":
      return await this
        .procesarNuevaReservaAirbnb(
          evento
        );

    case "RESERVA_MODIFICADA":
      return await this
        .procesarModificacionReservaAirbnb(
          evento
        );

    case "RESERVA_CANCELADA":
      return await this
        .procesarCancelacionReservaAirbnb(
          evento
        );

    default:
      throw new Error(
        "El tipo de evento recibido desde Airbnb no es válido."
      );
  }
}

async procesarNuevaReservaAirbnb(
  evento
) {
  // =========================================================
  // IDEMPOTENCIA
  // =========================================================

  const reservaExistente =
    await ReservaRepository
      .obtenerPorCanalEIdExterno(
        "Airbnb",
        evento.idExterno
      );

  if (reservaExistente) {
    const eventoProcesado =
      AirbnbInboundService
        .marcarEventoProcesado(
          evento.idEvento
        );

    const reservaActual =
      await this.obtenerReservaPorId(
        reservaExistente.idReserva
      );

    return {
      evento:
        eventoProcesado,

      reserva:
        reservaActual,

      duplicada: true,

      conflictoDetectado: false,

      advertencia:
        "La reserva Airbnb ya existía en HostFlow. No se creó un duplicado.",
    };
  }

  // =========================================================
  // DATOS DEL EVENTO
  // =========================================================

  const datos =
    evento.datos;

  if (!datos) {
    throw new Error(
      "El evento de Airbnb no contiene los datos de la reserva."
    );
  }

  // =========================================================
  // PROPIEDAD
  // =========================================================

  const propiedad =
    await ReservaRepository
      .obtenerPropiedadPorId(
        datos.idPropiedad
      );

  if (!propiedad) {
    throw new Error(
      "La propiedad asociada a la reserva de Airbnb no existe en HostFlow."
    );
  }

  // =========================================================
  // VALIDAR FECHAS
  // =========================================================

  if (
    !datos.fechaIngreso ||
    !datos.fechaEgreso
  ) {
    throw new Error(
      "Airbnb no proporcionó las fechas necesarias para procesar la reserva."
    );
  }

  if (
    new Date(datos.fechaEgreso) <=
    new Date(datos.fechaIngreso)
  ) {
    throw new Error(
      "Airbnb envió un rango de fechas inválido."
    );
  }

  // =========================================================
  // VALIDAR HUÉSPEDES
  // =========================================================

  const cantidadHuespedes =
    Number(
      datos.cantidadHuespedes
    ) || 1;

  if (
    cantidadHuespedes >
    propiedad.capacidadMaxima
  ) {
    throw new Error(
      "La reserva recibida de Airbnb supera la capacidad máxima registrada para la propiedad."
    );
  }

  // =========================================================
  // HUÉSPED
  // =========================================================
  //
  // En esta simulación seguimos buscando
  // por nombre + apellido.
  // =========================================================

  const nombreHuesped =
    datos.nombreHuesped ||
    "Huésped";

  const apellidoHuesped =
    datos.apellidoHuesped ||
    "Airbnb";

  let huesped =
    await ReservaRepository
      .obtenerHuespedPorNombreYApellido(
        nombreHuesped,
        apellidoHuesped
      );

  if (!huesped) {
    huesped =
      await ReservaRepository
        .crearHuespedExterno({
          nombre:
            nombreHuesped,

          apellido:
            apellidoHuesped,

          email:
            datos.emailHuesped ||
            null,

          telefono:
            datos.telefonoHuesped ||
            null,

          documento:
            datos.documentoHuesped ||
            null,

          nacionalidad:
            datos.nacionalidadHuesped ||
            null,

          origenRegistro:
            "Airbnb",
        });
  }

  // =========================================================
  // CONFLICTO
  // =========================================================
  //
  // Airbnb es la fuente externa de la reserva.
  // Si llega confirmada y existe superposición,
  // HostFlow la registra igualmente y advierte.
  // =========================================================

  const conflictoDetectado =
    await ReservaRepository
      .existeConflictoFechas(
        propiedad.idPropiedad,
        datos.fechaIngreso,
        datos.fechaEgreso
      );

  // =========================================================
  // CREAR RESERVA EN AZURE
  // =========================================================

  const nuevaReserva =
    await ReservaRepository
      .crearReservaExterna({
        idPropiedad:
          propiedad.idPropiedad,

        idHuesped:
          huesped.idHuesped,

        canal:
          "Airbnb",

        estado:
          datos.estadoReserva ||
          "Confirmada",

        fechaIngreso:
          datos.fechaIngreso,

        fechaEgreso:
          datos.fechaEgreso,

        cantidadHuespedes,

        montoEstimado:
          Number(
            datos.montoEstimado
          ) || 0,

        idExterno:
          evento.idExterno,
      });

  await this.registrarEventoReserva({
    idReserva:
      nuevaReserva.idReserva,

    tipo:
      "RESERVA_RECIBIDA",

    titulo:
      "Reserva recibida desde Airbnb",

    descripcion:
      "HostFlow recibió y sincronizó una nueva reserva confirmada desde Airbnb.",

    origen:
      "Airbnb",

    datosJson: {
      canal:
        "Airbnb",

      idExterno:
        evento.idExterno,

      idEventoExterno:
        evento.idEvento,

      estado:
        datos.estadoReserva ||
        "Confirmada",

      propiedad:
        propiedad.nombre,

      huesped:
        `${huesped.nombre} ${huesped.apellido}`,

      fechaIngreso:
        datos.fechaIngreso,

      fechaEgreso:
        datos.fechaEgreso,

      cantidadHuespedes,

      montoEstimado:
        Number(
          datos.montoEstimado
        ) || 0,

      conflictoDetectado,
    },
  });

if (conflictoDetectado) {
    await this.registrarConflictoReserva({
      idReserva:
        nuevaReserva.idReserva,

      canal:
        "Airbnb",

      fechaIngreso:
        datos.fechaIngreso,

      fechaEgreso:
        datos.fechaEgreso,

      contexto:
        "RESERVA_RECIBIDA",

      idExterno:
        evento.idExterno,
    });
  }

  // El evento se considera procesado solamente
  // después de guardar correctamente en Azure.

  const eventoProcesado =
    AirbnbInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  const reservaActual =
    await this.obtenerReservaPorId(
      nuevaReserva.idReserva
    );

  return {
    evento:
      eventoProcesado,

    reserva:
      reservaActual,

    duplicada: false,

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "La reserva fue recibida desde Airbnb, pero genera un conflicto con otra reserva existente en HostFlow."
        : null,
  };
}

async procesarModificacionReservaAirbnb(
  evento
) {
  const reserva =
    await ReservaRepository
      .obtenerPorCanalEIdExterno(
        "Airbnb",
        evento.idExterno
      );

  if (!reserva) {
    throw new Error(
      "No existe en HostFlow una reserva Airbnb con el identificador externo recibido."
    );
  }

  const datos =
    evento.datos;

  if (!datos) {
    throw new Error(
      "El evento de Airbnb no contiene datos para modificar la reserva."
    );
  }

  const nuevaFechaIngreso =
    datos.fechaIngreso ||
    reserva.fechaIngreso;

  const nuevaFechaEgreso =
    datos.fechaEgreso ||
    reserva.fechaEgreso;

  const nuevaCantidadHuespedes =
    datos.cantidadHuespedes !==
    undefined
      ? Number(
          datos.cantidadHuespedes
        )
      : Number(
          reserva.cantidadHuespedes
        );

  const nuevoMontoEstimado =
    datos.montoEstimado !==
    undefined
      ? Number(
          datos.montoEstimado
        )
      : Number(
          reserva.montoEstimado
        );

  if (
    new Date(nuevaFechaEgreso) <=
    new Date(nuevaFechaIngreso)
  ) {
    throw new Error(
      "Airbnb envió una modificación con fechas inválidas."
    );
  }

  if (
    nuevaCantidadHuespedes <= 0
  ) {
    throw new Error(
      "Airbnb envió una cantidad de huéspedes inválida."
    );
  }

  if (
    nuevoMontoEstimado < 0
  ) {
    throw new Error(
      "Airbnb envió un monto inválido."
    );
  }

  const conflictoDetectado =
    await ReservaRepository
      .existeConflictoFechas(
        reserva.idPropiedad,
        nuevaFechaIngreso,
        nuevaFechaEgreso,
        reserva.idReserva
      );

  await ReservaRepository
    .sincronizarReservaExterna(
      reserva.idReserva,
      {
        fechaIngreso:
          nuevaFechaIngreso,

        fechaEgreso:
          nuevaFechaEgreso,

        cantidadHuespedes:
          nuevaCantidadHuespedes,

        montoEstimado:
          nuevoMontoEstimado,

        estado:
          datos.estadoReserva ||
          null,
      }
    );

  const camposModificados = [];

  if (
    reserva.fechaIngreso !==
    nuevaFechaIngreso
  ) {
    camposModificados.push(
      "fechaIngreso"
    );
  }

  if (
    reserva.fechaEgreso !==
    nuevaFechaEgreso
  ) {
    camposModificados.push(
      "fechaEgreso"
    );
  }

  if (
    Number(
      reserva.cantidadHuespedes
    ) !==
    Number(
      nuevaCantidadHuespedes
    )
  ) {
    camposModificados.push(
      "cantidadHuespedes"
    );
  }

  if (
    Number(
      reserva.montoEstimado
    ) !==
    Number(
      nuevoMontoEstimado
    )
  ) {
    camposModificados.push(
      "montoEstimado"
    );
  }

  if (
    datos.estadoReserva &&
    reserva.estado !==
      datos.estadoReserva
  ) {
    camposModificados.push(
      "estado"
    );
  }

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "RESERVA_MODIFICADA",

    titulo:
      "Reserva modificada desde Airbnb",

    descripcion:
      "Airbnb informó cambios y HostFlow sincronizó la reserva local.",

    origen:
      "Airbnb",

    datosJson: {
      canal:
        "Airbnb",

      idExterno:
        evento.idExterno,

      idEventoExterno:
        evento.idEvento,

      conflictoDetectado,

      camposModificados,

      antes: {
        fechaIngreso:
          reserva.fechaIngreso,

        fechaEgreso:
          reserva.fechaEgreso,

        cantidadHuespedes:
          Number(
            reserva.cantidadHuespedes
          ),

        montoEstimado:
          Number(
            reserva.montoEstimado
          ),

        estado:
          reserva.estado,
      },

      despues: {
        fechaIngreso:
          nuevaFechaIngreso,

        fechaEgreso:
          nuevaFechaEgreso,

        cantidadHuespedes:
          nuevaCantidadHuespedes,

        montoEstimado:
          nuevoMontoEstimado,

        estado:
          datos.estadoReserva ||
          reserva.estado,
      },
    },
  });

if (conflictoDetectado) {
    await this.registrarConflictoReserva({
      idReserva:
        reserva.idReserva,

      canal:
        "Airbnb",

      fechaIngreso:
        nuevaFechaIngreso,

      fechaEgreso:
        nuevaFechaEgreso,

      contexto:
        "RESERVA_MODIFICADA",

      idExterno:
        evento.idExterno,
    });
  }

  const eventoProcesado =
    AirbnbInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  const reservaActualizada =
    await this.obtenerReservaPorId(
      reserva.idReserva
    );

  return {
    evento:
      eventoProcesado,

    reserva:
      reservaActualizada,

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "Airbnb modificó la reserva, pero los nuevos datos generan un conflicto con otra reserva en HostFlow."
        : null,
  };
}

async procesarCancelacionReservaAirbnb(
  evento
) {
  const reserva =
    await ReservaRepository
      .obtenerPorCanalEIdExterno(
        "Airbnb",
        evento.idExterno
      );

  if (!reserva) {
    throw new Error(
      "No existe en HostFlow una reserva Airbnb con el identificador externo recibido."
    );
  }

  await ReservaRepository
    .sincronizarEstadoExterno(
      reserva.idReserva,
      "Cancelada"
    );

  await this.registrarEventoReserva({
    idReserva:
      reserva.idReserva,

    tipo:
      "RESERVA_CANCELADA",

    titulo:
      "Reserva cancelada desde Airbnb",

    descripcion:
      "Airbnb informó la cancelación y HostFlow sincronizó el estado de la reserva.",

    origen:
      "Airbnb",

    datosJson: {
      canal:
        "Airbnb",

      idExterno:
        evento.idExterno,

      idEventoExterno:
        evento.idEvento,

      estadoAnterior:
        reserva.estado,

      estadoNuevo:
        "Cancelada",

      fechaIngreso:
        reserva.fechaIngreso,

      fechaEgreso:
        reserva.fechaEgreso,

      montoEstimado:
        Number(
          reserva.montoEstimado
        ),
    },
  });

  const eventoProcesado =
    AirbnbInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  const reservaActualizada =
    await this.obtenerReservaPorId(
      reserva.idReserva
    );

  return {
    evento:
      eventoProcesado,

    reserva:
      reservaActualizada,

    conflictoDetectado: false,

    advertencia: null,
  };
}

  // =========================================================
  // FORMATO DE RESPUESTA
  // =========================================================

  formatearReserva(reserva) {
    let solicitudAirbnbPendiente =
      null;

    let operacionBookingPendiente =
      null;

    if (reserva.canal === "Airbnb") {
      solicitudAirbnbPendiente =
        AirbnbChannelService
          .obtenerSolicitudPendientePorReserva(
            reserva.idReserva
          );
    }

    if (reserva.canal === "Booking") {
      operacionBookingPendiente =
        BookingChannelService
          .obtenerOperacionPendientePorReserva(
            reserva.idReserva
          );
    }

    return {
      idReserva:
        reserva.idReserva,

      propiedad:
        reserva.propiedad.nombre,

      idPropiedad:
        reserva.propiedad.idPropiedad,

      huesped:
        `${reserva.huesped.nombre} ${reserva.huesped.apellido}`,

      idHuesped:
        reserva.huesped.idHuesped,

      canal:
        reserva.canal,

      estado:
        reserva.estado,

      fechaIngreso:
        reserva.fechaIngreso,

      fechaEgreso:
        reserva.fechaEgreso,

      cantidadHuespedes:
        reserva.cantidadHuespedes,

      montoEstimado:
        reserva.montoEstimado,

      idExterno:
        reserva.idExterno || null,

      estadoSincronizacion:
        reserva.estadoSincronizacion ||
        (
          reserva.canal === "Manual"
            ? "Solo HostFlow"
            : "Sincronizada"
        ),

      tipoGestion:
        ChannelService.obtenerTipoGestion(
          reserva.canal
        ),

      accionesDisponibles:
        ChannelService.obtenerAccionesDisponibles(
          reserva
        ),

      // =====================================================
      // AIRBNB
      // =====================================================

      solicitudAirbnbPendiente:
        solicitudAirbnbPendiente
          ? {
              idSolicitud:
                solicitudAirbnbPendiente
                  .idSolicitud,

              estado:
                solicitudAirbnbPendiente
                  .estado,

              fechaSolicitud:
                solicitudAirbnbPendiente
                  .fechaSolicitud,

              cambiosSolicitados: {
                fechaIngreso:
                  solicitudAirbnbPendiente
                    .cambiosSolicitados
                    .fechaIngreso,

                fechaEgreso:
                  solicitudAirbnbPendiente
                    .cambiosSolicitados
                    .fechaEgreso,

                cantidadHuespedes:
                  solicitudAirbnbPendiente
                    .cambiosSolicitados
                    .cantidadHuespedes,

                montoEstimado:
                  solicitudAirbnbPendiente
                    .cambiosSolicitados
                    .montoEstimado,
              },
            }
          : null,

      // =====================================================
      // BOOKING
      // =====================================================

      operacionBookingPendiente:
        operacionBookingPendiente
          ? {
              idOperacion:
                operacionBookingPendiente
                  .idOperacion,

              tipo:
                operacionBookingPendiente
                  .tipo,

              estado:
                operacionBookingPendiente
                  .estado,

              fechaOperacion:
                operacionBookingPendiente
                  .fechaOperacion,

              cambiosSolicitados:
                operacionBookingPendiente
                  .cambiosSolicitados ||
                null,
            }
          : null,
    };
  }
}

module.exports =
  new ReservaService();