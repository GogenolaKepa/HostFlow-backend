const PropiedadCanalService = require(
  "../services/PropiedadCanalService"
);

class PropiedadCanalController {
  // =========================================================
  // OBTENER CANALES DE UNA PROPIEDAD
  // =========================================================

  async obtenerCanales(
    req,
    res
  ) {
    try {
      const { id } = req.params;

      const canales =
        await PropiedadCanalService.obtenerCanales(
          id
        );

      return res.status(200).json({
        mensaje:
          "Canales de la propiedad obtenidos correctamente.",
        canales,
      });
    } catch (error) {
      console.error(
        "Error al obtener canales de propiedad:",
        error
      );

      return res.status(404).json({
        mensaje: error.message,
      });
    }
  }

  // =========================================================
  // PUBLICAR PROPIEDAD EN CANAL
  // =========================================================

  async publicarPropiedad(
    req,
    res
  ) {
    try {
      const { id } = req.params;
      const { canal } = req.body;

      if (!canal) {
        return res.status(400).json({
          mensaje:
            "Debe indicar el canal en el que desea publicar la propiedad.",
        });
      }

      const resultado =
        await PropiedadCanalService.publicarPropiedad(
          id,
          canal
        );

      return res.status(201).json({
        mensaje:
          resultado.mensaje,

        solicitud:
          resultado.solicitud,

        respuestaProveedor:
          resultado.respuestaProveedor,

        vinculacion:
          resultado.vinculacion,
      });
    } catch (error) {
      console.error(
        "Error al publicar propiedad:",
        error
      );

      return res.status(400).json({
        mensaje: error.message,
      });
    }
  }
}

module.exports =
  new PropiedadCanalController();