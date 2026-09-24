const AlertaService = require(
  "../services/AlertaService"
);

class AlertaController {
  // =========================================================
  // LISTAR ALERTAS
  // =========================================================

  async obtenerAlertas(
    req,
    res
  ) {
    try {
      const alertas =
        await AlertaService
          .obtenerAlertas({
            estado:
              req.query.estado,

            categoria:
              req.query.categoria,

            severidad:
              req.query.severidad,
          });

      return res.status(200).json({
        mensaje:
          "Alertas obtenidas correctamente.",

        alertas,
      });
    } catch (error) {
      console.error(
        "Error al obtener alertas:",
        error
      );

      return res.status(500).json({
        mensaje:
          "No se pudieron obtener las alertas.",

        error:
          error.message,
      });
    }
  }

  // =========================================================
  // RESUMEN
  // =========================================================

  async obtenerResumen(
    req,
    res
  ) {
    try {
      const resumen =
        await AlertaService
          .obtenerResumen();

      return res.status(200).json({
        mensaje:
          "Resumen de alertas obtenido correctamente.",

        resumen,
      });
    } catch (error) {
      console.error(
        "Error al obtener resumen de alertas:",
        error
      );

      return res.status(500).json({
        mensaje:
          "No se pudo obtener el resumen de alertas.",

        error:
          error.message,
      });
    }
  }

  // =========================================================
  // SINCRONIZAR / REGENERAR ALERTAS
  // =========================================================

  async sincronizarAlertas(
    req,
    res
  ) {
    try {
      const resultado =
        await AlertaService
          .sincronizarAlertasOperativas();

      return res.status(200).json({
        mensaje:
          "Alertas operativas sincronizadas correctamente.",

        resultado,
      });
    } catch (error) {
      console.error(
        "Error al sincronizar alertas:",
        error
      );

      return res.status(500).json({
        mensaje:
          "No se pudieron sincronizar las alertas operativas.",

        error:
          error.message,
      });
    }
  }

  // =========================================================
  // MARCAR LEÍDA
  // =========================================================

  async marcarLeida(
    req,
    res
  ) {
    try {
      const alerta =
        await AlertaService
          .marcarLeida(
            req.params.id
          );

      return res.status(200).json({
        mensaje:
          "Alerta marcada como leída.",

        alerta,
      });
    } catch (error) {
      return res.status(404).json({
        mensaje:
          error.message,
      });
    }
  }

  // =========================================================
  // RESOLVER
  // =========================================================

  async resolverAlerta(
    req,
    res
  ) {
    try {
      const alerta =
        await AlertaService
          .resolverAlerta(
            req.params.id
          );

      return res.status(200).json({
        mensaje:
          "Alerta resuelta correctamente.",

        alerta,
      });
    } catch (error) {
      return res.status(404).json({
        mensaje:
          error.message,
      });
    }
  }
}

module.exports =
  new AlertaController();
