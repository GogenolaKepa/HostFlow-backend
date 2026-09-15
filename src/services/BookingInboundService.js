class BookingInboundService {
  constructor() {
    /*
     * Simula la cola de mensajes que HostFlow
     * recuperaría desde la Reservations API
     * de Booking.
     */
    this.eventosPendientes = [];
  }

  // =========================================================
  // SIMULAR EVENTOS QUE VIENEN DESDE BOOKING
  // =========================================================

  simularNuevaReserva(datos) {
    return this.crearEvento(
      "NUEVA_RESERVA",
      datos
    );
  }

  simularModificacionReserva(datos) {
    return this.crearEvento(
      "RESERVA_MODIFICADA",
      datos
    );
  }

  simularCancelacionReserva(datos) {
    return this.crearEvento(
      "RESERVA_CANCELADA",
      datos
    );
  }

  // =========================================================
  // CREACIÓN DEL EVENTO
  // =========================================================

  crearEvento(tipo, datos) {
    if (!datos.idExterno) {
      throw new Error(
        "El evento de Booking debe incluir un identificador externo."
      );
    }

    const evento = {
      idEvento:
        this.eventosPendientes.length + 1,

      canal: "Booking",

      tipo,

      estado: "Pendiente",

      idExterno:
        datos.idExterno,

      datos: {
        idPropiedad:
          datos.idPropiedad,

        nombreHuesped:
          datos.nombreHuesped,

        apellidoHuesped:
          datos.apellidoHuesped,

        fechaIngreso:
          datos.fechaIngreso,

        fechaEgreso:
          datos.fechaEgreso,

        cantidadHuespedes:
          datos.cantidadHuespedes,

        montoEstimado:
          datos.montoEstimado,

        estadoReserva:
          datos.estadoReserva ||
          "Confirmada",
      },

      fechaRecepcion:
        new Date().toISOString(),

      fechaProcesamiento: null,
    };

    this.eventosPendientes.push(evento);

    return evento;
  }

  // =========================================================
  // CONSULTAS
  // =========================================================

  obtenerEventosPendientes() {
    return this.eventosPendientes.filter(
      (evento) =>
        evento.estado === "Pendiente"
    );
  }

  obtenerEventoPorId(idEvento) {
    const evento =
      this.eventosPendientes.find(
        (e) =>
          e.idEvento ===
          Number(idEvento)
      );

    if (!evento) {
      throw new Error(
        "El evento de Booking no existe."
      );
    }

    return evento;
  }

  // =========================================================
  // ACK / PROCESAMIENTO
  // =========================================================

  marcarEventoProcesado(idEvento) {
    const evento =
      this.obtenerEventoPorId(idEvento);

    if (
      evento.estado === "Procesado"
    ) {
      throw new Error(
        "El evento de Booking ya fue procesado."
      );
    }

    evento.estado =
      "Procesado";

    evento.fechaProcesamiento =
      new Date().toISOString();

    return evento;
  }
}

module.exports =
  new BookingInboundService();