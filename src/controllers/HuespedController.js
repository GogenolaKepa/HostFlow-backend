const HuespedService =
  require("../services/HuespedService");

class HuespedController {
  async obtenerHuespedes(
    req,
    res
  ) {
    try {
      const huespedes =
        await HuespedService
          .obtenerHuespedes();

      return res
        .status(200)
        .json({
          mensaje:
            "Huéspedes obtenidos correctamente.",
          huespedes,
        });
    } catch (error) {
      return res
        .status(500)
        .json({
          mensaje:
            "Error al obtener los huéspedes.",
          error:
            error.message,
        });
    }
  }

  async obtenerHuespedPorId(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const huesped =
        await HuespedService
          .obtenerHuespedPorId(
            id
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Huésped obtenido correctamente.",
          huesped,
        });
    } catch (error) {
      return res
        .status(404)
        .json({
          mensaje:
            error.message,
        });
    }
  }

  async crearHuesped(
    req,
    res
  ) {
    try {
      const nuevoHuesped =
        await HuespedService
          .crearHuesped(
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Huésped registrado correctamente.",
          huesped:
            nuevoHuesped,
        });
    } catch (error) {
      return res
        .status(400)
        .json({
          mensaje:
            error.message,
        });
    }
  }

  async modificarHuesped(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const huespedActualizado =
        await HuespedService
          .modificarHuesped(
            id,
            req.body
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Huésped modificado correctamente.",
          huesped:
            huespedActualizado,
        });
    } catch (error) {
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
  new HuespedController();