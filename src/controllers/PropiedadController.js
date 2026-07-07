const PropiedadService = require("../services/PropiedadService");

class PropiedadController {
  obtenerPropiedades(req, res) {
    try {
      const propiedades = PropiedadService.obtenerPropiedades();

      return res.status(200).json({
        mensaje: "Propiedades obtenidas correctamente.",
        propiedades,
      });
    } catch (error) {
      return res.status(500).json({
        mensaje: "Error al obtener las propiedades.",
        error: error.message,
      });
    }
  }

  obtenerPropiedadPorId(req, res) {
    try {
      const { id } = req.params;

      const propiedad = PropiedadService.obtenerPropiedadPorId(id);

      return res.status(200).json({
        mensaje: "Propiedad obtenida correctamente.",
        propiedad,
      });
    } catch (error) {
      return res.status(404).json({
        mensaje: error.message,
      });
    }
  }

  crearPropiedad(req, res) {
    try {
      const nuevaPropiedad = PropiedadService.crearPropiedad(req.body);

      return res.status(201).json({
        mensaje: "Propiedad registrada correctamente.",
        propiedad: nuevaPropiedad,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  modificarPropiedad(req, res) {
    try {
      const { id } = req.params;

      const propiedadActualizada = PropiedadService.modificarPropiedad(
        id,
        req.body
      );

      return res.status(200).json({
        mensaje: "Propiedad modificada correctamente.",
        propiedad: propiedadActualizada,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }

  cambiarEstadoPropiedad(req, res) {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      const propiedadActualizada =
        PropiedadService.cambiarEstadoPropiedad(id, estado);

      return res.status(200).json({
        mensaje: "Estado de propiedad actualizado correctamente.",
        propiedad: propiedadActualizada,
      });
    } catch (error) {
      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }
}

module.exports = new PropiedadController();