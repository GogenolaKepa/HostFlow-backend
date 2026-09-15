const express = require("express");
const BookingInboundController = require("../controllers/BookingInboundController");

const router = express.Router();

// =========================================================
// SIMULACIÓN DE EVENTOS QUE LLEGAN DESDE BOOKING
// =========================================================

// Simular una nueva reserva creada en Booking
router.post(
  "/simulacion/nueva-reserva",
  (req, res) =>
    BookingInboundController.simularNuevaReserva(
      req,
      res
    )
);

// Simular una modificación hecha en Booking
router.post(
  "/simulacion/modificacion",
  (req, res) =>
    BookingInboundController.simularModificacionReserva(
      req,
      res
    )
);

// Simular una cancelación hecha en Booking
router.post(
  "/simulacion/cancelacion",
  (req, res) =>
    BookingInboundController.simularCancelacionReserva(
      req,
      res
    )
);

// =========================================================
// EVENTOS PENDIENTES DE PROCESAMIENTO
// =========================================================

// Consultar eventos pendientes
router.get(
  "/eventos",
  (req, res) =>
    BookingInboundController.obtenerEventosPendientes(
      req,
      res
    )
);

// Procesar un evento dentro de HostFlow
router.post(
  "/eventos/:idEvento/procesar",
  (req, res) =>
    BookingInboundController.procesarEvento(
      req,
      res
    )
);

module.exports = router;