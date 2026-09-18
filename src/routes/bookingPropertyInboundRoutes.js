const express = require("express");

const BookingPropertyInboundController = require(
  "../controllers/BookingPropertyInboundController"
);

const router = express.Router();

// =========================================================
// SIMULAR MODIFICACIÓN DE PROPIEDAD
// =========================================================

router.post(
  "/propiedades/modificacion",
  (req, res) =>
    BookingPropertyInboundController
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
    BookingPropertyInboundController
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
    BookingPropertyInboundController
      .procesarEvento(
        req,
        res
      )
);

module.exports = router;