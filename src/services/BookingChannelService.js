const FORMATO_HORA_RESERVA =
  /^([01]\d|2[0-3]):[0-5]\d$/;

class BookingChannelService {
  constructor() {
    /*
     * Simula las operaciones enviadas a Booking.
     *
     * En producción estas operaciones serían llamadas
     * a la Reporting API de Booking.
     */
    this.operaciones = [];
  }

  validarReservaBooking(reserva) {
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
        "La reserva ya no admite operaciones en Booking."
      );
    }
  }

  cambiarEstadia(reserva, datos) {
    this.validarReservaBooking(reserva);

    const nuevaFechaEgreso =
      datos.fechaEgreso;

    const nuevaHoraEgreso =
      String(
        datos.horaEgreso ||
        reserva.horaEgreso ||
        "00:00"
      ).trim();

    const horaIngresoActual =
      String(
        reserva.horaIngreso ||
        "00:00"
      ).trim();

    const nuevoMonto =
      Number(datos.montoEstimado);

    if (!nuevaFechaEgreso) {
      throw new Error(
        "Debe indicar la nueva fecha de egreso."
      );
    }

    if (
      !FORMATO_HORA_RESERVA.test(
        nuevaHoraEgreso
      ) ||
      !FORMATO_HORA_RESERVA.test(
        horaIngresoActual
      )
    ) {
      throw new Error(
        "Los horarios de la estadía no son válidos."
      );
    }

    /*
     * Representamos el stay_change de Booking:
     *
     * check-in
     * check-out
     * price
     *
     * Desde HostFlow conservamos el check-in actual
     * y permitimos modificar checkout + precio.
     *
     * La disponibilidad sigue evaluándose por día;
     * las horas se conservan como información operativa.
     */
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

    const operacion = {
      idOperacion:
        this.operaciones.length + 1,

      idReserva:
        reserva.idReserva,

      idExterno:
        reserva.idExterno || null,

      canal:
        "Booking",

      tipo:
        "CAMBIO_ESTADIA",

      /*
       * Booking responde que el stay_change
       * queda encolado.
       *
       * Todavía NO modificamos la reserva local.
       */
      estado:
        "Encolada",

      datosOriginales: {
        fechaIngreso:
          reserva.fechaIngreso,

        horaIngreso:
          horaIngresoActual,

        fechaEgreso:
          reserva.fechaEgreso,

        horaEgreso:
          String(
            reserva.horaEgreso ||
            "00:00"
          ).trim(),

        montoEstimado:
          reserva.montoEstimado,
      },

      cambiosSolicitados: {
        fechaIngreso:
          reserva.fechaIngreso,

        horaIngreso:
          horaIngresoActual,

        fechaEgreso:
          nuevaFechaEgreso,

        horaEgreso:
          nuevaHoraEgreso,

        montoEstimado:
          nuevoMonto,
      },

      fechaOperacion:
        new Date().toISOString(),

      fechaSincronizacion: null,
    };

    this.operaciones.push(
      operacion
    );

    return operacion;
  }

  reportarNoShow(
    reserva,
    condonarCargos = false
  ) {
    this.validarReservaBooking(reserva);

    const operacion = {
      idOperacion:
        this.operaciones.length + 1,

      idReserva:
        reserva.idReserva,

      idExterno:
        reserva.idExterno || null,

      canal:
        "Booking",

      tipo:
        "NO_SHOW",

      /*
       * La Reporting API permite informar
       * un no-show y especificar si se
       * condonan o no los cargos.
       */
      estado:
        "Enviada",

      condonarCargos:
        Boolean(condonarCargos),

      fechaOperacion:
        new Date().toISOString(),

      fechaSincronizacion: null,
    };

    this.operaciones.push(
      operacion
    );

    return operacion;
  }

  obtenerOperacionPorId(idOperacion) {
    const operacion =
      this.operaciones.find(
        (o) =>
          o.idOperacion ===
          Number(idOperacion)
      );

    if (!operacion) {
      throw new Error(
        "La operación de Booking no existe."
      );
    }

    return operacion;
  }

  obtenerOperacionPendientePorReserva(
    idReserva
  ) {
    return (
      this.operaciones.find(
        (operacion) =>
          operacion.idReserva ===
            Number(idReserva) &&
          (
            operacion.estado === "Encolada" ||
            operacion.estado === "Enviada"
          )
      ) || null
    );
  }

  marcarOperacionSincronizada(
    idOperacion
  ) {
    const operacion =
      this.obtenerOperacionPorId(
        idOperacion
      );

    if (
      operacion.estado ===
      "Sincronizada"
    ) {
      throw new Error(
        "La operación ya fue sincronizada."
      );
    }

    operacion.estado =
      "Sincronizada";

    operacion.fechaSincronizacion =
      new Date().toISOString();

    return operacion;
  }

  obtenerOperaciones() {
    return this.operaciones;
  }
}

module.exports =
  new BookingChannelService();
