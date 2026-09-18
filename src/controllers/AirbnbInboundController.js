const AirbnbInboundService = require("../services/AirbnbInboundService");
const ReservaService = require("../services/ReservaService");

class AirbnbInboundController {
  // =========================================================
  // SIMULAR NUEVA RESERVA DESDE AIRBNB
  // =========================================================

  simularNuevaReserva(req, res) {
    try {
      const evento =
        AirbnbInboundService.simularNuevaReserva(
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Airbnb simuló correctamente una nueva reserva.",
        evento,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // SIMULAR MODIFICACIÓN DESDE AIRBNB
  // =========================================================

  simularModificacionReserva(req, res) {
    try {
      const evento =
        AirbnbInboundService.simularModificacionReserva(
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Airbnb simuló correctamente una modificación de reserva.",
        evento,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // SIMULAR CANCELACIÓN DESDE AIRBNB
  // =========================================================

  simularCancelacionReserva(req, res) {
    try {
      const evento =
        AirbnbInboundService.simularCancelacionReserva(
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Airbnb simuló correctamente una cancelación de reserva.",
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
        AirbnbInboundService.obtenerEventosPendientes();

      return res.status(200).json({
        mensaje:
          "Eventos pendientes de Airbnb obtenidos correctamente.",
        eventos,
      });
    } catch (error) {
      return res.status(500).json({
        mensaje:
          "No se pudieron obtener los eventos pendientes de Airbnb.",
        error: error.message,
      });
    }
  }

  // =========================================================
  // PROCESAR EVENTO EN HOSTFLOW
  // =========================================================

 async procesarEvento(
  req,
  res
) {
  try {
    const { idEvento } =
      req.params;

    const resultado =
      await ReservaService
        .procesarEventoAirbnb(
          idEvento
        );

    return res
      .status(200)
      .json(resultado);
  } catch (error) {
    console.error(
      "Error al procesar evento Airbnb:",
      error
    );

    return res
      .status(400)
      .json({
        mensaje: error.message,
      });
  }
}
}

module.exports =
  new AirbnbInboundController();