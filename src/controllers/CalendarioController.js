const CalendarioService = require(
  "../services/CalendarioService"
);

class CalendarioController {
  // =========================================================
  // OBTENER CALENDARIO MENSUAL
  // =========================================================
  //
  // GET /api/calendario?anio=2026&mes=9
  //
  // Opcional:
  //
  // GET /api/calendario?anio=2026&mes=9&idPropiedad=2
  //
  // =========================================================

  async obtenerCalendarioMensual(
    req,
    res
  ) {
    try {
      const {
        anio,
        mes,
        idPropiedad,
      } =
        req.query;

      const resultado =
        await CalendarioService
          .obtenerCalendarioMensual(
            anio,
            mes,
            idPropiedad
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Calendario obtenido correctamente.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al obtener calendario:",
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
  new CalendarioController();
