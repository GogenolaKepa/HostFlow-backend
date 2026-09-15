class AirbnbChannelService {
  constructor() {
    this.solicitudesCambio = [];
  }

  proponerCambio(reserva, datos) {
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
        "La reserva ya no admite propuestas de modificación."
      );
    }

    // No permitimos tener dos propuestas pendientes
    // simultáneamente sobre la misma reserva.
    const solicitudPendiente =
      this.solicitudesCambio.find(
        (solicitud) =>
          solicitud.idReserva === reserva.idReserva &&
          solicitud.estado === "Pendiente"
      );

    if (solicitudPendiente) {
      throw new Error(
        "La reserva ya posee una solicitud de cambio pendiente."
      );
    }

    const fechaIngreso =
      datos.fechaIngreso || reserva.fechaIngreso;

    const fechaEgreso =
      datos.fechaEgreso || reserva.fechaEgreso;

    if (
      new Date(fechaEgreso) <=
      new Date(fechaIngreso)
    ) {
      throw new Error(
        "La fecha de egreso debe ser posterior a la fecha de ingreso."
      );
    }

    const solicitud = {
      idSolicitud:
        this.solicitudesCambio.length + 1,

      idReserva: reserva.idReserva,

      canal: "Airbnb",

      estado: "Pendiente",

      cambiosSolicitados: {
        fechaIngreso,
        fechaEgreso,

        cantidadHuespedes:
          datos.cantidadHuespedes ??
          reserva.cantidadHuespedes,

        montoEstimado:
          datos.montoEstimado ??
          reserva.montoEstimado,
      },

      datosOriginales: {
        fechaIngreso:
          reserva.fechaIngreso,

        fechaEgreso:
          reserva.fechaEgreso,

        cantidadHuespedes:
          reserva.cantidadHuespedes,

        montoEstimado:
          reserva.montoEstimado,
      },

      fechaSolicitud:
        new Date().toISOString(),

      fechaRespuesta: null,
    };

    this.solicitudesCambio.push(solicitud);

    return solicitud;
  }

  obtenerSolicitudes() {
    return this.solicitudesCambio;
  }

  obtenerSolicitudPorId(idSolicitud) {
    const solicitud =
      this.solicitudesCambio.find(
        (s) =>
          s.idSolicitud === Number(idSolicitud)
      );

    if (!solicitud) {
      throw new Error(
        "La solicitud de cambio no existe."
      );
    }

    return solicitud;
  }

    obtenerSolicitudPendientePorReserva(idReserva) {
    return (
        this.solicitudesCambio.find(
        (solicitud) =>
            solicitud.idReserva === Number(idReserva) &&
            solicitud.estado === "Pendiente"
        ) || null
    );
    }

  marcarSolicitudAceptada(idSolicitud) {
    const solicitud =
      this.obtenerSolicitudPorId(idSolicitud);

    if (solicitud.estado !== "Pendiente") {
      throw new Error(
        "La solicitud ya fue procesada."
      );
    }

    solicitud.estado = "Aceptada";
    solicitud.fechaRespuesta =
      new Date().toISOString();

    return solicitud;
  }

  marcarSolicitudRechazada(idSolicitud) {
    const solicitud =
      this.obtenerSolicitudPorId(idSolicitud);

    if (solicitud.estado !== "Pendiente") {
      throw new Error(
        "La solicitud ya fue procesada."
      );
    }

    solicitud.estado = "Rechazada";
    solicitud.fechaRespuesta =
      new Date().toISOString();

    return solicitud;
  }
}

module.exports =
  new AirbnbChannelService();