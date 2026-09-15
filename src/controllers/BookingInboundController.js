const BookingInboundService = require("../services/BookingInboundService");
const ReservaService = require("../services/ReservaService");

class BookingInboundController {
  // =========================================================
  // SIMULAR NUEVA RESERVA DESDE BOOKING
  // =========================================================

  simularNuevaReserva(req, res) {
    try {
      const evento =
        BookingInboundService.simularNuevaReserva(
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Booking simuló correctamente una nueva reserva.",
        evento,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // SIMULAR MODIFICACIÓN DESDE BOOKING
  // =========================================================

  simularModificacionReserva(req, res) {
    try {
      const evento =
        BookingInboundService.simularModificacionReserva(
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Booking simuló correctamente una modificación de reserva.",
        evento,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // SIMULAR CANCELACIÓN DESDE BOOKING
  // =========================================================

  simularCancelacionReserva(req, res) {
    try {
      const evento =
        BookingInboundService.simularCancelacionReserva(
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Booking simuló correctamente una cancelación de reserva.",
        evento,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // OBTENER EVENTOS PENDIENTES
  // =========================================================

  obtenerEventosPendientes(req, res) {
    try {
      const eventos =
        BookingInboundService.obtenerEventosPendientes();

      return res.status(200).json({
        mensaje:
          "Eventos pendientes obtenidos correctamente.",
        eventos,
      });
    } catch (error) {
      return res.status(500).json({
        mensaje:
          "No se pudieron obtener los eventos pendientes.",
        error: error.message,
      });
    }
  }

  // =========================================================
  // PROCESAR EVENTO EN HOSTFLOW
  // =========================================================

  procesarEvento(req, res) {
    try {
      const { idEvento } = req.params;

      const resultado =
        ReservaService.procesarEventoBooking(
          idEvento
        );

      return res.status(200).json({
        mensaje:
          "El evento de Booking fue procesado correctamente por HostFlow.",
        ...resultado,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }
}

module.exports =
  new BookingInboundController();