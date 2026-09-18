const express = require("express");

const PropiedadController = require(
  "../controllers/PropiedadController"
);

const PropiedadCanalController = require(
  "../controllers/PropiedadCanalController"
);

const PropiedadImagenController = require(
  "../controllers/PropiedadImagenController"
);

const router = express.Router();

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
// Incluye activas, pendientes de eliminación
// y eliminadas.
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
// AGREGAR IMAGEN
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

module.exports = router;