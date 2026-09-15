const ReservaService = require("../services/ReservaService");

class ReservaController {
  // =========================================================
  // CONSULTAS
  // =========================================================

  obtenerReservas(req, res) {
    try {
      const reservas =
        ReservaService.obtenerReservas();

      return res.status(200).json({
        mensaje:
          "Reservas obtenidas correctamente.",
        reservas,
      });
    } catch (error) {
      return res.status(500).json({
        mensaje:
          "Error al obtener las reservas.",
        error: error.message,
      });
    }
  }

  obtenerReservaPorId(req, res) {
    try {
      const { id } = req.params;

      const reserva =
        ReservaService.obtenerReservaPorId(id);

      return res.status(200).json({
        mensaje:
          "Reserva obtenida correctamente.",
        reserva,
      });
    } catch (error) {
      return res.status(404).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // RESERVAS MANUALES
  // =========================================================

  crearReserva(req, res) {
    try {
      const nuevaReserva =
        ReservaService.crearReserva(
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Reserva registrada correctamente.",
        reserva: nuevaReserva,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  modificarReserva(req, res) {
    try {
      const { id } = req.params;

      const reservaActualizada =
        ReservaService.modificarReserva(
          id,
          req.body
        );

      return res.status(200).json({
        mensaje:
          "Reserva modificada correctamente.",
        reserva: reservaActualizada,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  cancelarReserva(req, res) {
    try {
      const { id } = req.params;

      const reservaCancelada =
        ReservaService.cancelarReserva(id);

      return res.status(200).json({
        mensaje:
          "Reserva cancelada correctamente.",
        reserva: reservaCancelada,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // AIRBNB
  // =========================================================

  proponerCambioAirbnb(req, res) {
    try {
      const { id } = req.params;

      const solicitud =
        ReservaService.proponerCambioAirbnb(
          id,
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Solicitud de cambio para Airbnb generada correctamente.",
        solicitud,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  procesarAceptacionAirbnb(req, res) {
    try {
      const { idSolicitud } =
        req.params;

      const resultado =
        ReservaService.procesarAceptacionAirbnb(
          idSolicitud
        );

      return res.status(200).json({
        mensaje:
          "Airbnb confirmó la solicitud de cambio.",
        ...resultado,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  procesarRechazoAirbnb(req, res) {
    try {
      const { idSolicitud } =
        req.params;

      const resultado =
        ReservaService.procesarRechazoAirbnb(
          idSolicitud
        );

      return res.status(200).json({
        mensaje:
          "Airbnb rechazó la solicitud de cambio.",
        ...resultado,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // BOOKING
  // =========================================================

  cambiarEstadiaBooking(req, res) {
    try {
      const { id } = req.params;

      const operacion =
        ReservaService.cambiarEstadiaBooking(
          id,
          req.body
        );

      return res.status(202).json({
        mensaje:
          "La solicitud de cambio fue enviada a Booking y quedó pendiente de sincronización.",
        operacion,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  reportarNoShowBooking(req, res) {
    try {
      const { id } = req.params;

      const operacion =
        ReservaService.reportarNoShowBooking(
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

  procesarSincronizacionBooking(req, res) {
    try {
      const { idOperacion } =
        req.params;

      const resultado =
        ReservaService.procesarSincronizacionBooking(
          idOperacion
        );

      return res.status(200).json({
        mensaje:
          "La operación de Booking fue sincronizada correctamente.",
        ...resultado,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }
}

module.exports = new ReservaController();