class AirbnbPropertyImageInboundService {
  constructor() {
    /*
     * Simula eventos de imágenes recibidos
     * desde Airbnb.
     *
     * En una integración real estos eventos
     * podrían provenir de webhooks, polling
     * u otros mecanismos del proveedor.
     *
     * IMPORTANTE:
     *
     * Este servicio solamente simula la
     * recepción y almacenamiento temporal
     * del evento.
     *
     * No modifica directamente Azure SQL.
     *
     * La aplicación de los cambios en
     * HostFlow se hará posteriormente desde
     * el servicio de sincronización.
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
    // ---------------------------------------------------------
    // VALIDAR PROPIEDAD EXTERNA
    // ---------------------------------------------------------

    if (
      !datos.idExternoPropiedad
    ) {
      throw new Error(
        "El evento de imagen de Airbnb debe incluir el identificador externo de la propiedad."
      );
    }

    // ---------------------------------------------------------
    // VALIDAR IMAGEN EXTERNA
    // ---------------------------------------------------------

    /*
     * Todas las imágenes que llegan desde
     * Airbnb tienen su propio identificador.
     *
     * Este NO es el mismo identificador que
     * IdPropiedadImagen de HostFlow.
     *
     * Ejemplo:
     *
     * Airbnb:
     * AIR-IMG-895432
     *
     * HostFlow:
     * IdPropiedadImagen = 25
     *
     * La relación entre ambos se guardará en:
     *
     * PropiedadImagenCanales
     */

    if (
      !datos.idExternoImagen
    ) {
      throw new Error(
        "El evento de imagen de Airbnb debe incluir el identificador externo de la imagen."
      );
    }

    // ---------------------------------------------------------
    // VALIDACIONES SEGÚN TIPO
    // ---------------------------------------------------------

    if (
      tipo ===
        "IMAGEN_CREADA" &&
      !datos.urlImagen
    ) {
      throw new Error(
        "Airbnb debe proporcionar la URL de la nueva imagen."
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
        "El tipo de evento de imagen de Airbnb no es válido."
      );
    }

    // ---------------------------------------------------------
    // CREAR EVENTO
    // ---------------------------------------------------------

    const evento = {
      idEvento:
        this.eventos.length +
        1,

      canal:
        "Airbnb",

      tipo,

      estado:
        "Pendiente",

      /*
       * Identificador de la publicación
       * de la propiedad en Airbnb.
       *
       * Ejemplo:
       *
       * AIR-HF-2
       */
      idExternoPropiedad:
        datos.idExternoPropiedad,

      /*
       * Identificador propio de la imagen
       * dentro de Airbnb.
       *
       * Ejemplo:
       *
       * AIR-IMG-987654
       */
      idExternoImagen:
        datos.idExternoImagen,

      /*
       * Los campos dependen del evento.
       *
       * IMAGEN_CREADA:
       *
       * - urlImagen
       * - descripcion
       * - orden
       * - esPrincipal
       *
       * IMAGEN_ACTUALIZADA:
       *
       * Puede modificar uno o varios.
       *
       * IMAGEN_ELIMINADA:
       *
       * No necesita datos adicionales.
       *
       * IMAGEN_PRINCIPAL:
       *
       * La imagen identificada por
       * idExternoImagen pasa a ser
       * la principal.
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
        "El evento de imagen de Airbnb no existe."
      );
    }

    return evento;
  }

  // =========================================================
  // MARCAR PROCESADO
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
        "El evento de imagen de Airbnb ya fue procesado."
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
  new AirbnbPropertyImageInboundService();