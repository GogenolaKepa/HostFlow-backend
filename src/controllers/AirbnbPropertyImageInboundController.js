const AirbnbPropertyImageInboundService = require(
  "../services/AirbnbPropertyImageInboundService"
);

const AirbnbPropertyImageInboundProcessorService = require(
  "../services/AirbnbPropertyImageInboundProcessorService"
);

class AirbnbPropertyImageInboundController {
  // =========================================================
  // SIMULAR NUEVA IMAGEN DESDE AIRBNB
  // =========================================================

  simularImagenCreada(
    req,
    res
  ) {
    try {
      const evento =
        AirbnbPropertyImageInboundService
          .simularImagenCreada(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Airbnb simuló correctamente la creación de una imagen.",
          evento,
        });
    } catch (error) {
      console.error(
        "Error al simular creación de imagen Airbnb:",
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
  // SIMULAR ACTUALIZACIÓN DE IMAGEN DESDE AIRBNB
  // =========================================================

  simularImagenActualizada(
    req,
    res
  ) {
    try {
      const evento =
        AirbnbPropertyImageInboundService
          .simularImagenActualizada(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Airbnb simuló correctamente la actualización de una imagen.",
          evento,
        });
    } catch (error) {
      console.error(
        "Error al simular actualización de imagen Airbnb:",
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
  // SIMULAR ELIMINACIÓN DE IMAGEN DESDE AIRBNB
  // =========================================================

  simularImagenEliminada(
    req,
    res
  ) {
    try {
      const evento =
        AirbnbPropertyImageInboundService
          .simularImagenEliminada(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Airbnb simuló correctamente la eliminación de una imagen.",
          evento,
        });
    } catch (error) {
      console.error(
        "Error al simular eliminación de imagen Airbnb:",
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
  // SIMULAR CAMBIO DE IMAGEN PRINCIPAL DESDE AIRBNB
  // =========================================================

  simularImagenPrincipal(
    req,
    res
  ) {
    try {
      const evento =
        AirbnbPropertyImageInboundService
          .simularImagenPrincipal(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Airbnb simuló correctamente el cambio de imagen principal.",
          evento,
        });
    } catch (error) {
      console.error(
        "Error al simular imagen principal Airbnb:",
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
        AirbnbPropertyImageInboundService
          .obtenerEventosPendientes();

      return res
        .status(200)
        .json({
          mensaje:
            "Eventos pendientes de imágenes de Airbnb obtenidos correctamente.",
          eventos,
        });
    } catch (error) {
      console.error(
        "Error al obtener eventos pendientes de imágenes Airbnb:",
        error
      );

      return res
        .status(500)
        .json({
          mensaje:
            "No se pudieron obtener los eventos pendientes de imágenes de Airbnb.",
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
        await AirbnbPropertyImageInboundProcessorService
          .procesarEvento(
            idEvento
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Evento de imagen de Airbnb procesado correctamente.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al procesar evento de imagen Airbnb:",
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
  new AirbnbPropertyImageInboundController();