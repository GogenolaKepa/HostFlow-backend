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

  async crearReserva(datos) {
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

  const reservaCreada =
    await ReservaRepository.crearReservaManual({
      idPropiedad,
      idHuesped,
      fechaIngreso,
      fechaEgreso,
      cantidadHuespedes: cantidad,
      montoEstimado:
        montoEstimado !== undefined &&
        montoEstimado !== null &&
        montoEstimado !== ""
          ? Number(montoEstimado)
          : 0,
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

  // Volvemos a obtenerla para agregar
  // tipoGestion, accionesDisponibles, etc.
  return await this.obtenerReservaPorId(
    reserva.idReserva
  );
}

  async cancelarReserva(idReserva) {
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

  return AirbnbChannelService
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
  // =========================================================
  // OBTENER RESERVA REAL DESDE AZURE SQL
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

  if (reserva.canal !== "Booking") {
    throw new Error(
      "La reserva seleccionada no pertenece a Booking."
    );
  }

  // =========================================================
  // VALIDAR ESTADO DE LA RESERVA
  // =========================================================

  if (
    reserva.estado === "Cancelada" ||
    reserva.estado === "Finalizada" ||
    reserva.estado === "No show"
  ) {
    throw new Error(
      "La reserva ya no admite cambios de estadía."
    );
  }

  // =========================================================
  // EVITAR DOS OPERACIONES PENDIENTES
  // =========================================================

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

  // =========================================================
  // DATOS SOLICITADOS
  // =========================================================

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

  // =========================================================
  // VALIDAR CONFLICTO CONTRA AZURE SQL
  // =========================================================

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

  // =========================================================
  // ENVIAR OPERACIÓN AL SIMULADOR DE BOOKING
  // =========================================================
  //
  // Todavía NO modificamos fecha ni monto en Azure.
  //
  // Booking primero recibe/procesa la operación.
  // =========================================================

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

  // =========================================================
  // MARCAR RESERVA COMO PENDIENTE EN AZURE
  // =========================================================

  await ReservaRepository
    .actualizarEstadoSincronizacion(
      reserva.idReserva,
      "Pendiente"
    );

  return operacion;
}

async reportarNoShowBooking(
  idReserva,
  datos = {}
) {
  // =========================================================
  // OBTENER RESERVA REAL DESDE AZURE SQL
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

  if (reserva.canal !== "Booking") {
    throw new Error(
      "La reserva seleccionada no pertenece a Booking."
    );
  }

  // =========================================================
  // EVITAR DOS OPERACIONES PENDIENTES
  // =========================================================

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

  // =========================================================
  // VALIDAR ESTADO
  // =========================================================

  if (
    reserva.estado === "Cancelada" ||
    reserva.estado === "Finalizada" ||
    reserva.estado === "No show"
  ) {
    throw new Error(
      "La reserva no admite ser reportada como no-show."
    );
  }

  // =========================================================
  // ENVIAR REPORTE AL SIMULADOR DE BOOKING
  // =========================================================

  const operacion =
    BookingChannelService
      .reportarNoShow(
        reserva,
        datos.condonarCargos === true
      );

  // =========================================================
  // MARCAR SINCRONIZACIÓN PENDIENTE EN AZURE
  // =========================================================
  //
  // Todavía NO cambiamos el estado de la
  // reserva a "No show".
  //
  // Eso ocurre recién cuando Booking confirma
  // la operación y sincronizamos.
  // =========================================================

  await ReservaRepository
    .actualizarEstadoSincronizacion(
      reserva.idReserva,
      "Pendiente"
    );

  return operacion;
}

async procesarSincronizacionBooking(
  idOperacion
) {
  // =========================================================
  // OBTENER OPERACIÓN SIMULADA DE BOOKING
  // =========================================================

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

  // =========================================================
  // OBTENER RESERVA REAL DESDE AZURE SQL
  // =========================================================

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

  // =========================================================
  // CAMBIO DE ESTADÍA
  // =========================================================

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

    // Booking ya confirmó/procesó el cambio.
    //
    // Comprobamos si apareció un conflicto
    // desde que se envió la operación,
    // pero NO bloqueamos la sincronización.

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
          // Booking solo está cambiando
          // egreso + importe.
          // Conservamos el resto.
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
  }

  // =========================================================
  // NO-SHOW
  // =========================================================

  else if (
    operacion.tipo === "NO_SHOW"
  ) {
    // Booking confirmó el no-show.
    // Recién ahora modificamos Azure.

    await ReservaRepository
      .sincronizarEstadoExterno(
        reserva.idReserva,
        "No show"
      );
  }

  // =========================================================
  // TIPO DE OPERACIÓN DESCONOCIDO
  // =========================================================

  else {
    throw new Error(
      "El tipo de operación de Booking no es válido."
    );
  }

  // =========================================================
  // MARCAR OPERACIÓN COMO SINCRONIZADA
  // =========================================================
  //
  // Esto se hace DESPUÉS de actualizar Azure.
  // Si SQL falla, la operación sigue pendiente
  // y podemos volver a procesarla.
  // =========================================================

  const operacionSincronizada =
    BookingChannelService
      .marcarOperacionSincronizada(
        idOperacion
      );

  // =========================================================
  // DEVOLVER RESERVA ACTUALIZADA DESDE AZURE
  // =========================================================

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
  // =========================================================
  // BUSCAR RESERVA BOOKING EN AZURE
  // =========================================================

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

  // =========================================================
  // CALCULAR NUEVOS VALORES
  // =========================================================
  //
  // Booking puede enviar solamente algunos campos.
  // Los que no llegan conservan el valor actual.
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

  const nuevoMontoEstimado =
    datos.montoEstimado !==
    undefined
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

  // =========================================================
  // DETECTAR CONFLICTO
  // =========================================================
  //
  // IMPORTANTE:
  // Booking ya confirmó la modificación.
  //
  // Si HostFlow detecta una superposición,
  // NO bloqueamos la sincronización.
  // Actualizamos Azure y mostramos advertencia.
  // =========================================================

  const conflictoDetectado =
    await ReservaRepository
      .existeConflictoFechas(
        reserva.idPropiedad,
        nuevaFechaIngreso,
        nuevaFechaEgreso,
        reserva.idReserva
      );

  // =========================================================
  // SINCRONIZAR AZURE
  // =========================================================

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

  // Marcamos el evento como procesado
  // solamente después de que Azure se actualizó.
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
  // =========================================================
  // BUSCAR RESERVA BOOKING EN AZURE
  // =========================================================

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

  // =========================================================
  // SINCRONIZAR CANCELACIÓN
  // =========================================================
  //
  // La cancelación ya ocurrió en Booking.
  // HostFlow no la bloquea: solamente sincroniza
  // su copia local.
  // =========================================================

  await ReservaRepository
    .sincronizarEstadoExterno(
      reserva.idReserva,
      "Cancelada"
    );

  // Marcamos el evento como procesado
  // únicamente después de actualizar Azure.
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
  // =========================================================
  // BUSCAR RESERVA AIRBNB EN AZURE
  // =========================================================

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

  // =========================================================
  // NUEVOS VALORES
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

  const nuevoMontoEstimado =
    datos.montoEstimado !==
    undefined
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

  // =========================================================
  // CONFLICTOS
  // =========================================================
  //
  // Airbnb ya confirmó el cambio.
  // Si genera una superposición, HostFlow
  // sincroniza igualmente y muestra advertencia.
  // =========================================================

  const conflictoDetectado =
    await ReservaRepository
      .existeConflictoFechas(
        reserva.idPropiedad,
        nuevaFechaIngreso,
        nuevaFechaEgreso,
        reserva.idReserva
      );

  // =========================================================
  // SINCRONIZAR EN AZURE
  // =========================================================

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

  // Marcamos el evento como procesado
  // solamente después de actualizar Azure.

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