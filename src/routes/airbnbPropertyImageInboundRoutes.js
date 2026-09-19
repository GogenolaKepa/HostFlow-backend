const express = require(
  "express"
);

const AirbnbPropertyImageInboundController = require(
  "../controllers/AirbnbPropertyImageInboundController"
);

const router =
  express.Router();

// =========================================================
// SIMULAR NUEVA IMAGEN
// =========================================================

router.post(
  "/propiedades/imagenes/creacion",

  (req, res) =>
    AirbnbPropertyImageInboundController
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
    AirbnbPropertyImageInboundController
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
    AirbnbPropertyImageInboundController
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
    AirbnbPropertyImageInboundController
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
    AirbnbPropertyImageInboundController
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
    AirbnbPropertyImageInboundController
      .procesarEvento(
        req,
        res
      )
);

module.exports =
  router;