const ReservaService = require("../services/ReservaService");

class ReservaController {
  obtenerReservas(req, res) {
    try {
      const reservas = ReservaService.obtenerReservas();

      return res.status(200).json({
        mensaje: "Reservas obtenidas correctamente.",
        reservas,
      });
    } catch (error) {
      return res.status(500).json({
        mensaje: "Error al obtener las reservas.",
        error: error.message,
      });
    }
  }

  obtenerReservaPorId(req, res) {
    try {
      const { id } = req.params;

      const reserva = ReservaService.obtenerReservaPorId(id);

      return res.status(200).json({
        mensaje: "Reserva obtenida correctamente.",
        reserva,
      });
    } catch (error) {
      return res.status(404).json({
        mensaje: error.message,
      });
    }
  }

  crearReserva(req, res) {
    try {
      const nuevaReserva = ReservaService.crearReserva(req.body);

      return res.status(201).json({
        mensaje: "Reserva registrada correctamente.",
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

      const reservaActualizada = ReservaService.modificarReserva(id, req.body);

      return res.status(200).json({
        mensaje: "Reserva modificada correctamente.",
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

      const reservaCancelada = ReservaService.cancelarReserva(id);

      return res.status(200).json({
        mensaje: "Reserva cancelada correctamente.",
        reserva: reservaCancelada,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }
}

module.exports = new ReservaController();