const AuthService = require("../services/AuthService");

class AuthController {
  login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
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
}

module.exports = new AuthController();