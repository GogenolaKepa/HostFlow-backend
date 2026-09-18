const express = require("express");

const AirbnbPropertyInboundController = require(
  "../controllers/AirbnbPropertyInboundController"
);

const router = express.Router();

// =========================================================
// SIMULAR MODIFICACIÓN DE PROPIEDAD
// =========================================================

router.post(
  "/propiedades/modificacion",
  (req, res) =>
    AirbnbPropertyInboundController
      .simularModificacionPropiedad(
        req,
        res
      )
);

// =========================================================
// OBTENER EVENTOS PENDIENTES
// =========================================================

router.get(
  "/propiedades/eventos",
  (req, res) =>
    AirbnbPropertyInboundController
      .obtenerEventosPendientes(
        req,
        res
      )
);

// =========================================================
// PROCESAR EVENTO
// =========================================================

router.post(
  "/propiedades/eventos/:idEvento/procesar",
  (req, res) =>
    AirbnbPropertyInboundController
      .procesarEvento(
        req,
        res
      )
);

module.exports = router;