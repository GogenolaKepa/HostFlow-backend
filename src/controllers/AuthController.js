const AuthService = require("../services/AuthService");

class AuthController {
  login(req, res) {
    res.set("Cache-Control", "no-store");
    if (!process.env.JWT_SECRET?.trim()) {
      return res.status(503).json({
        mensaje: "La autenticación no está disponible.",
      });
    }

    try {
      const { email, password } = req.body || {};

      if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
        return res.status(400).json({
          mensaje: "Debe ingresar email y contraseña."
        });
      }

      const resultado = AuthService.login(email, password);

      return res.status(200).json({
        mensaje: "Inicio de sesión exitoso.",
        ...resultado
      });
    } catch (error) {
      return res.status(401).json({
        mensaje: error.message
      });
    }
  }

  obtenerSesion(req, res) {
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      usuario: req.usuario,
      expiraEn: req.expiraEn,
    });
  }
}

module.exports = new AuthController();
