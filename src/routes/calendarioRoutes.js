const express = require(
  "express"
);

const CalendarioController = require(
  "../controllers/CalendarioController"
);

const router =
  express.Router();

// =========================================================
// OBTENER CALENDARIO MENSUAL
// =========================================================
//
// GET /api/calendario?anio=2026&mes=9
//
// Opcional:
//
// GET /api/calendario?anio=2026&mes=9&idPropiedad=2
//
// =========================================================

router.get(
  "/",
  (req, res) =>
    CalendarioController
      .obtenerCalendarioMensual(
        req,
        res
      )
);

module.exports =
  router;