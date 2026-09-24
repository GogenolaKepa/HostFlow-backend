const DashboardService = require(
  "../services/DashboardService"
);

class DashboardController {
  async obtenerDashboard(
    req,
    res
  ) {
    try {
      /*
       * Alertas, resumen y próximas reservas
       * ya salen de Azure SQL.
       */
      const alertas =
        await DashboardService
          .obtenerAlertas();

      const [
        resumen,
        proximasReservas,
      ] =
        await Promise.all([
          DashboardService
            .obtenerResumen(
              alertas
            ),

          DashboardService
            .obtenerProximasReservas(),
        ]);

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
  async obtenerHistorico(
    req,
    res
  ) {
    try {
      const meses =
        Number(
          req.query.meses ||
          6
        );

      const historico =
        await DashboardService
          .obtenerHistoricoMensual(
            meses
          );

      return res.status(200).json({
        mensaje:
          "Histórico mensual obtenido correctamente.",

        historico,
      });
    } catch (error) {
      console.error(
        "Error al obtener histórico mensual:",
        error
      );

      return res.status(500).json({
        mensaje:
          "No se pudo obtener el histórico mensual.",

        error:
          error.message,
      });
    }
  }


  async obtenerOpcionesReportes(
    req,
    res
  ) {
    try {
      const opciones =
        await DashboardService
          .obtenerOpcionesReportes();

      return res
        .status(200)
        .json({
          mensaje:
            "Opciones de reportes obtenidas correctamente.",

          opciones,
        });
    } catch (error) {
      console.error(
        "Error al obtener opciones de reportes:",
        error
      );

      return res
        .status(500)
        .json({
          mensaje:
            "No se pudieron obtener las opciones de reportes.",

          error:
            error.message,
        });
    }
  }

  async obtenerReportes(
    req,
    res
  ) {
    try {
      const reportes =
        await DashboardService
          .obtenerReportes({
            periodo:
              req.query.periodo,

            meses:
              req.query.meses,

            fechaDesde:
              req.query.fechaDesde,

            fechaHasta:
              req.query.fechaHasta,

            idPropiedad:
              req.query.idPropiedad,

            canal:
              req.query.canal,

            estado:
              req.query.estado,
          });

      return res
        .status(200)
        .json({
          mensaje:
            "Reportes obtenidos correctamente.",

          reportes,
        });
    } catch (error) {
      console.error(
        "Error al obtener reportes:",
        error
      );

      return res
        .status(400)
        .json({
          mensaje:
            error.message ||
            "No se pudieron obtener los reportes.",
        });
    }
  }

}

module.exports =
  new DashboardController();
