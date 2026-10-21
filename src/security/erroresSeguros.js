const CODIGOS = new Set(["EREQUEST", "ELOGIN", "ESOCKET", "ETIMEOUT", "ECONNCLOSED", "ENOTOPEN", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET"]);
const MENSAJES_SEGURIDAD = Object.freeze({
  MONEDAS_PENDIENTES: 'La persistencia de monedas está pendiente de aprobación. No se guardaron cambios.',
  MONEDAS_SOLO_LECTURA: 'Monedas está en modo de solo lectura.',
  MONEDAS_MODELO_PENDIENTE: 'El modelo de monedas o la empresa no están preparados.',
  MONEDAS_FUENTE_NO_DISPONIBLE: 'La fuente oficial no está disponible. No se usó una cotización de reemplazo.',
  OPERACION_RESULTADO_INCIERTO: "No se pudo confirmar el resultado del guardado. Recargá los datos antes de reintentar.",
  BOOKING_ACUSE_PENDIENTE: "Los datos de la reserva están confirmados en HostFlow, pero no se pudo confirmar el acuse del evento de Booking. Recargá los datos antes de volver a procesarlo.",
  NOTIFICACIONES_PERSONALES_NO_ACTIVADAS: "La bandeja personal todavía no está activada.",
  NOTIFICACIONES_MODELO_PENDIENTE: "El modelo de notificaciones no está preparado.",
  NOTIFICACIONES_NO_ACTIVADAS: "Las preferencias de notificaciones todavía no están activadas.",
  NOTIFICACIONES_SOLO_LECTURA: "El guardado de preferencias todavía no está habilitado.",
  NOTIFICACIONES_NO_DISPONIBLES: "No se pudieron consultar los avisos o preferencias. Reintentá más tarde.",
  AUTH_NO_DISPONIBLE: "La autenticación no está disponible.",
  SEGURIDAD_NO_DISPONIBLE: "La gestión de cuentas no está disponible. Reintente más tarde.",
  GESTION_SQL_PENDIENTE: "La gestión de cuentas estará disponible después de activar la autenticación SQL.",
  SQL_NO_PREPARADO: "SQL no está preparado: revisar destino, permisos, roles y primer Administrador.",
  CONFIGURACION_SOLO_LECTURA: "La configuración empresarial está en modo de solo lectura. El guardado todavía no está habilitado.",
  CONFIGURACION_PENDIENTE: "La persistencia empresarial todavía no está activada. No se pueden guardar cambios.",
  EMPRESA_NO_CONFIGURADA: "La empresa y sus preferencias todavía no están disponibles. Revisá la vinculación de esta instalación.",
  MODELO_CONFIGURACION_PENDIENTE: "La persistencia empresarial no está preparada.",
  CONFIGURACION_SQL_REQUERIDA: "La configuración empresarial requiere autenticación SQL y persistencia activada.",
  CONFIGURACION_NO_DISPONIBLE: "No se pudo acceder a la configuración empresarial. Reintentá o revisá su activación.",
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
