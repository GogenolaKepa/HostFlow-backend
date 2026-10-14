const jwt = require("jsonwebtoken");
const AuthService = require("../services/AuthService");

function autenticacion(req, res, next) {
  const authorization = req.get("Authorization") || "";
  const coincidencia = /^Bearer\s+([^\s]+)$/i.exec(authorization);

  if (!coincidencia) {
    return res.status(401).json({ mensaje: "Debe iniciar sesión." });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret?.trim()) {
    return res.status(503).json({
      mensaje: "La autenticación no está disponible.",
    });
  }

  try {
    const payload = jwt.verify(coincidencia[1], secret, {
      algorithms: ["HS256"],
    });

    // También exigimos vencimiento e identidad: no basta una firma válida.
    if (!payload || typeof payload !== "object" ||
        !Number.isInteger(payload.exp) ||
        !Number.isInteger(payload.idUsuario) || payload.idUsuario <= 0) {
      throw new Error("Identidad de sesión inválida.");
    }

    const usuario = AuthService.obtenerUsuarioSesion(payload.idUsuario);
    if (!usuario || usuario.email !== payload.email) {
      throw new Error("Usuario de sesión inválido.");
    }

    req.usuario = usuario;
    req.expiraEn = payload.exp;
  } catch {
    // No registramos el token ni detalles criptográficos en logs o respuestas.
    return res.status(401).json({
      mensaje: "La sesión no es válida o venció. Inicie sesión nuevamente.",
    });
  }

  return next();
}

module.exports = autenticacion;
