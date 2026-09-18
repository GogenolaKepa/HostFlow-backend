const AirbnbPropertyInboundService = require(
  "../services/AirbnbPropertyInboundService"
);

const PropiedadCanalService = require(
  "../services/PropiedadCanalService"
);

class AirbnbPropertyInboundController {
  // =========================================================
  // SIMULAR MODIFICACIÓN DE PROPIEDAD DESDE AIRBNB
  // =========================================================

  simularModificacionPropiedad(
    req,
    res
  ) {
    try {
      const evento =
        AirbnbPropertyInboundService
          .simularModificacionPropiedad(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Airbnb simuló correctamente una modificación de propiedad.",
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
        AirbnbPropertyInboundService
          .obtenerEventosPendientes();

      return res
        .status(200)
        .json({
          mensaje:
            "Eventos pendientes de propiedades de Airbnb obtenidos correctamente.",
          eventos,
        });
    } catch (error) {
      return res
        .status(500)
        .json({
          mensaje:
            "No se pudieron obtener los eventos pendientes de propiedades de Airbnb.",
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
          .procesarEventoPropiedadAirbnb(
            idEvento
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Evento de propiedad de Airbnb procesado correctamente.",
          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al procesar evento de propiedad Airbnb:",
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
  new AirbnbPropertyInboundController();