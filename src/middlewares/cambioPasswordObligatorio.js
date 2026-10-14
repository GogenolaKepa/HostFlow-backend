function cambioPasswordObligatorio(req, res, next) {
  if (req.usuario?.debeCambiarPassword) {
    return res.status(403).json({ codigo: "PASSWORD_CHANGE_REQUIRED", mensaje: "Debe cambiar su contraseña para continuar." });
  }
  return next();
}

module.exports = cambioPasswordObligatorio;
