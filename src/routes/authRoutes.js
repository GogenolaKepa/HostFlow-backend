const express = require("express");
const AuthController = require("../controllers/AuthController");
const autenticacion = require("../middlewares/autenticacion");
const cambioPasswordObligatorio = require("../middlewares/cambioPasswordObligatorio");
const { tienePermiso } = require("../config/permisos");
const limitarLogin = require("../middlewares/limitarLogin");

const router = express.Router();

// Única operación pública de autenticación.
router.post("/login", limitarLogin(), express.json({ limit: "8kb" }), (req, res) => AuthController.login(req, res));
router.use(autenticacion);
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
function permiso(accion) {
  return (req, res, next) => tienePermiso(req.usuario, accion) ? next()
    : res.status(403).json({ mensaje: "No tiene permiso para realizar esta acción." });
}
router.get("/me", (req, res) => AuthController.obtenerSesion(req, res));
router.patch("/me", cambioPasswordObligatorio, permiso("cuenta.modificar"), express.json({ limit: "8kb" }), (req, res) => AuthController.editarPerfil(req, res));
router.post("/cambiar-password", permiso("cuenta.password"), express.json({ limit: "8kb" }), (req, res) => AuthController.cambiarPassword(req, res));
router.post("/logout", (req, res) => AuthController.logout(req, res));

// El parser JSON no debe imprimir ni devolver fragmentos del cuerpo del login.
router.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return res.status(error.status).json({ mensaje: "El cuerpo de la solicitud no es válido." });
  }
  return next(error);
});

module.exports = router;
