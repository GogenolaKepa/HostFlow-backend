const { configuracionHttp } = require("../config/httpSeguridad");

function limitarLogin({ maximo = configuracionHttp().limiteLogin,
  ventanaMs = configuracionHttp().ventanaLoginMs, capacidad = 10000, ahora = Date.now } = {}) {
  const intentos = new Map();
  let ultimaLimpieza = 0;
  return (req, res, next) => {
    const instante = ahora();
    if (instante - ultimaLimpieza >= 60000) {
      for (const [ip, estado] of intentos) if (estado.hasta <= instante) intentos.delete(ip);
      ultimaLimpieza = instante;
    }
    // Express no confia en X-Forwarded-For por defecto; no usar headers del cliente.
    const ip = req.ip || req.socket?.remoteAddress || "desconocido";
    let estado = intentos.get(ip);
    if (estado?.hasta <= instante) { intentos.delete(ip); estado = undefined; }
    res.set("Cache-Control", "no-store");
    if ((!estado && intentos.size >= capacidad) || estado?.cantidad >= maximo) {
      res.set("Retry-After", String(Math.max(1, Math.ceil(((estado?.hasta || instante + ventanaMs) - instante) / 1000))));
      return res.status(429).json({ codigo: "LOGIN_LIMITADO", mensaje: "Demasiados intentos. Espere antes de volver a iniciar sesión." });
    }
    if (!estado) { estado = { cantidad: 0, hasta: instante + ventanaMs }; intentos.set(ip, estado); }
    estado.cantidad++;
    return next();
  };
}
module.exports = limitarLogin;
