const LimpiezaService = require(
  "../services/LimpiezaService"
);

class LimpiezaController {
  async obtenerLimpiezas(
    req,
    res
  ) {
    try {
      const limpiezas =
        await LimpiezaService
          .obtenerLimpiezas({
            estado:
              req.query.estado,

            idPropiedad:
              req.query.idPropiedad,

            desde:
              req.query.desde,

            hasta:
              req.query.hasta,
          });

      return res
        .status(200)
        .json({
          limpiezas,
        });
    } catch (error) {
      console.error(
        "Error al obtener limpiezas:",
        error
      );

      return res
        .status(500)
        .json({
          mensaje:
            error.message ||
            "No se pudieron obtener las tareas de limpieza.",
        });
    }
  }

  async obtenerResumen(
    req,
    res
  ) {
    try {
      const resumen =
        await LimpiezaService
          .obtenerResumen();

      return res
        .status(200)
        .json({
          resumen,
        });
    } catch (error) {
      console.error(
        "Error al obtener resumen de limpiezas:",
        error
      );

      return res
        .status(500)
        .json({
          mensaje:
            error.message ||
            "No se pudo obtener el resumen de limpiezas.",
        });
    }
  }

  async sincronizar(
    req,
    res
  ) {
    try {
      const resultado =
        await LimpiezaService
          .sincronizarLimpiezas();

      return res
        .status(200)
        .json({
          mensaje:
            "Tareas de limpieza sincronizadas correctamente.",

          resultado,
        });
    } catch (error) {
      console.error(
        "Error al sincronizar limpiezas:",
        error
      );

      return res
        .status(500)
        .json({
          mensaje:
            error.message ||
            "No se pudieron sincronizar las tareas de limpieza.",
        });
    }
  }

  async cambiarEstado(
    req,
    res
  ) {
    try {
      const tarea =
        await LimpiezaService
          .cambiarEstado(
            req.params.id,
            req.body.estado
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Estado de la tarea de limpieza actualizado correctamente.",

          tarea,
        });
    } catch (error) {
      console.error(
        "Error al cambiar estado de limpieza:",
        error
      );

      const mensaje =
        error.message ||
        "No se pudo actualizar la tarea de limpieza.";

      const esErrorValidacion =
        mensaje.includes(
          "no es válida"
        ) ||
        mensaje.includes(
          "no es válido"
        ) ||
        mensaje.includes(
          "no existe"
        ) ||
        mensaje.includes(
          "cancelada"
        );

      return res
        .status(
          esErrorValidacion
            ? 400
            : 500
        )
        .json({
          mensaje,
        });
    }
  }
}

module.exports =
  new LimpiezaController();