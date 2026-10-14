const RecomendacionService = require(
  "../services/RecomendacionService"
);
const { tienePermiso } = require("../config/permisos");


class RecomendacionController {
  async obtenerRecomendaciones(
    req,
    res
  ) {
    try {
      /*
       * Por defecto intentamos aplicar la capa generativa.
       *
       * Para comparar con el motor determinístico:
       * GET /api/recomendaciones?ia=false
       */
      const usarIA =
        String(
          req.query.ia ||
          "true"
        ).toLowerCase() !==
        "false";

      const resultado =
        await RecomendacionService
          .obtenerRecomendaciones({
            usarIA,
            incluirComerciales: tienePermiso(req.usuario, "flowia.comercial"),
          });

      return res
        .status(200)
        .json({
          mensaje:
            "Recomendaciones obtenidas correctamente.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al obtener recomendaciones:",
        error
      );

      return res
        .status(500)
        .json({
          mensaje:
            "No se pudieron obtener las recomendaciones.",

          error:
            error.message,
        });
    }
  }
}


module.exports =
  new RecomendacionController();
