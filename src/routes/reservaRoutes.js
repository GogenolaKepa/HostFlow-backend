const express = require("express");

const ReservaController = require("../controllers/ReservaController");

const router = express.Router();

// =========================================================
// CONSULTAS
// =========================================================

// Obtener todas las reservas
router.get(
  "/",
  (req, res) =>
    ReservaController.obtenerReservas(
      req,
      res
    )
);

// Obtener timeline / historial de una reserva
router.get(
  "/:id/eventos",
  (req, res) =>
    ReservaController.obtenerEventosReserva(
      req,
      res
    )
);

// Obtener mensajes de una reserva
router.get(
  "/:id/mensajes",
  (req, res) =>
    ReservaController.obtenerMensajesReserva(
      req,
      res
    )
);

// Registrar un mensaje asociado a una reserva
router.post(
  "/:id/mensajes",
  (req, res) =>
    ReservaController.registrarMensajeReserva(
      req,
      res
    )
);

// Obtener incidencias de una reserva
router.get(
  "/:id/incidencias",
  (req, res) =>
    ReservaController.obtenerIncidenciasReserva(
      req,
      res
    )
);

// Registrar una incidencia
router.post(
  "/:id/incidencias",
  (req, res) =>
    ReservaController.registrarIncidenciaReserva(
      req,
      res
    )
);

// Actualizar una incidencia
router.patch(
  "/:id/incidencias/:idIncidencia",
  (req, res) =>
    ReservaController.actualizarIncidenciaReserva(
      req,
      res
    )
);

// Resolver una incidencia
router.post(
  "/:id/incidencias/:idIncidencia/resolver",
  (req, res) =>
    ReservaController.resolverIncidenciaReserva(
      req,
      res
    )
);

// Obtener observaciones internas de una reserva
router.get(
  "/:id/observaciones",
  (req, res) =>
    ReservaController.obtenerObservacionesReserva(
      req,
      res
    )
);

// Registrar una observación interna
router.post(
  "/:id/observaciones",
  (req, res) =>
    ReservaController.registrarObservacionReserva(
      req,
      res
    )
);

// Actualizar una observación interna
router.patch(
  "/:id/observaciones/:idObservacion",
  (req, res) =>
    ReservaController.actualizarObservacionReserva(
      req,
      res
    )
);

// Fijar o desfijar una observación
router.patch(
  "/:id/observaciones/:idObservacion/fijar",
  (req, res) =>
    ReservaController.cambiarFijadaObservacionReserva(
      req,
      res
    )
);

// Eliminar una observación interna
router.delete(
  "/:id/observaciones/:idObservacion",
  (req, res) =>
    ReservaController.eliminarObservacionReserva(
      req,
      res
    )
);

// Obtener una reserva por ID
router.get(
  "/:id",
  (req, res) =>
    ReservaController.obtenerReservaPorId(
      req,
      res
    )
);

// =========================================================
// RESERVAS MANUALES
// =========================================================

// Crear una reserva manual
router.post(
  "/",
  (req, res) =>
    ReservaController.crearReserva(
      req,
      res
    )
);

// Modificar una reserva manual
router.put(
  "/:id",
  (req, res) =>
    ReservaController.modificarReserva(
      req,
      res
    )
);

// Cancelar una reserva manual
router.patch(
  "/:id/cancelar",
  (req, res) =>
    ReservaController.cancelarReserva(
      req,
      res
    )
);

// =========================================================
// AIRBNB
// =========================================================

// Crear una propuesta de cambio Airbnb
router.post(
  "/:id/airbnb/propuesta",
  (req, res) =>
    ReservaController.proponerCambioAirbnb(
      req,
      res
    )
);

// Simular aceptación desde Airbnb
router.post(
  "/airbnb/solicitudes/:idSolicitud/aceptar",
  (req, res) =>
    ReservaController.procesarAceptacionAirbnb(
      req,
      res
    )
);

// Simular rechazo desde Airbnb
router.post(
  "/airbnb/solicitudes/:idSolicitud/rechazar",
  (req, res) =>
    ReservaController.procesarRechazoAirbnb(
      req,
      res
    )
);

// =========================================================
// BOOKING
// =========================================================

// Solicitar cambio de checkout / precio
router.post(
  "/:id/booking/estadia",
  (req, res) =>
    ReservaController.cambiarEstadiaBooking(
      req,
      res
    )
);

// Reportar no-show
router.post(
  "/:id/booking/no-show",
  (req, res) =>
    ReservaController.reportarNoShowBooking(
      req,
      res
    )
);

// Simular que Booking procesó la operación
// y HostFlow volvió a sincronizar la reserva
router.post(
  "/booking/operaciones/:idOperacion/sincronizar",
  (req, res) =>
    ReservaController.procesarSincronizacionBooking(
      req,
      res
    )
);

module.exports = router;
