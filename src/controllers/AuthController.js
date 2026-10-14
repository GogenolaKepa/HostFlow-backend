const AuthService = require("../services/AuthService");
const { responderError } = require("../security/seguridadUsuarios");
const { secretoJWTValido } = require("../config/autenticacion");

class AuthController {
  async login(req, res) {
    res.set("Cache-Control", "no-store");
    if (!secretoJWTValido(process.env.JWT_SECRET)) return res.status(503).json({ mensaje: "La autenticación no está disponible.", codigo: "AUTH_NO_DISPONIBLE" });
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string" || !email || !password || email.length > 254 || password.length > 1024) {
      return res.status(400).json({ mensaje: "Debe ingresar email y contraseña." });
    }
    try { return res.json({ mensaje: "Inicio de sesión exitoso.", ...await AuthService.login(email, password) }); }
    catch (error) { return responderError(res, error); }
  }

  obtenerSesion(req, res) {
    return res.json({ usuario: AuthService.perfil(req.usuario), expiraEn: req.expiraEn });
  }

  async editarPerfil(req, res) {
    try {
      AuthService.exigirSQL();
      return res.json({ usuario: AuthService.perfil(await AuthService.cuentas.editarNombre(req.usuario, req.body)) });
    } catch (error) { return responderError(res, error); }
  }

  async cambiarPassword(req, res) {
    try {
      AuthService.exigirSQL();
      const usuario = await AuthService.cuentas.cambiarPassword(req.usuario, req.body);
      return res.json({ mensaje: "Contraseña actualizada. Las sesiones anteriores fueron revocadas.", ...AuthService.emitirSesion(usuario) });
    } catch (error) { return responderError(res, error); }
  }

  async logout(req, res) {
    try {
      if (AuthService.origen === "sql") await AuthService.cuentas.logout(req.usuario);
      return res.json({ mensaje: AuthService.origen === "sql" ? "Todas las sesiones fueron revocadas." : "Sesión local cerrada.", revocadaEnServidor: AuthService.origen === "sql" });
    } catch (error) { return responderError(res, error); }
  }
}

module.exports = new AuthController();
