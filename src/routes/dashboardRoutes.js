const express = require("express");
const DashboardController = require("../controllers/DashboardController");

const router = express.Router();

router.get("/resumen", (req, res) => DashboardController.obtenerDashboard(req, res));

module.exports = router;