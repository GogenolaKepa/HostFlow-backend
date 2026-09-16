const express = require("express");
const AirbnbInboundController = require("../controllers/AirbnbInboundController");

const router = express.Router();

// =========================================================
// SIMULACIÓN DE EVENTOS QUE LLEGAN DESDE AIRBNB
// =========================================================

// Simular una nueva reserva creada en Airbnb
router.post(
  "/simulacion/nueva-reserva",
  (req, res) =>
    AirbnbInboundController.simularNuevaReserva(
      req,
      res
    )
);

// Simular una modificación hecha en Airbnb
router.post(
  "/simulacion/modificacion",
  (req, res) =>
    AirbnbInboundController.simularModificacionReserva(
      req,
      res
    )
);

// Simular una cancelación hecha en Airbnb
router.post(
  "/simulacion/cancelacion",
  (req, res) =>
    AirbnbInboundController.simularCancelacionReserva(
      req,
      res
    )
);

// =========================================================
// EVENTOS PENDIENTES
// =========================================================

// Consultar eventos pendientes
router.get(
  "/eventos",
  (req, res) =>
    AirbnbInboundController.obtenerEventosPendientes(
      req,
      res
    )
);

// Procesar un evento dentro de HostFlow
router.post(
  "/eventos/:idEvento/procesar",
  (req, res) =>
    AirbnbInboundController.procesarEvento(
      req,
      res
    )
);

module.exports = router;