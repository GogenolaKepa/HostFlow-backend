const jwt = require("jsonwebtoken");
const AuthService = require("../services/AuthService");
const { responderError, sesionInvalida } = require("../security/seguridadUsuarios");
const { secretoJWTValido } = require("../config/autenticacion");

async function autenticacion(req, res, next) {
  const coincidencia = /^Bearer\s+([^\s]+)$/i.exec(req.get("Authorization") || "");
  if (!coincidencia) return res.status(401).json({ mensaje: "Debe iniciar sesión." });
  const secret = process.env.JWT_SECRET;
  if (!secretoJWTValido(secret)) return res.status(503).json({ mensaje: "La autenticación no está disponible.", codigo: "AUTH_NO_DISPONIBLE" });

  let payload;
  try {
    payload = jwt.verify(coincidencia[1], secret, { algorithms: ["HS256"] });
    if (!payload || typeof payload !== "object" || !Number.isInteger(payload.exp) ||
        !Number.isInteger(payload.idUsuario) || payload.idUsuario <= 0) throw sesionInvalida();
  } catch { return responderError(res, sesionInvalida()); }

  try {
    const usuario = await AuthService.obtenerUsuarioSesion(payload.idUsuario, payload);
    if (!usuario || usuario.email !== payload.email) return responderError(res, sesionInvalida());
    req.usuario = usuario;
    req.expiraEn = payload.exp;
    return next();
  } catch (error) { return responderError(res, error); }
}

module.exports = autenticacion;
