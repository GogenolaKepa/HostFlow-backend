const express = require("express");
const AuthController = require("../controllers/AuthController");
const autenticacion = require("../middlewares/autenticacion");

const router = express.Router();

// Única operación pública de autenticación.
router.post("/login", express.json(), (req, res) => AuthController.login(req, res));
router.use(autenticacion);
router.get("/me", (req, res) => AuthController.obtenerSesion(req, res));

// El parser JSON no debe imprimir ni devolver fragmentos del cuerpo del login.
router.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return res.status(error.status).json({ mensaje: "El cuerpo de la solicitud no es válido." });
  }
  return next(error);
});

module.exports = router;
