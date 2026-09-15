const express = require("express");
const ReservaController = require("../controllers/ReservaController");

const router = express.Router();

// =========================================================
// CONSULTAS
// =========================================================

// Obtener todas las reservas
router.get("/", (req, res) =>
  ReservaController.obtenerReservas(req, res)
);

// Obtener una reserva por ID
router.get("/:id", (req, res) =>
  ReservaController.obtenerReservaPorId(req, res)
);

// =========================================================
// RESERVAS MANUALES
// =========================================================

// Crear una reserva manual
router.post("/", (req, res) =>
  ReservaController.crearReserva(req, res)
);

// Modificar una reserva manual
router.put("/:id", (req, res) =>
  ReservaController.modificarReserva(req, res)
);

// Cancelar una reserva manual
router.patch("/:id/cancelar", (req, res) =>
  ReservaController.cancelarReserva(req, res)
);

// =========================================================
// AIRBNB
// =========================================================

// Crear una propuesta de cambio Airbnb
router.post(
  "/:id/airbnb/propuesta",
  (req, res) =>
    ReservaController.proponerCambioAirbnb(req, res)
);

// Simular aceptación desde Airbnb
router.post(
  "/airbnb/solicitudes/:idSolicitud/aceptar",
  (req, res) =>
    ReservaController.procesarAceptacionAirbnb(req, res)
);

// Simular rechazo desde Airbnb
router.post(
  "/airbnb/solicitudes/:idSolicitud/rechazar",
  (req, res) =>
    ReservaController.procesarRechazoAirbnb(req, res)
);

// =========================================================
// BOOKING
// =========================================================

// Solicitar cambio de checkout / precio
router.post(
  "/:id/booking/estadia",
  (req, res) =>
    ReservaController.cambiarEstadiaBooking(req, res)
);

// Reportar no-show
router.post(
  "/:id/booking/no-show",
  (req, res) =>
    ReservaController.reportarNoShowBooking(req, res)
);

// Simular que Booking procesó la operación
// y HostFlow volvió a sincronizar la reserva
router.post(
  "/booking/operaciones/:idOperacion/sincronizar",
  (req, res) =>
    ReservaController.procesarSincronizacionBooking(req, res)
);

module.exports = router;