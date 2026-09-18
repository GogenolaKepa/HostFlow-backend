class BookingPropertyInboundService {
  constructor() {
    /*
     * Simula eventos de propiedades recibidos
     * desde Booking.
     *
     * No representa un payload oficial
     * concreto de la API de Booking.
     */
    this.eventos = [];
  }

  // =========================================================
  // SIMULAR MODIFICACIÓN DE PROPIEDAD
  // =========================================================

  simularModificacionPropiedad(
    datos
  ) {
    return this.crearEvento(
      "PROPIEDAD_MODIFICADA",
      datos
    );
  }

  // =========================================================
  // CREAR EVENTO
  // =========================================================

  crearEvento(
    tipo,
    datos
  ) {
    if (!datos.idExterno) {
      throw new Error(
        "El evento de Booking debe incluir el identificador externo de la propiedad."
      );
    }

    const evento = {
      idEvento:
        this.eventos.length + 1,

      canal:
        "Booking",

      tipo,

      estado:
        "Pendiente",

      idExterno:
        datos.idExterno,

      /*
       * Los campos son opcionales.
       *
       * Booking puede informar solamente
       * aquellos datos que hayan cambiado.
       */
      datos: {
        nombre:
          datos.nombre,

        tipo:
          datos.tipo,

        direccion:
          datos.direccion,

        ciudad:
          datos.ciudad,

        provincia:
          datos.provincia,

        capacidadMaxima:
          datos.capacidadMaxima,

        precioBase:
          datos.precioBase,

        estado:
          datos.estado,
      },

      fechaRecepcion:
        new Date().toISOString(),

      fechaProcesamiento:
        null,
    };

    this.eventos.push(
      evento
    );

    return evento;
  }

  // =========================================================
  // OBTENER EVENTOS PENDIENTES
  // =========================================================

  obtenerEventosPendientes() {
    return this.eventos.filter(
      (evento) =>
        evento.estado ===
        "Pendiente"
    );
  }

  // =========================================================
  // OBTENER EVENTO POR ID
  // =========================================================

  obtenerEventoPorId(
    idEvento
  ) {
    const evento =
      this.eventos.find(
        (item) =>
          item.idEvento ===
          Number(idEvento)
      );

    if (!evento) {
      throw new Error(
        "El evento de propiedad de Booking no existe."
      );
    }

    return evento;
  }

  // =========================================================
  // MARCAR EVENTO PROCESADO
  // =========================================================

  marcarEventoProcesado(
    idEvento
  ) {
    const evento =
      this.obtenerEventoPorId(
        idEvento
      );

    if (
      evento.estado ===
      "Procesado"
    ) {
      throw new Error(
        "El evento de propiedad de Booking ya fue procesado."
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
  new BookingPropertyInboundService();