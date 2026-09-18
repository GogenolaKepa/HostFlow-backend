class AirbnbPropertyInboundService {
  constructor() {
    /*
     * Simula eventos de propiedades recibidos
     * desde Airbnb.
     *
     * En una integración real estos eventos
     * podrían provenir de webhooks, polling
     * u otros mecanismos del proveedor.
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
        "El evento de Airbnb debe incluir el identificador externo de la propiedad."
      );
    }

    const evento = {
      idEvento:
        this.eventos.length + 1,

      canal:
        "Airbnb",

      tipo,

      estado:
        "Pendiente",

      idExterno:
        datos.idExterno,

      /*
       * Todos estos campos son opcionales.
       *
       * Un evento externo puede modificar
       * solamente precio, capacidad,
       * dirección, etc.
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
        "El evento de propiedad de Airbnb no existe."
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
        "El evento de propiedad de Airbnb ya fue procesado."
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
  new AirbnbPropertyInboundService();