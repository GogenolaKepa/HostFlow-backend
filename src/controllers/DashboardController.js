const DashboardService = require(
  "../services/DashboardService"
);

class DashboardController {
  async obtenerDashboard(
    req,
    res
  ) {
    try {
      const alertas =
        await DashboardService
          .obtenerAlertas();

      const resumen =
        DashboardService
          .obtenerResumen(
            alertas
          );

      const proximasReservas =
        DashboardService
          .obtenerProximasReservas();

      return res.status(200).json({
        resumen,
        proximasReservas,
        alertas,
      });
    } catch (error) {
      console.error(
        "Error al obtener dashboard:",
        error
      );

      return res.status(500).json({
        mensaje:
          "Error al obtener el dashboard.",

        error:
          error.message,
      });
    }
  }
}

module.exports =
  new DashboardController();
