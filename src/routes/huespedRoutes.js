const express = require("express");
const HuespedController = require("../controllers/HuespedController");

const router = express.Router();

router.get("/", (req, res) =>
  HuespedController.obtenerHuespedes(req, res)
);

router.get("/:id", (req, res) =>
  HuespedController.obtenerHuespedPorId(req, res)
);

router.post("/", (req, res) =>
  HuespedController.crearHuesped(req, res)
);

router.put("/:id", (req, res) =>
  HuespedController.modificarHuesped(req, res)
);

module.exports = router;