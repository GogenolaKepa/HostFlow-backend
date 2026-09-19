const express = require(
  "express"
);

const BookingPropertyImageInboundController = require(
  "../controllers/BookingPropertyImageInboundController"
);

const router =
  express.Router();

// =========================================================
// SIMULAR NUEVA IMAGEN
// =========================================================

router.post(
  "/propiedades/imagenes/creacion",

  (req, res) =>
    BookingPropertyImageInboundController
      .simularImagenCreada(
        req,
        res
      )
);

// =========================================================
// SIMULAR ACTUALIZACIÓN DE IMAGEN
// =========================================================

router.post(
  "/propiedades/imagenes/modificacion",

  (req, res) =>
    BookingPropertyImageInboundController
      .simularImagenActualizada(
        req,
        res
      )
);

// =========================================================
// SIMULAR ELIMINACIÓN DE IMAGEN
// =========================================================

router.post(
  "/propiedades/imagenes/eliminacion",

  (req, res) =>
    BookingPropertyImageInboundController
      .simularImagenEliminada(
        req,
        res
      )
);

// =========================================================
// SIMULAR CAMBIO DE IMAGEN PRINCIPAL
// =========================================================

router.post(
  "/propiedades/imagenes/principal",

  (req, res) =>
    BookingPropertyImageInboundController
      .simularImagenPrincipal(
        req,
        res
      )
);

// =========================================================
// OBTENER EVENTOS PENDIENTES
// =========================================================

router.get(
  "/propiedades/imagenes/eventos",

  (req, res) =>
    BookingPropertyImageInboundController
      .obtenerEventosPendientes(
        req,
        res
      )
);

// =========================================================
// PROCESAR EVENTO
// =========================================================

router.post(
  "/propiedades/imagenes/eventos/:idEvento/procesar",

  (req, res) =>
    BookingPropertyImageInboundController
      .procesarEvento(
        req,
        res
      )
);

module.exports =
  router;