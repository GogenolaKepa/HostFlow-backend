const express = require("express");
const PropiedadController = require("../controllers/PropiedadController");

const router = express.Router();

router.get("/", (req, res) =>
  PropiedadController.obtenerPropiedades(req, res)
);

router.get("/:id", (req, res) =>
  PropiedadController.obtenerPropiedadPorId(req, res)
);

router.post("/", (req, res) =>
  PropiedadController.crearPropiedad(req, res)
);

router.put("/:id", (req, res) =>
  PropiedadController.modificarPropiedad(req, res)
);

router.patch("/:id/estado", (req, res) =>
  PropiedadController.cambiarEstadoPropiedad(req, res)
);

module.exports = router;