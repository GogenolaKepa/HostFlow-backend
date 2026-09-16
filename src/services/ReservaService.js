const {
  reservas,
  propiedades,
  huespedes,
} = require("../data/mockData");

const ChannelService = require("./ChannelService");
const AirbnbChannelService = require("./AirbnbChannelService");
const BookingChannelService = require("./BookingChannelService");
const BookingInboundService = require("./BookingInboundService");
const AirbnbInboundService = require("./AirbnbInboundService");
const ReservaRepository = require("../repositories/ReservaRepository");

class ReservaService {
  async obtenerReservas() {
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

  async obtenerReservaPorId(idReserva) {
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

  crearReserva(datos) {
    const {
      idPropiedad,
      idHuesped,
      fechaIngreso,
      fechaEgreso,
      cantidadHuespedes,
      montoEstimado,
    } = datos;

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

    if (
      new Date(fechaEgreso) <=
      new Date(fechaIngreso)
    ) {
      throw new Error(
        "La fecha de egreso debe ser posterior a la fecha de ingreso."
      );
    }

    const propiedad = propiedades.find(
      (p) =>
        p.idPropiedad === Number(idPropiedad)
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

    const huesped = huespedes.find(
      (h) =>
        h.idHuesped === Number(idHuesped)
    );

    if (!huesped) {
      throw new Error(
        "El huésped seleccionado no existe."
      );
    }

    if (
      cantidadHuespedes &&
      cantidadHuespedes >
        propiedad.capacidadMaxima
    ) {
      throw new Error(
        "La cantidad de huéspedes supera la capacidad máxima de la propiedad."
      );
    }

    const existeConflicto =
      this.validarConflictoFechas(
        Number(idPropiedad),
        fechaIngreso,
        fechaEgreso
      );

    if (existeConflicto) {
      throw new Error(
        "La propiedad ya posee una reserva en ese rango de fechas."
      );
    }

    const nuevaReserva = {
      idReserva: reservas.length + 1,

      propiedad,
      huesped,

      // Una reserva creada desde HostFlow
      // siempre es una reserva interna/manual.
      canal: "Manual",

      estado: "Confirmada",

      fechaIngreso,
      fechaEgreso,

      cantidadHuespedes:
        Number(cantidadHuespedes) || 1,

      montoEstimado:
        Number(montoEstimado) ||
        propiedad.precioBase,

      idExterno: null,

      estadoSincronizacion:
        "Solo HostFlow",
    };

    reservas.push(nuevaReserva);

    return this.formatearReserva(
      nuevaReserva
    );
  }

  modificarReserva(idReserva, datos) {
    const reserva = reservas.find(
      (r) => r.idReserva === Number(idReserva)
    );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

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

    const nuevaFechaIngreso =
      datos.fechaIngreso ||
      reserva.fechaIngreso;

    const nuevaFechaEgreso =
      datos.fechaEgreso ||
      reserva.fechaEgreso;

    if (
      new Date(nuevaFechaEgreso) <=
      new Date(nuevaFechaIngreso)
    ) {
      throw new Error(
        "La fecha de egreso debe ser posterior a la fecha de ingreso."
      );
    }

    const existeConflicto =
      this.validarConflictoFechas(
        reserva.propiedad.idPropiedad,
        nuevaFechaIngreso,
        nuevaFechaEgreso,
        reserva.idReserva
      );

    if (existeConflicto) {
      throw new Error(
        "La modificación genera un conflicto de fechas."
      );
    }

    reserva.fechaIngreso =
      nuevaFechaIngreso;

    reserva.fechaEgreso =
      nuevaFechaEgreso;

    if (datos.estado) {
      reserva.estado = datos.estado;
    }

    if (
      datos.montoEstimado !== undefined
    ) {
      reserva.montoEstimado = Number(
        datos.montoEstimado
      );
    }

    return this.formatearReserva(reserva);
  }

  cancelarReserva(idReserva) {
    const reserva = reservas.find(
      (r) => r.idReserva === Number(idReserva)
    );

    if (!reserva) {
      throw new Error(
        "La reserva no existe."
      );
    }

    if (
      !ChannelService.permiteCancelacionDirecta(
        reserva.canal
      )
    ) {
      throw new Error(
        `Las reservas provenientes de ${reserva.canal} no pueden cancelarse directamente desde HostFlow.`
      );
    }

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

    reserva.estado = "Cancelada";

    return this.formatearReserva(reserva);
  }

  // =========================================================
  // AIRBNB
  // =========================================================

  proponerCambioAirbnb(idReserva, datos) {
    const reserva = reservas.find(
      (r) => r.idReserva === Number(idReserva)
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

    const nuevaFechaIngreso =
      datos.fechaIngreso ||
      reserva.fechaIngreso;

    const nuevaFechaEgreso =
      datos.fechaEgreso ||
      reserva.fechaEgreso;

    if (
      new Date(nuevaFechaEgreso) <=
      new Date(nuevaFechaIngreso)
    ) {
      throw new Error(
        "La fecha de egreso debe ser posterior a la fecha de ingreso."
      );
    }

    const nuevaCantidadHuespedes =
      datos.cantidadHuespedes !== undefined
        ? Number(datos.cantidadHuespedes)
        : reserva.cantidadHuespedes;

    if (
      nuevaCantidadHuespedes >
      reserva.propiedad.capacidadMaxima
    ) {
      throw new Error(
        "La cantidad de huéspedes supera la capacidad máxima de la propiedad."
      );
    }

    const existeConflicto =
      this.validarConflictoFechas(
        reserva.propiedad.idPropiedad,
        nuevaFechaIngreso,
        nuevaFechaEgreso,

        // Ignoramos la propia reserva de Airbnb.
        reserva.idReserva
      );

    if (existeConflicto) {
      throw new Error(
        "El cambio propuesto genera un conflicto con otra reserva."
      );
    }

    return AirbnbChannelService.proponerCambio(
      reserva,
      {
        fechaIngreso:
          nuevaFechaIngreso,

        fechaEgreso:
          nuevaFechaEgreso,

        cantidadHuespedes:
          nuevaCantidadHuespedes,

        montoEstimado:
          datos.montoEstimado !== undefined
            ? Number(datos.montoEstimado)
            : reserva.montoEstimado,
      }
    );
  }

  procesarAceptacionAirbnb(idSolicitud) {
    const solicitud =
      AirbnbChannelService.obtenerSolicitudPorId(
        idSolicitud
      );

    if (solicitud.estado !== "Pendiente") {
      throw new Error(
        "La solicitud ya fue procesada."
      );
    }

    const reserva = reservas.find(
      (r) =>
        r.idReserva ===
        Number(solicitud.idReserva)
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

    /*
     * Airbnb ya confirmó el cambio.
     * HostFlow debe sincronizar su copia local.
     *
     * Comprobamos si apareció un conflicto
     * inesperado para poder informarlo,
     * pero NO rechazamos el cambio externo.
     */
    const conflictoDetectado =
      this.validarConflictoFechas(
        reserva.propiedad.idPropiedad,
        cambios.fechaIngreso,
        cambios.fechaEgreso,
        reserva.idReserva
      );

    reserva.fechaIngreso =
      cambios.fechaIngreso;

    reserva.fechaEgreso =
      cambios.fechaEgreso;

    reserva.cantidadHuespedes =
      Number(cambios.cantidadHuespedes);

    reserva.montoEstimado =
      Number(cambios.montoEstimado);

    reserva.estadoSincronizacion =
      "Sincronizada";

    const solicitudAceptada =
      AirbnbChannelService.marcarSolicitudAceptada(
        idSolicitud
      );

    return {
      solicitud:
        solicitudAceptada,

      reserva:
        this.formatearReserva(reserva),

      conflictoDetectado,

      advertencia:
        conflictoDetectado
          ? "El cambio fue confirmado por Airbnb, pero genera un conflicto con otra reserva en HostFlow."
          : null,
    };
  }

  procesarRechazoAirbnb(idSolicitud) {
    const solicitud =
      AirbnbChannelService.obtenerSolicitudPorId(
        idSolicitud
      );

    if (solicitud.estado !== "Pendiente") {
      throw new Error(
        "La solicitud ya fue procesada."
      );
    }

    const reserva = reservas.find(
      (r) =>
        r.idReserva ===
        Number(solicitud.idReserva)
    );

    if (!reserva) {
      throw new Error(
        "La reserva asociada a la solicitud no existe."
      );
    }

    const solicitudRechazada =
      AirbnbChannelService.marcarSolicitudRechazada(
        idSolicitud
      );

    return {
      solicitud:
        solicitudRechazada,

      // La reserva original permanece intacta.
      reserva:
        this.formatearReserva(reserva),
    };
  }

  // =========================================================
  // BOOKING
  // =========================================================

  cambiarEstadiaBooking(
    idReserva,
    datos
  ) {
    const reserva = reservas.find(
      (r) =>
        r.idReserva ===
        Number(idReserva)
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

    /*
     * Evitamos enviar una segunda operación
     * mientras Booking todavía tiene una
     * operación pendiente para la reserva.
     */
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

    /*
     * Antes de enviar el cambio a Booking,
     * HostFlow valida que la extensión de la
     * estadía no genere conflictos conocidos.
     */
    const existeConflicto =
      this.validarConflictoFechas(
        reserva.propiedad.idPropiedad,
        reserva.fechaIngreso,
        nuevaFechaEgreso,
        reserva.idReserva
      );

    if (existeConflicto) {
      throw new Error(
        "El cambio de estadía genera un conflicto con otra reserva."
      );
    }

    /*
     * Booking recibe la operación.
     *
     * Todavía NO modificamos la reserva local.
     * La operación queda encolada hasta que
     * Booking la procese y HostFlow vuelva
     * a sincronizar la reserva.
     */
    const operacion =
      BookingChannelService.cambiarEstadia(
        reserva,
        {
          fechaEgreso:
            nuevaFechaEgreso,

          montoEstimado:
            nuevoMonto,
        }
      );

    reserva.estadoSincronizacion =
      "Pendiente";

    return operacion;
  }

  reportarNoShowBooking(
  idReserva,
  datos = {}
) {
  const reserva = reservas.find(
    (r) =>
      r.idReserva ===
      Number(idReserva)
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

  const operacion =
    BookingChannelService.reportarNoShow(
      reserva,
      datos.condonarCargos === true
    );

  /*
   * La operación fue enviada a Booking,
   * pero esperamos la sincronización antes
   * de modificar el estado local.
   */
  reserva.estadoSincronizacion =
    "Pendiente";

  return operacion;
}

procesarSincronizacionBooking(idOperacion) {
  const operacion =
    BookingChannelService.obtenerOperacionPorId(
      idOperacion
    );

  if (
    operacion.estado !== "Encolada" &&
    operacion.estado !== "Enviada"
  ) {
    throw new Error(
      "La operación de Booking ya fue procesada."
    );
  }

  const reserva = reservas.find(
    (r) =>
      r.idReserva ===
      Number(operacion.idReserva)
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

  if (
    operacion.tipo === "CAMBIO_ESTADIA"
  ) {
    const cambios =
      operacion.cambiosSolicitados;

    /*
     * Booking ya procesó el cambio.
     * HostFlow debe reflejar lo que informa
     * el canal externo.
     */
    conflictoDetectado =
      this.validarConflictoFechas(
        reserva.propiedad.idPropiedad,
        reserva.fechaIngreso,
        cambios.fechaEgreso,
        reserva.idReserva
      );

    reserva.fechaEgreso =
      cambios.fechaEgreso;

    reserva.montoEstimado =
      Number(
        cambios.montoEstimado
      );
  }

  if (
  operacion.tipo === "NO_SHOW"
) {
  /*
   * Booking confirmó el reporte.
   * Recién ahora HostFlow actualiza
   * el estado de la reserva.
   */
  reserva.estado = "No show";
}

  reserva.estadoSincronizacion =
    "Sincronizada";

  const operacionSincronizada =
    BookingChannelService
      .marcarOperacionSincronizada(
        idOperacion
      );

  return {
    operacion:
      operacionSincronizada,

    reserva:
      this.formatearReserva(
        reserva
      ),

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

procesarEventoBooking(idEvento) {
  const evento =
    BookingInboundService.obtenerEventoPorId(
      idEvento
    );

  /*
   * Si intentamos procesar dos veces exactamente
   * el mismo evento, no repetimos ninguna operación.
   */
  if (evento.estado === "Procesado") {
    const reservaExistente =
      reservas.find(
        (r) =>
          r.canal === "Booking" &&
          r.idExterno === evento.idExterno
      );

    return {
      evento,
      reserva: reservaExistente
        ? this.formatearReserva(
            reservaExistente
          )
        : null,

      reprocesado: true,
      conflictoDetectado: false,
      advertencia:
        "El evento ya había sido procesado anteriormente.",
    };
  }

  switch (evento.tipo) {
    case "NUEVA_RESERVA":
      return this.procesarNuevaReservaBooking(
        evento
      );

    case "RESERVA_MODIFICADA":
      return this.procesarModificacionReservaBooking(
        evento
      );

    case "RESERVA_CANCELADA":
      return this.procesarCancelacionReservaBooking(
        evento
      );

    default:
      throw new Error(
        "El tipo de evento recibido desde Booking no es válido."
      );
  }
}

procesarNuevaReservaBooking(evento) {
  /*
   * La clave de idempotencia es el ID externo
   * entregado por Booking.
   *
   * Si Booking reenvía la misma reserva,
   * NO creamos otra copia.
   */
  const reservaExistente =
    reservas.find(
      (r) =>
        r.canal === "Booking" &&
        r.idExterno === evento.idExterno
    );

  if (reservaExistente) {
    const eventoProcesado =
      BookingInboundService.marcarEventoProcesado(
        evento.idEvento
      );

    return {
      evento:
        eventoProcesado,

      reserva:
        this.formatearReserva(
          reservaExistente
        ),

      duplicada: true,
      conflictoDetectado: false,

      advertencia:
        "La reserva ya existía en HostFlow. No se creó un duplicado.",
    };
  }

  const datos = evento.datos;

  const propiedad =
    propiedades.find(
      (p) =>
        p.idPropiedad ===
        Number(datos.idPropiedad)
    );

  if (!propiedad) {
    throw new Error(
      "La propiedad asociada a la reserva de Booking no existe en HostFlow."
    );
  }

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

  if (
    Number(datos.cantidadHuespedes) >
    propiedad.capacidadMaxima
  ) {
    throw new Error(
      "La reserva recibida de Booking supera la capacidad máxima registrada para la propiedad."
    );
  }

  /*
   * Buscamos un huésped existente por nombre
   * y apellido para este mock.
   *
   * Más adelante, con datos reales, podremos usar
   * identificadores y datos permitidos por el canal.
   */
  let huesped =
    huespedes.find(
      (h) =>
        h.nombre ===
          datos.nombreHuesped &&
        h.apellido ===
          datos.apellidoHuesped
    );

  if (!huesped) {
    const nuevoId =
      huespedes.length > 0
        ? Math.max(
            ...huespedes.map(
              (h) => h.idHuesped
            )
          ) + 1
        : 1;

    huesped = {
      idHuesped: nuevoId,
      nombre:
        datos.nombreHuesped ||
        "Huésped",

      apellido:
        datos.apellidoHuesped ||
        "Booking",

      email: null,
      telefono: null,
    };

    huespedes.push(huesped);
  }

  /*
   * Como Booking es la fuente de verdad de una
   * reserva externa, si aparece un conflicto
   * HostFlow NO rechaza la reserva.
   *
   * La registra y genera una advertencia.
   */
  const conflictoDetectado =
    this.validarConflictoFechas(
      propiedad.idPropiedad,
      datos.fechaIngreso,
      datos.fechaEgreso
    );

  const nuevaReserva = {
    idReserva:
      reservas.length > 0
        ? Math.max(
            ...reservas.map(
              (r) => r.idReserva
            )
          ) + 1
        : 1,

    propiedad,
    huesped,

    canal: "Booking",

    estado:
      datos.estadoReserva ||
      "Confirmada",

    fechaIngreso:
      datos.fechaIngreso,

    fechaEgreso:
      datos.fechaEgreso,

    cantidadHuespedes:
      Number(
        datos.cantidadHuespedes
      ) || 1,

    montoEstimado:
      Number(
        datos.montoEstimado
      ) || 0,

    idExterno:
      evento.idExterno,

    estadoSincronizacion:
      "Sincronizada",
  };

  reservas.push(
    nuevaReserva
  );

  const eventoProcesado =
    BookingInboundService.marcarEventoProcesado(
      evento.idEvento
    );

  return {
    evento:
      eventoProcesado,

    reserva:
      this.formatearReserva(
        nuevaReserva
      ),

    duplicada: false,

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "La reserva fue recibida desde Booking, pero genera un conflicto con otra reserva existente en HostFlow."
        : null,
  };
}

procesarModificacionReservaBooking(
  evento
) {
  const reserva =
    reservas.find(
      (r) =>
        r.canal === "Booking" &&
        r.idExterno ===
          evento.idExterno
    );

  if (!reserva) {
    throw new Error(
      "No existe en HostFlow una reserva Booking con el identificador externo recibido."
    );
  }

  const datos =
    evento.datos;

  const nuevaFechaIngreso =
    datos.fechaIngreso ||
    reserva.fechaIngreso;

  const nuevaFechaEgreso =
    datos.fechaEgreso ||
    reserva.fechaEgreso;

  if (
    new Date(nuevaFechaEgreso) <=
    new Date(nuevaFechaIngreso)
  ) {
    throw new Error(
      "Booking envió una modificación con fechas inválidas."
    );
  }

  /*
   * Booking ya modificó la reserva.
   * HostFlow debe reflejar el cambio incluso si
   * internamente detectamos una superposición.
   */
  const conflictoDetectado =
    this.validarConflictoFechas(
      reserva.propiedad.idPropiedad,
      nuevaFechaIngreso,
      nuevaFechaEgreso,
      reserva.idReserva
    );

  reserva.fechaIngreso =
    nuevaFechaIngreso;

  reserva.fechaEgreso =
    nuevaFechaEgreso;

  if (
    datos.cantidadHuespedes !==
    undefined
  ) {
    reserva.cantidadHuespedes =
      Number(
        datos.cantidadHuespedes
      );
  }

  if (
    datos.montoEstimado !==
    undefined
  ) {
    reserva.montoEstimado =
      Number(
        datos.montoEstimado
      );
  }

  if (datos.estadoReserva) {
    reserva.estado =
      datos.estadoReserva;
  }

  reserva.estadoSincronizacion =
    "Sincronizada";

  const eventoProcesado =
    BookingInboundService.marcarEventoProcesado(
      evento.idEvento
    );

  return {
    evento:
      eventoProcesado,

    reserva:
      this.formatearReserva(
        reserva
      ),

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "Booking modificó la reserva, pero los nuevos datos generan un conflicto con otra reserva en HostFlow."
        : null,
  };
}

procesarCancelacionReservaBooking(
  evento
) {
  const reserva =
    reservas.find(
      (r) =>
        r.canal === "Booking" &&
        r.idExterno ===
          evento.idExterno
    );

  if (!reserva) {
    throw new Error(
      "No existe en HostFlow una reserva Booking con el identificador externo recibido."
    );
  }

  /*
   * La cancelación ya ocurrió en Booking.
   * HostFlow simplemente sincroniza su copia.
   */
  reserva.estado =
    "Cancelada";

  reserva.estadoSincronizacion =
    "Sincronizada";

  const eventoProcesado =
    BookingInboundService.marcarEventoProcesado(
      evento.idEvento
    );

  return {
    evento:
      eventoProcesado,

    reserva:
      this.formatearReserva(
        reserva
      ),

    conflictoDetectado: false,
    advertencia: null,
  };
}

// =========================================================
// AIRBNB - EVENTOS ENTRANTES
// =========================================================

procesarEventoAirbnb(idEvento) {
  const evento =
    AirbnbInboundService.obtenerEventoPorId(
      idEvento
    );

  /*
   * Si exactamente el mismo evento ya fue
   * procesado, no repetimos la operación.
   */
  if (evento.estado === "Procesado") {
    const reservaExistente =
      reservas.find(
        (r) =>
          r.canal === "Airbnb" &&
          r.idExterno ===
            evento.idExterno
      );

    return {
      evento,

      reserva:
        reservaExistente
          ? this.formatearReserva(
              reservaExistente
            )
          : null,

      reprocesado: true,

      conflictoDetectado: false,

      advertencia:
        "El evento de Airbnb ya había sido procesado anteriormente.",
    };
  }

  switch (evento.tipo) {
    case "NUEVA_RESERVA":
      return this.procesarNuevaReservaAirbnb(
        evento
      );

    case "RESERVA_MODIFICADA":
      return this.procesarModificacionReservaAirbnb(
        evento
      );

    case "RESERVA_CANCELADA":
      return this.procesarCancelacionReservaAirbnb(
        evento
      );

    default:
      throw new Error(
        "El tipo de evento recibido desde Airbnb no es válido."
      );
  }
}

procesarNuevaReservaAirbnb(evento) {
  /*
   * Usamos el identificador externo de Airbnb
   * para evitar reservas duplicadas.
   */
  const reservaExistente =
    reservas.find(
      (r) =>
        r.canal === "Airbnb" &&
        r.idExterno ===
          evento.idExterno
    );

  if (reservaExistente) {
    const eventoProcesado =
      AirbnbInboundService
        .marcarEventoProcesado(
          evento.idEvento
        );

    return {
      evento:
        eventoProcesado,

      reserva:
        this.formatearReserva(
          reservaExistente
        ),

      duplicada: true,

      conflictoDetectado: false,

      advertencia:
        "La reserva Airbnb ya existía en HostFlow. No se creó un duplicado.",
    };
  }

  const datos =
    evento.datos;

  const propiedad =
    propiedades.find(
      (p) =>
        p.idPropiedad ===
        Number(datos.idPropiedad)
    );

  if (!propiedad) {
    throw new Error(
      "La propiedad asociada a la reserva de Airbnb no existe en HostFlow."
    );
  }

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

  if (
    Number(datos.cantidadHuespedes) >
    propiedad.capacidadMaxima
  ) {
    throw new Error(
      "La reserva recibida de Airbnb supera la capacidad máxima registrada para la propiedad."
    );
  }

  /*
   * En este mock buscamos al huésped por
   * nombre y apellido.
   */
  let huesped =
    huespedes.find(
      (h) =>
        h.nombre ===
          datos.nombreHuesped &&
        h.apellido ===
          datos.apellidoHuesped
    );

  if (!huesped) {
    const nuevoId =
      huespedes.length > 0
        ? Math.max(
            ...huespedes.map(
              (h) => h.idHuesped
            )
          ) + 1
        : 1;

    huesped = {
      idHuesped:
        nuevoId,

      nombre:
        datos.nombreHuesped ||
        "Huésped",

      apellido:
        datos.apellidoHuesped ||
        "Airbnb",

      email: null,
      telefono: null,
    };

    huespedes.push(
      huesped
    );
  }

  /*
   * Airbnb es la fuente de verdad de esta
   * reserva externa.
   *
   * Si hay superposición, HostFlow la registra
   * igualmente y genera una advertencia.
   */
  const conflictoDetectado =
    this.validarConflictoFechas(
      propiedad.idPropiedad,
      datos.fechaIngreso,
      datos.fechaEgreso
    );

  const nuevaReserva = {
    idReserva:
      reservas.length > 0
        ? Math.max(
            ...reservas.map(
              (r) => r.idReserva
            )
          ) + 1
        : 1,

    propiedad,
    huesped,

    canal:
      "Airbnb",

    estado:
      datos.estadoReserva ||
      "Confirmada",

    fechaIngreso:
      datos.fechaIngreso,

    fechaEgreso:
      datos.fechaEgreso,

    cantidadHuespedes:
      Number(
        datos.cantidadHuespedes
      ) || 1,

    montoEstimado:
      Number(
        datos.montoEstimado
      ) || 0,

    idExterno:
      evento.idExterno,

    estadoSincronizacion:
      "Sincronizada",
  };

  reservas.push(
    nuevaReserva
  );

  const eventoProcesado =
    AirbnbInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  return {
    evento:
      eventoProcesado,

    reserva:
      this.formatearReserva(
        nuevaReserva
      ),

    duplicada: false,

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "La reserva fue recibida desde Airbnb, pero genera un conflicto con otra reserva existente en HostFlow."
        : null,
  };
}

procesarModificacionReservaAirbnb(
  evento
) {
  const reserva =
    reservas.find(
      (r) =>
        r.canal === "Airbnb" &&
        r.idExterno ===
          evento.idExterno
    );

  if (!reserva) {
    throw new Error(
      "No existe en HostFlow una reserva Airbnb con el identificador externo recibido."
    );
  }

  const datos =
    evento.datos;

  const nuevaFechaIngreso =
    datos.fechaIngreso ||
    reserva.fechaIngreso;

  const nuevaFechaEgreso =
    datos.fechaEgreso ||
    reserva.fechaEgreso;

  if (
    new Date(nuevaFechaEgreso) <=
    new Date(nuevaFechaIngreso)
  ) {
    throw new Error(
      "Airbnb envió una modificación con fechas inválidas."
    );
  }

  const conflictoDetectado =
    this.validarConflictoFechas(
      reserva.propiedad.idPropiedad,
      nuevaFechaIngreso,
      nuevaFechaEgreso,
      reserva.idReserva
    );

  /*
   * Airbnb ya modificó la reserva.
   * HostFlow sincroniza su copia.
   */
  reserva.fechaIngreso =
    nuevaFechaIngreso;

  reserva.fechaEgreso =
    nuevaFechaEgreso;

  if (
    datos.cantidadHuespedes !==
    undefined
  ) {
    reserva.cantidadHuespedes =
      Number(
        datos.cantidadHuespedes
      );
  }

  if (
    datos.montoEstimado !==
    undefined
  ) {
    reserva.montoEstimado =
      Number(
        datos.montoEstimado
      );
  }

  if (
    datos.estadoReserva
  ) {
    reserva.estado =
      datos.estadoReserva;
  }

  reserva.estadoSincronizacion =
    "Sincronizada";

  const eventoProcesado =
    AirbnbInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  return {
    evento:
      eventoProcesado,

    reserva:
      this.formatearReserva(
        reserva
      ),

    conflictoDetectado,

    advertencia:
      conflictoDetectado
        ? "Airbnb modificó la reserva, pero los nuevos datos generan un conflicto con otra reserva en HostFlow."
        : null,
  };
}

procesarCancelacionReservaAirbnb(
  evento
) {
  const reserva =
    reservas.find(
      (r) =>
        r.canal === "Airbnb" &&
        r.idExterno ===
          evento.idExterno
    );

  if (!reserva) {
    throw new Error(
      "No existe en HostFlow una reserva Airbnb con el identificador externo recibido."
    );
  }

  reserva.estado =
    "Cancelada";

  reserva.estadoSincronizacion =
    "Sincronizada";

  const eventoProcesado =
    AirbnbInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  return {
    evento:
      eventoProcesado,

    reserva:
      this.formatearReserva(
        reserva
      ),

    conflictoDetectado: false,
    advertencia: null,
  };
}

  // =========================================================
  // VALIDACIÓN DE DISPONIBILIDAD
  // =========================================================

  validarConflictoFechas(
    idPropiedad,
    fechaIngreso,
    fechaEgreso,
    idReservaIgnorada = null
  ) {
    const ingresoNuevo =
      new Date(fechaIngreso);

    const egresoNuevo =
      new Date(fechaEgreso);

    return reservas.some((reserva) => {
      if (
        idReservaIgnorada &&
        reserva.idReserva ===
          Number(idReservaIgnorada)
      ) {
        return false;
      }

      if (
        reserva.propiedad.idPropiedad !==
        Number(idPropiedad)
      ) {
        return false;
      }

      if (
        reserva.estado === "Cancelada"
      ) {
        return false;
      }

      const ingresoExistente =
        new Date(reserva.fechaIngreso);

      const egresoExistente =
        new Date(reserva.fechaEgreso);

      return (
        ingresoNuevo < egresoExistente &&
        egresoNuevo > ingresoExistente
      );
    });
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