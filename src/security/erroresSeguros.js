const CODIGOS = new Set(["EREQUEST", "ELOGIN", "ESOCKET", "ETIMEOUT", "ECONNCLOSED", "ENOTOPEN", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET"]);
const MENSAJES_SEGURIDAD = Object.freeze({
  AUTH_NO_DISPONIBLE: "La autenticación no está disponible.",
  SEGURIDAD_NO_DISPONIBLE: "La gestión de cuentas no está disponible. Reintente más tarde.",
  GESTION_SQL_PENDIENTE: "La gestión de cuentas estará disponible después de activar la autenticación SQL.",
  SQL_NO_PREPARADO: "SQL no está preparado: revisar destino, permisos, roles y primer Administrador.",
});

function textoSensitivo(texto) {
  if (typeof texto !== "string") return false;
  if (/https?:\/\/[^/\s:@]+:[^/\s@]+@/i.test(texto)) return true;
  if (/Bearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}|(?:password|pwd|api[_-]?key|secret)\s*[=:]|connectionstring/i.test(texto)) return true;
  return Object.entries(process.env).some(([nombre, valor]) => /(PASSWORD|SECRET|TOKEN|API_KEY|CONNECTION_STRING)/i.test(nombre) && valor?.length >= 6 && texto.includes(valor));
}

function protegerError(error) {
  if (CODIGOS.has(error?.code) || ["RequestError", "ConnectionError", "TypeError", "SyntaxError"].includes(error?.name) || textoSensitivo(error?.message)) {
    const seguro = new Error("No se pudo completar la operación. Reintente más tarde.");
    if (CODIGOS.has(error?.code)) seguro.code = error.code;
    return seguro;
  }
  return error;
}

function registrarErrorSeguro(contexto, error) {
  // Nunca serializar Error, stack, requests, respuestas o parametros.
  const etiqueta = typeof contexto === "string" && !textoSensitivo(contexto) ? contexto : "Error de aplicación";
  console.error(etiqueta, CODIGOS.has(error?.code) ? error.code : "Fallo controlado");
}

function respuestasSeguras(req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  if (req.path?.startsWith("/api")) res.set("Cache-Control", "no-store");
  const json = res.json;
  res.json = (datos) => {
    if (res.statusCode >= 400 && res.statusCode < 500 && datos?.mensaje === "No se pudo completar la operación. Reintente más tarde.") {
      // Un fallo del driver no debe presentarse como 400/404 de negocio.
      res.statusCode = 503;
    }
    if (res.statusCode >= 500) {
      const codigo = typeof datos?.codigo === "string" && Object.hasOwn(MENSAJES_SEGURIDAD, datos.codigo) ? datos.codigo : "ERROR_INTERNO";
      datos = { mensaje: MENSAJES_SEGURIDAD[codigo] || "No se pudo completar la operación. Reintente más tarde.", codigo };
    }
    return json.call(res, datos);
  };
  next();
}

function manejarErrorSeguro(error, _req, res, next) {
  registrarErrorSeguro("Error no controlado", error);
  if (res.headersSent) return next(new Error("Error de aplicación."));
  return res.status(500).json({ mensaje: "No se pudo completar la operación. Reintente más tarde.", codigo: "ERROR_INTERNO" });
}
module.exports = { protegerError, registrarErrorSeguro, respuestasSeguras, manejarErrorSeguro, textoSensitivo };
