const BookingPropertyInboundService = require(
  "../services/BookingPropertyInboundService"
);

const PropiedadCanalService = require(
  "../services/PropiedadCanalService"
);

class BookingPropertyInboundController {
  // =========================================================
  // SIMULAR MODIFICACIÓN DE PROPIEDAD DESDE BOOKING
  // =========================================================

  simularModificacionPropiedad(
    req,
    res
  ) {
    try {
      const evento =
        BookingPropertyInboundService
          .simularModificacionPropiedad(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Booking simuló correctamente una modificación de propiedad.",
          evento,
        });
    } catch (error) {
      return res
        .status(400)
        .json({
          mensaje:
            error.message,
        });
    }
  }

  // =========================================================
  // OBTENER EVENTOS PENDIENTES
  // =========================================================

  obtenerEventosPendientes(
    req,
    res
  ) {
    try {
      const eventos =
        BookingPropertyInboundService
          .obtenerEventosPendientes();

      return res
        .status(200)
        .json({
          mensaje:
            "Eventos pendientes de propiedades de Booking obtenidos correctamente.",
          eventos,
        });
    } catch (error) {
      return res
        .status(500)
        .json({
          mensaje:
            "No se pudieron obtener los eventos pendientes de propiedades de Booking.",
          error:
            error.message,
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
        await PropiedadCanalService
          .procesarEventoPropiedadBooking(
            idEvento
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Evento de propiedad de Booking procesado correctamente.",
          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al procesar evento de propiedad Booking:",
        error
      );

      return res
        .status(400)
        .json({
          mensaje:
            error.message,
        });
    }
  }
}

module.exports =
  new BookingPropertyInboundController();