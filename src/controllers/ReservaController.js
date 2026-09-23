const ReservaService = require("../services/ReservaService");

class ReservaController {
  // =========================================================
  // CONSULTAS
  // =========================================================

  async obtenerReservas(req, res) {
    try {
      const reservas =
        await ReservaService.obtenerReservas();

      return res.status(200).json({
        reservas,
      });
    } catch (error) {
      console.error(
        "Error al obtener reservas:",
        error
      );

      return res.status(500).json({
        mensaje:
          "No se pudieron obtener las reservas.",
        error: error.message,
      });
    }
  }

  async obtenerReservaPorId(req, res) {
    try {
      const { id } = req.params;

      const reserva =
        await ReservaService.obtenerReservaPorId(
          id
        );

      return res.status(200).json({
        reserva,
      });
    } catch (error) {
      console.error(
        "Error al obtener reserva:",
        error
      );

      return res.status(404).json({
        mensaje: error.message,
      });
    }
  }

  async obtenerEventosReserva(req, res) {
    try {
      const { id } = req.params;

      const eventos =
        await ReservaService.obtenerEventosReserva(
          id
        );

      return res.status(200).json({
        idReserva: Number(id),
        eventos,
      });
    } catch (error) {
      console.error(
        "Error al obtener eventos de la reserva:",
        error
      );

      return res.status(404).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // MENSAJES
  // =========================================================

  async obtenerMensajesReserva(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const mensajes =
        await ReservaService
          .obtenerMensajesReserva(
            id
          );

      return res.status(200).json({
        idReserva:
          Number(id),

        mensajes,
      });
    } catch (error) {
      console.error(
        "Error al obtener mensajes de la reserva:",
        error
      );

      return res.status(404).json({
        mensaje:
          error.message,
      });
    }
  }

  async registrarMensajeReserva(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const mensaje =
        await ReservaService
          .registrarMensajeReserva(
            id,
            req.body
          );

      return res.status(201).json({
        mensaje:
          "Mensaje registrado correctamente.",

        mensajeReserva:
          mensaje,
      });
    } catch (error) {
      console.error(
        "Error al registrar mensaje de la reserva:",
        error
      );

      return res.status(400).json({
        mensaje:
          error.message,
      });
    }
  }

  // =========================================================
  // INCIDENCIAS
  // =========================================================

