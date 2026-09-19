const BookingPropertyImageInboundService = require(
  "../services/BookingPropertyImageInboundService"
);

const BookingPropertyImageInboundProcessorService = require(
  "../services/BookingPropertyImageInboundProcessorService"
);

class BookingPropertyImageInboundController {
  // =========================================================
  // SIMULAR NUEVA IMAGEN DESDE BOOKING
  // =========================================================

  simularImagenCreada(
    req,
    res
  ) {
    try {
      const evento =
        BookingPropertyImageInboundService
          .simularImagenCreada(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Booking simuló correctamente la creación de una imagen.",
          evento,
        });
    } catch (error) {
      console.error(
        "Error al simular creación de imagen Booking:",
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

  // =========================================================
  // SIMULAR ACTUALIZACIÓN DE IMAGEN DESDE BOOKING
  // =========================================================

  simularImagenActualizada(
    req,
    res
  ) {
    try {
      const evento =
        BookingPropertyImageInboundService
          .simularImagenActualizada(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Booking simuló correctamente la actualización de una imagen.",
          evento,
        });
    } catch (error) {
      console.error(
        "Error al simular actualización de imagen Booking:",
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

  // =========================================================
  // SIMULAR ELIMINACIÓN DE IMAGEN DESDE BOOKING
  // =========================================================

  simularImagenEliminada(
    req,
    res
  ) {
    try {
      const evento =
        BookingPropertyImageInboundService
          .simularImagenEliminada(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Booking simuló correctamente la eliminación de una imagen.",
          evento,
        });
    } catch (error) {
      console.error(
        "Error al simular eliminación de imagen Booking:",
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

  // =========================================================
  // SIMULAR CAMBIO DE IMAGEN PRINCIPAL DESDE BOOKING
  // =========================================================

  simularImagenPrincipal(
    req,
    res
  ) {
    try {
      const evento =
        BookingPropertyImageInboundService
          .simularImagenPrincipal(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Booking simuló correctamente el cambio de imagen principal.",
          evento,
        });
    } catch (error) {
      console.error(
        "Error al simular imagen principal Booking:",
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

  // =========================================================
  // OBTENER EVENTOS PENDIENTES
  // =========================================================

  obtenerEventosPendientes(
    req,
    res
  ) {
    try {
      const eventos =
        BookingPropertyImageInboundService
          .obtenerEventosPendientes();

      return res
        .status(200)
        .json({
          mensaje:
            "Eventos pendientes de imágenes de Booking obtenidos correctamente.",
          eventos,
        });
    } catch (error) {
      console.error(
        "Error al obtener eventos pendientes de imágenes Booking:",
        error
      );

      return res
        .status(500)
        .json({
          mensaje:
            "No se pudieron obtener los eventos pendientes de imágenes de Booking.",
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
      const {
        idEvento,
      } =
        req.params;

      const resultado =
        await BookingPropertyImageInboundProcessorService
          .procesarEvento(
            idEvento
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Evento de imagen de Booking procesado correctamente.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al procesar evento de imagen Booking:",
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
  new BookingPropertyImageInboundController();