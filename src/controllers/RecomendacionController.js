const RecomendacionService = require(
  "../services/RecomendacionService"
);


class RecomendacionController {
  async obtenerRecomendaciones(
    req,
    res
  ) {
    try {
      const resultado =
        await RecomendacionService
          .obtenerRecomendaciones();

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