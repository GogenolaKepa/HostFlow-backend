const express = require(
  "express"
);

const AlertaController = require(
  "../controllers/AlertaController"
);

const router =
  express.Router();

// =========================================================
// ALERTAS
// =========================================================

router.get(
  "/",
  (req, res) =>
    AlertaController.obtenerAlertas(
      req,
      res
    )
);

router.get(
  "/resumen",
  (req, res) =>
    AlertaController.obtenerResumen(
      req,
      res
    )
);

router.post(
  "/sincronizar",
  (req, res) =>
    AlertaController.sincronizarAlertas(
      req,
      res
    )
);

router.patch(
  "/:id/leida",
  (req, res) =>
    AlertaController.marcarLeida(
      req,
      res
    )
);

router.patch(
  "/:id/resolver",
  (req, res) =>
    AlertaController.resolverAlerta(
      req,
      res
    )
);

module.exports =
  router;
