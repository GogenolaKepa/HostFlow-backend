const DashboardService = require("../services/DashboardService");

class DashboardController {
  obtenerDashboard(req, res) {
    try {
      const resumen = DashboardService.obtenerResumen();
      const proximasReservas = DashboardService.obtenerProximasReservas();
      const alertas = DashboardService.obtenerAlertas();

      return res.status(200).json({
        resumen,
        proximasReservas,
        alertas
      });
    } catch (error) {
      return res.status(500).json({
        mensaje: "Error al obtener el dashboard.",
        error: error.message
      });
    }
  }
}

module.exports = new DashboardController();