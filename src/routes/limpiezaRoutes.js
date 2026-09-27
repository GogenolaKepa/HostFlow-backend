const express = require(
  "express"
);

const LimpiezaController = require(
  "../controllers/LimpiezaController"
);

const router =
  express.Router();

router.get(
  "/",
  (req, res) =>
    LimpiezaController
      .obtenerLimpiezas(
        req,
        res
      )
);

router.get(
  "/resumen",
  (req, res) =>
    LimpiezaController
      .obtenerResumen(
        req,
        res
      )
);

router.post(
  "/sincronizar",
  (req, res) =>
    LimpiezaController
      .sincronizar(
        req,
        res
      )
);

router.patch(
  "/:id/estado",
  (req, res) =>
    LimpiezaController
      .cambiarEstado(
        req,
        res
      )
);

module.exports =
  router;