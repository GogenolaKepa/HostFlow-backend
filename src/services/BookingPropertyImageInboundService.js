class BookingPropertyImageInboundService {
  constructor() {
    /*
     * Simula eventos de imágenes recibidos
     * desde Booking.
     *
     * No representa un payload oficial
     * concreto de la API de Booking.
     *
     * Este servicio solamente simula la
     * recepción del evento externo.
     *
     * No modifica directamente Azure SQL.
     */
    this.eventos = [];
  }

  // =========================================================
  // SIMULAR NUEVA IMAGEN
  // =========================================================

  simularImagenCreada(
    datos
  ) {
    return this.crearEvento(
      "IMAGEN_CREADA",
      datos
    );
  }

  // =========================================================
  // SIMULAR MODIFICACIÓN DE IMAGEN
  // =========================================================

  simularImagenActualizada(
    datos
  ) {
    return this.crearEvento(
      "IMAGEN_ACTUALIZADA",
      datos
    );
  }

  // =========================================================
  // SIMULAR ELIMINACIÓN DE IMAGEN
  // =========================================================

  simularImagenEliminada(
    datos
  ) {
    return this.crearEvento(
      "IMAGEN_ELIMINADA",
      datos
    );
  }

  // =========================================================
  // SIMULAR CAMBIO DE IMAGEN PRINCIPAL
  // =========================================================

  simularImagenPrincipal(
    datos
  ) {
    return this.crearEvento(
      "IMAGEN_PRINCIPAL",
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
    if (
      !datos.idExternoPropiedad
    ) {
      throw new Error(
        "El evento de imagen de Booking debe incluir el identificador externo de la propiedad."
      );
    }

    if (
      !datos.idExternoImagen
    ) {
      throw new Error(
        "El evento de imagen de Booking debe incluir el identificador externo de la imagen."
      );
    }

    const tiposPermitidos = [
      "IMAGEN_CREADA",
      "IMAGEN_ACTUALIZADA",
      "IMAGEN_ELIMINADA",
      "IMAGEN_PRINCIPAL",
    ];

    if (
      !tiposPermitidos.includes(
        tipo
      )
    ) {
      throw new Error(
        "El tipo de evento de imagen de Booking no es válido."
      );
    }

    if (
      tipo ===
        "IMAGEN_CREADA" &&
      !datos.urlImagen
    ) {
      throw new Error(
        "Booking debe proporcionar la URL de la nueva imagen."
      );
    }

    const evento = {
      idEvento:
        this.eventos.length +
        1,

      canal:
        "Booking",

      tipo,

      estado:
        "Pendiente",

      /*
       * Identificador externo de la
       * propiedad en Booking.
       *
       * Ejemplo:
       *
       * BKG-HF-2
       */
      idExternoPropiedad:
        datos.idExternoPropiedad,

      /*
       * Identificador externo de la
       * imagen en Booking.
       *
       * Ejemplo:
       *
       * BKG-IMG-EXTERNA-001
       */
      idExternoImagen:
        datos.idExternoImagen,

      /*
       * Los campos dependen del evento.
       */
      datos: {
        urlImagen:
          datos.urlImagen,

        descripcion:
          datos.descripcion,

        orden:
          datos.orden,

        esPrincipal:
          datos.esPrincipal,
      },

      fechaRecepcion:
        new Date()
          .toISOString(),

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
        "El evento de imagen de Booking no existe."
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
        "El evento de imagen de Booking ya fue procesado."
      );
    }

    evento.estado =
      "Procesado";

    evento.fechaProcesamiento =
      new Date()
        .toISOString();

    return evento;
  }
}

module.exports =
  new BookingPropertyImageInboundService();