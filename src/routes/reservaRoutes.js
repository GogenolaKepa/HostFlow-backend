const express = require("express");
const ReservaController = require("../controllers/ReservaController");

const router = express.Router();

router.get("/", (req, res) => ReservaController.obtenerReservas(req, res));

router.get("/:id", (req, res) => ReservaController.obtenerReservaPorId(req, res));

router.post("/", (req, res) => ReservaController.crearReserva(req, res));

router.put("/:id", (req, res) => ReservaController.modificarReserva(req, res));

router.patch("/:id/cancelar", (req, res) =>
  ReservaController.cancelarReserva(req, res)
);

module.exports = router;