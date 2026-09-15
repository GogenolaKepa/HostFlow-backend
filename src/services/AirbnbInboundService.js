class AirbnbInboundService {
  constructor() {
    /*
     * Simula las actualizaciones de reservas
     * que Airbnb entrega al software conectado.
     *
     * No representa un payload oficial concreto
     * de la API privada de partners.
     */
    this.eventos = [];
  }

  // =========================================================
  // SIMULACIONES DESDE AIRBNB
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
  // CREAR EVENTO
  // =========================================================

  crearEvento(tipo, datos) {
    if (!datos.idExterno) {
      throw new Error(
        "El evento de Airbnb debe incluir un identificador externo."
      );
    }

    const evento = {
      idEvento:
        this.eventos.length + 1,

      canal: "Airbnb",

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

      fechaProcesamiento:
        null,
    };

    this.eventos.push(evento);

    return evento;
  }

  // =========================================================
  // CONSULTAS
  // =========================================================

  obtenerEventosPendientes() {
    return this.eventos.filter(
      (evento) =>
        evento.estado === "Pendiente"
    );
  }

  obtenerEventoPorId(idEvento) {
    const evento =
      this.eventos.find(
        (e) =>
          e.idEvento ===
          Number(idEvento)
      );

    if (!evento) {
      throw new Error(
        "El evento de Airbnb no existe."
      );
    }

    return evento;
  }

  // =========================================================
  // PROCESAMIENTO
  // =========================================================

  marcarEventoProcesado(idEvento) {
    const evento =
      this.obtenerEventoPorId(
        idEvento
      );

    if (
      evento.estado === "Procesado"
    ) {
      throw new Error(
        "El evento de Airbnb ya fue procesado."
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
  new AirbnbInboundService();