const express = require(
  "express"
);

const RecomendacionController = require(
  "../controllers/RecomendacionController"
);


const router =
  express.Router();


router.get(
  "/",
  (req, res) =>
    RecomendacionController
      .obtenerRecomendaciones(
        req,
        res
      )
);


module.exports =
  router;