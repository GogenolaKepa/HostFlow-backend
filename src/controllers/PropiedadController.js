const PropiedadService = require(
  "../services/PropiedadService"
);

class PropiedadController {
  // =========================================================
  // OBTENER TODAS
  // =========================================================

  async obtenerPropiedades(
    req,
    res
  ) {
    try {
      const propiedades =
        await PropiedadService.obtenerPropiedades();

      return res.status(200).json({
        mensaje:
          "Propiedades obtenidas correctamente.",
        propiedades,
      });
    } catch (error) {
      console.error(
        "Error al obtener propiedades:",
        error
      );

      return res.status(500).json({
        mensaje:
          "Error al obtener las propiedades.",
        error: error.message,
      });
    }
  }

  // =========================================================
  // OBTENER POR ID
  // =========================================================

  async obtenerPropiedadPorId(
    req,
    res
  ) {
    try {
      const { id } = req.params;

      const propiedad =
        await PropiedadService.obtenerPropiedadPorId(
          id
        );

      return res.status(200).json({
        mensaje:
          "Propiedad obtenida correctamente.",
        propiedad,
      });
    } catch (error) {
      return res.status(404).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // CREAR
  // =========================================================

  async crearPropiedad(
    req,
    res
  ) {
    try {
      const nuevaPropiedad =
        await PropiedadService.crearPropiedad(
          req.body
        );

      return res.status(201).json({
        mensaje:
          "Propiedad registrada correctamente.",
        propiedad: nuevaPropiedad,
      });
    } catch (error) {
      console.error(
        "Error al crear propiedad:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // MODIFICAR
  // =========================================================

  async modificarPropiedad(
    req,
    res
  ) {
    try {
      const { id } = req.params;

      const propiedadActualizada =
        await PropiedadService.modificarPropiedad(
          id,
          req.body
        );

      return res.status(200).json({
        mensaje:
          "Propiedad modificada correctamente.",
        propiedad:
          propiedadActualizada,
      });
    } catch (error) {
      console.error(
        "Error al modificar propiedad:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // CAMBIAR ESTADO
  // =========================================================

  async cambiarEstadoPropiedad(
    req,
    res
  ) {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      const propiedadActualizada =
        await PropiedadService.cambiarEstadoPropiedad(
          id,
          estado
        );

      return res.status(200).json({
        mensaje:
          "Estado de propiedad actualizado correctamente.",
        propiedad:
          propiedadActualizada,
      });
    } catch (error) {
      console.error(
        "Error al cambiar estado de propiedad:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }
}

module.exports =
  new PropiedadController();