  async obtenerIncidenciasReserva(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const incidencias =
        await ReservaService
          .obtenerIncidenciasReserva(
            id
          );

      return res.status(200).json({
        idReserva:
          Number(id),

        incidencias,
      });
    } catch (error) {
      console.error(
        "Error al obtener incidencias de la reserva:",
        error
      );

      return res.status(404).json({
        mensaje:
          error.message,
      });
    }
  }

  async registrarIncidenciaReserva(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const incidencia =
        await ReservaService
          .registrarIncidenciaReserva(
            id,
            req.body
          );

      return res.status(201).json({
        mensaje:
          "Incidencia registrada correctamente.",

        incidencia,
      });
    } catch (error) {
      console.error(
        "Error al registrar incidencia de la reserva:",
        error
      );

      return res.status(400).json({
        mensaje:
          error.message,
      });
    }
  }

  async actualizarIncidenciaReserva(
    req,
    res
  ) {
    try {
      const {
        id,
        idIncidencia,
      } = req.params;

      const incidencia =
        await ReservaService
          .actualizarIncidenciaReserva(
            id,
            idIncidencia,
            req.body
          );

      return res.status(200).json({
        mensaje:
          "Incidencia actualizada correctamente.",

        incidencia,
      });
    } catch (error) {
      console.error(
        "Error al actualizar incidencia de la reserva:",
        error
      );

      return res.status(400).json({
        mensaje:
          error.message,
      });
    }
  }

  async resolverIncidenciaReserva(
    req,
    res
  ) {
    try {
      const {
        id,
        idIncidencia,
      } = req.params;

      const incidencia =
        await ReservaService
          .resolverIncidenciaReserva(
            id,
            idIncidencia,
            req.body.resolucion
          );

      return res.status(200).json({
        mensaje:
          "Incidencia resuelta correctamente.",

        incidencia,
      });
    } catch (error) {
      console.error(
        "Error al resolver incidencia de la reserva:",
        error
      );

      return res.status(400).json({
        mensaje:
          error.message,
      });
    }
  }

  // =========================================================
  // OBSERVACIONES INTERNAS
  // =========================================================

  async obtenerObservacionesReserva(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const observaciones =
        await ReservaService
          .obtenerObservacionesReserva(
            id
          );

      return res.status(200).json({
        idReserva:
          Number(id),

        observaciones,
      });
    } catch (error) {
      console.error(
        "Error al obtener observaciones de la reserva:",
        error
      );

      return res.status(404).json({
        mensaje:
          error.message,
      });
    }
  }

  async registrarObservacionReserva(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const observacion =
        await ReservaService
          .registrarObservacionReserva(
            id,
            req.body
          );

      return res.status(201).json({
        mensaje:
          "Observación registrada correctamente.",

        observacion,
      });
    } catch (error) {
      console.error(
        "Error al registrar observación de la reserva:",
        error
      );

      return res.status(400).json({
        mensaje:
          error.message,
      });
    }
  }

  async actualizarObservacionReserva(
    req,
    res
  ) {
    try {
      const {
        id,
        idObservacion,
      } = req.params;

      const observacion =
        await ReservaService
          .actualizarObservacionReserva(
            id,
            idObservacion,
            req.body
          );

      return res.status(200).json({
        mensaje:
          "Observación actualizada correctamente.",

        observacion,
      });
    } catch (error) {
      console.error(
        "Error al actualizar observación de la reserva:",
        error
      );

      return res.status(400).json({
        mensaje:
          error.message,
      });
    }
  }

  async cambiarFijadaObservacionReserva(
    req,
    res
  ) {
    try {
      const {
        id,
        idObservacion,
      } = req.params;

      const observacion =
        await ReservaService
          .cambiarFijadaObservacionReserva(
            id,
            idObservacion,
            req.body.fijada
          );

      return res.status(200).json({
        mensaje:
          req.body.fijada
            ? "Observación fijada correctamente."
            : "Observación desfijada correctamente.",

        observacion,
      });
    } catch (error) {
      console.error(
        "Error al cambiar el estado fijado de la observación:",
        error
      );

      return res.status(400).json({
        mensaje:
          error.message,
      });
    }
  }

  async eliminarObservacionReserva(
    req,
    res
  ) {
    try {
      const {
        id,
        idObservacion,
      } = req.params;

      const observacion =
        await ReservaService
          .eliminarObservacionReserva(
            id,
            idObservacion
          );

      return res.status(200).json({
        mensaje:
          "Observación eliminada correctamente.",

        observacion,
      });
    } catch (error) {
      console.error(
        "Error al eliminar observación de la reserva:",
        error
      );

      return res.status(400).json({
        mensaje:
          error.message,
      });
    }
  }

  // =========================================================
  // RESERVAS MANUALES
  // =========================================================

  async crearReserva(req, res) {
    try {
      const reserva =
        await ReservaService.crearReserva(
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Reserva creada correctamente.",
        reserva,
      });
    } catch (error) {
      console.error(
        "Error al crear reserva:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  async modificarReserva(req, res) {
    try {
      const { id } = req.params;

      const reserva =
        await ReservaService.modificarReserva(
          id,
          req.body
        );

      return res.status(200).json({
        mensaje:
          "Reserva modificada correctamente.",
        reserva,
      });
    } catch (error) {
      console.error(
        "Error al modificar reserva:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  async cancelarReserva(req, res) {
    try {
      const { id } = req.params;

      const reserva =
        await ReservaService.cancelarReserva(
          id
        );

      return res.status(200).json({
        mensaje:
          "Reserva cancelada correctamente.",
        reserva,
      });
    } catch (error) {
      console.error(
        "Error al cancelar reserva:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // AIRBNB
  // =========================================================

  async proponerCambioAirbnb(req, res) {
    try {
      const { id } = req.params;

      const solicitud =
        await ReservaService
          .proponerCambioAirbnb(
            id,
            req.body
          );

      return res.status(201).json({
        mensaje:
          "Propuesta de cambio enviada correctamente.",
        solicitud,
      });
    } catch (error) {
      console.error(
        "Error al proponer cambio Airbnb:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  async procesarAceptacionAirbnb(
    req,
    res
  ) {
    try {
      const { idSolicitud } =
        req.params;

      const resultado =
        await ReservaService
          .procesarAceptacionAirbnb(
            idSolicitud
          );

      return res.status(200).json(
        resultado
      );
    } catch (error) {
      console.error(
        "Error al procesar aceptación Airbnb:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  async procesarRechazoAirbnb(
    req,
    res
  ) {
    try {
      const { idSolicitud } =
        req.params;

      const resultado =
        await ReservaService
          .procesarRechazoAirbnb(
            idSolicitud
          );

      return res.status(200).json(
        resultado
      );
    } catch (error) {
      console.error(
        "Error al procesar rechazo Airbnb:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // BOOKING
  // =========================================================

  async cambiarEstadiaBooking(
    req,
    res
  ) {
    try {
      const { id } = req.params;

      const operacion =
        await ReservaService
          .cambiarEstadiaBooking(
            id,
            req.body
          );

      return res.status(200).json({
        mensaje:
          "Cambio de estadía enviado a Booking correctamente.",
        operacion,
      });
    } catch (error) {
      console.error(
        "Error al cambiar estadía Booking:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  async reportarNoShowBooking(req, res) {
    try {
      const { id } = req.params;

      const operacion =
        await ReservaService
          .reportarNoShowBooking(
            id,
            req.body
          );

      return res.status(202).json({
        mensaje:
          "El reporte de no-show fue enviado a Booking y quedó pendiente de sincronización.",
        operacion,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  async procesarSincronizacionBooking(
    req,
    res
  ) {
    try {
      const { idOperacion } =
        req.params;

      const resultado =
        await ReservaService
          .procesarSincronizacionBooking(
            idOperacion
          );

      return res.status(200).json(
        resultado
      );
    } catch (error) {
      console.error(
        "Error al sincronizar operación Booking:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }
}

module.exports =
  new ReservaController();
