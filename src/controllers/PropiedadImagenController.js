const PropiedadImagenService = require(
  "../services/PropiedadImagenService"
);

class PropiedadImagenController {
  // =========================================================
  // OBTENER GALERÍA ACTIVA
  // =========================================================

  async obtenerImagenes(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const imagenes =
        await PropiedadImagenService
          .obtenerImagenes(
            id
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Galería obtenida correctamente.",

          imagenes,
        });
    } catch (error) {
      console.error(
        "Error al obtener imágenes de propiedad:",
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

  // =========================================================
  // OBTENER TODAS LAS IMÁGENES
  // =========================================================
  //
  // Incluye:
  //
  // - Activas
  // - PendienteEliminacion
  // - Eliminadas
  //
  // Nos sirve para administración y restauración.
  // =========================================================

  async obtenerTodasLasImagenes(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const imagenes =
        await PropiedadImagenService
          .obtenerTodasLasImagenes(
            id
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Imágenes de la propiedad obtenidas correctamente.",

          imagenes,
        });
    } catch (error) {
      console.error(
        "Error al obtener todas las imágenes:",
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

  // =========================================================
  // AGREGAR IMAGEN MEDIANTE URL
  // =========================================================

  async agregarImagen(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const resultado =
        await PropiedadImagenService
          .agregarImagen(
            id,
            req.body
          );

      return res
        .status(201)
        .json({
          mensaje:
            "Imagen agregada correctamente.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al agregar imagen:",
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

  // =========================================================
  // SUBIR IMÁGENES DESDE DISPOSITIVO
  // =========================================================
  //
  // Recibe archivos mediante multipart/form-data.
  //
  // Campo esperado:
  //
  // imagenes
  //
  // Puede recibir hasta 20 archivos por request.
  //
  // Multer guarda físicamente los archivos en:
  //
  // uploads/propiedades/:id/
  //
  // Después construimos una URL pública y reutilizamos
  // exactamente el mismo servicio de imágenes que utiliza
  // HostFlow para las imágenes agregadas mediante URL.
  //
  // De esta manera:
  //
  // Archivo local
  //      ↓
  // /uploads/propiedades/...
  //      ↓
  // PropiedadImagenService.agregarImagen()
  //      ↓
  // PropiedadImagenes
  //      ↓
  // Airbnb / Booking
  //
  // =========================================================

  async subirImagenes(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;

      const archivos =
        req.files;

      if (
        !archivos ||
        !Array.isArray(
          archivos
        ) ||
        archivos.length === 0
      ) {
        return res
          .status(400)
          .json({
            mensaje:
              "Debe seleccionar al menos una imagen.",
          });
      }

      const resultados = [];

      // -----------------------------------------------------
      // Descripción opcional
      // -----------------------------------------------------
      //
      // Por ahora permitimos mandar una descripción general.
      //
      // En la interfaz podemos dejarla vacía cuando se suben
      // muchas imágenes y después editar cada foto
      // individualmente.
      // -----------------------------------------------------

      const descripcion =
        req.body
          ?.descripcion
          ?.trim() ||
        null;

      // -----------------------------------------------------
      // PROCESAR CADA ARCHIVO
      // -----------------------------------------------------

      for (
        const archivo
        of archivos
      ) {
        /*
         * Ejemplo generado:
         *
         * http://localhost:4000/
         * uploads/propiedades/2/
         * prop-2-123456.jpg
         */

        const urlImagen =
          `${req.protocol}://${req.get(
            "host"
          )}` +
          `/uploads/propiedades/${id}/` +
          `${archivo.filename}`;

        const resultado =
          await PropiedadImagenService
            .agregarImagen(
              id,
              {
                urlImagen,

                descripcion,

                origen:
                  "Manual",
              }
            );

        resultados.push({
          nombreOriginal:
            archivo.originalname,

          nombreArchivo:
            archivo.filename,

          tipo:
            archivo.mimetype,

          tamanio:
            archivo.size,

          urlImagen,

          resultado,
        });
      }

      // -----------------------------------------------------
      // RESPUESTA
      // -----------------------------------------------------

      return res
        .status(201)
        .json({
          mensaje:
            archivos.length === 1
              ? "Imagen subida correctamente."
              : `${archivos.length} imágenes subidas correctamente.`,

          cantidad:
            archivos.length,

          imagenes:
            resultados,
        });
    } catch (error) {
      console.error(
        "Error al subir imágenes desde dispositivo:",
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

  // =========================================================
  // MODIFICAR IMAGEN
  // =========================================================

  async modificarImagen(
    req,
    res
  ) {
    try {
      const {
        id,
        idImagen,
      } =
        req.params;

      const resultado =
        await PropiedadImagenService
          .modificarImagen(
            id,
            idImagen,
            req.body
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Imagen modificada correctamente.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al modificar imagen:",
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

  // =========================================================
  // ESTABLECER IMAGEN PRINCIPAL
  // =========================================================

  async establecerPrincipal(
    req,
    res
  ) {
    try {
      const {
        id,
        idImagen,
      } =
        req.params;

      const resultado =
        await PropiedadImagenService
          .establecerPrincipal(
            id,
            idImagen
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Imagen principal actualizada correctamente.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al establecer imagen principal:",
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

  // =========================================================
  // CAMBIAR ORDEN
  // =========================================================

  async cambiarOrden(
    req,
    res
  ) {
    try {
      const {
        id,
        idImagen,
      } =
        req.params;

      const { orden } =
        req.body;

      if (
        orden === undefined ||
        orden === null ||
        orden === ""
      ) {
        return res
          .status(400)
          .json({
            mensaje:
              "Debe indicar el nuevo orden de la imagen.",
          });
      }

      const resultado =
        await PropiedadImagenService
          .cambiarOrden(
            id,
            idImagen,
            orden
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Orden de imagen actualizado correctamente.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al cambiar orden de imagen:",
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

  // =========================================================
  // ELIMINAR IMAGEN
  // =========================================================
  //
  // No hace DELETE físico.
  //
  // HostFlow:
  //
  // Activa
  //   ↓
  // PendienteEliminacion
  //   ↓
  // sincroniza Airbnb / Booking
  //   ↓
  // Eliminada
  //
  // =========================================================

  async eliminarImagen(
    req,
    res
  ) {
    try {
      const {
        id,
        idImagen,
      } =
        req.params;

      const resultado =
        await PropiedadImagenService
          .eliminarImagen(
            id,
            idImagen
          );

      return res
        .status(200)
        .json({
          mensaje:
            resultado.eliminacionCompleta
              ? "Imagen eliminada correctamente."
              : "La imagen quedó pendiente de eliminación en uno o más canales.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al eliminar imagen:",
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

  // =========================================================
  // RESTAURAR IMAGEN
  // =========================================================

  async restaurarImagen(
    req,
    res
  ) {
    try {
      const {
        id,
        idImagen,
      } =
        req.params;

      const resultado =
        await PropiedadImagenService
          .restaurarImagen(
            id,
            idImagen
          );

      return res
        .status(200)
        .json({
          mensaje:
            "Imagen restaurada correctamente.",

          ...resultado,
        });
    } catch (error) {
      console.error(
        "Error al restaurar imagen:",
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
  new PropiedadImagenController();