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
      await ReservaService.obtenerReservaPorId(id);

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

module.exports = new ReservaController();