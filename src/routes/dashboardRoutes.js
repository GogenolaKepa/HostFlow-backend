const express = require(
  "express"
);

const DashboardController = require(
  "../controllers/DashboardController"
);

const router =
  express.Router();

router.get(
  "/resumen",
  (req, res) =>
    DashboardController.obtenerDashboard(
      req,
      res
    )
);


router.get(
  "/historico",
  (req, res) =>
    DashboardController.obtenerHistorico(
      req,
      res
    )
);



router.get(
  "/reportes/opciones",
  (req, res) =>
    DashboardController.obtenerOpcionesReportes(
      req,
      res
    )
);

router.get(
  "/reportes",
  (req, res) =>
    DashboardController.obtenerReportes(
      req,
      res
    )
);

module.exports =
  router;
