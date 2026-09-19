const express = require(
  "express"
);

const PropiedadController = require(
  "../controllers/PropiedadController"
);

const PropiedadCanalController = require(
  "../controllers/PropiedadCanalController"
);

const PropiedadImagenController = require(
  "../controllers/PropiedadImagenController"
);

const propiedadImagenUpload = require(
  "../middlewares/propiedadImagenUpload"
);

const router =
  express.Router();

// =========================================================
// PROPIEDADES
// =========================================================

router.get(
  "/",
  (req, res) =>
    PropiedadController.obtenerPropiedades(
      req,
      res
    )
);

router.get(
  "/:id",
  (req, res) =>
    PropiedadController.obtenerPropiedadPorId(
      req,
      res
    )
);

router.post(
  "/",
  (req, res) =>
    PropiedadController.crearPropiedad(
      req,
      res
    )
);

router.put(
  "/:id",
  (req, res) =>
    PropiedadController.modificarPropiedad(
      req,
      res
    )
);

router.patch(
  "/:id/estado",
  (req, res) =>
    PropiedadController.cambiarEstadoPropiedad(
      req,
      res
    )
);

// =========================================================
// CANALES DE LA PROPIEDAD
// =========================================================

router.get(
  "/:id/canales",
  (req, res) =>
    PropiedadCanalController.obtenerCanales(
      req,
      res
    )
);

router.post(
  "/:id/canales/publicar",
  (req, res) =>
    PropiedadCanalController.publicarPropiedad(
      req,
      res
    )
);

// =========================================================
// IMÁGENES - GALERÍA ACTIVA
// =========================================================

router.get(
  "/:id/imagenes",
  (req, res) =>
    PropiedadImagenController.obtenerImagenes(
      req,
      res
    )
);

// =========================================================
// IMÁGENES - TODAS
// =========================================================
//
// Incluye:
//
// - Activas
// - PendienteEliminacion
// - Eliminadas
//
// =========================================================

router.get(
  "/:id/imagenes/todas",
  (req, res) =>
    PropiedadImagenController.obtenerTodasLasImagenes(
      req,
      res
    )
);

// =========================================================
// AGREGAR IMAGEN MEDIANTE URL
// =========================================================

router.post(
  "/:id/imagenes",
  (req, res) =>
    PropiedadImagenController.agregarImagen(
      req,
      res
    )
);

// =========================================================
// SUBIR IMÁGENES DESDE DISPOSITIVO
// =========================================================
//
// Endpoint:
//
// POST /api/propiedades/:id/imagenes/upload
//
// Content-Type:
//
// multipart/form-data
//
// Campo esperado:
//
// imagenes
//
// Permite seleccionar hasta 20 imágenes.
//
// Ejemplo:
//
// imagenes: foto1.jpg
// imagenes: foto2.jpg
// imagenes: foto3.webp
//
// =========================================================

router.post(
  "/:id/imagenes/upload",

  (
    req,
    res,
    next
  ) => {
    propiedadImagenUpload.array(
      "imagenes",
      20
    )(
      req,
      res,
      (error) => {
        if (error) {
          console.error(
            "Error de Multer al subir imágenes:",
            error
          );

          return res
            .status(400)
            .json({
              mensaje:
                error.message ||
                "No se pudieron procesar las imágenes seleccionadas.",
            });
        }

        next();
      }
    );
  },

  (req, res) =>
    PropiedadImagenController.subirImagenes(
      req,
      res
    )
);

// =========================================================
// MODIFICAR IMAGEN
// =========================================================

router.put(
  "/:id/imagenes/:idImagen",
  (req, res) =>
    PropiedadImagenController.modificarImagen(
      req,
      res
    )
);

// =========================================================
// ESTABLECER IMAGEN PRINCIPAL
// =========================================================

router.patch(
  "/:id/imagenes/:idImagen/principal",
  (req, res) =>
    PropiedadImagenController.establecerPrincipal(
      req,
      res
    )
);

// =========================================================
// CAMBIAR ORDEN
// =========================================================

router.patch(
  "/:id/imagenes/:idImagen/orden",
  (req, res) =>
    PropiedadImagenController.cambiarOrden(
      req,
      res
    )
);

// =========================================================
// ELIMINAR IMAGEN
// =========================================================

router.delete(
  "/:id/imagenes/:idImagen",
  (req, res) =>
    PropiedadImagenController.eliminarImagen(
      req,
      res
    )
);

// =========================================================
// RESTAURAR IMAGEN
// =========================================================

router.patch(
  "/:id/imagenes/:idImagen/restaurar",
  (req, res) =>
    PropiedadImagenController.restaurarImagen(
      req,
      res
    )
);

module.exports =
  router;