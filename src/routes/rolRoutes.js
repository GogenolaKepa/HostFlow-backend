const express = require("express");
const UsuarioController = require("../controllers/UsuarioController");
const router = express.Router();
router.get("/", (req, res) => UsuarioController.roles(req, res));
module.exports = router;
