const { isIP } = require("node:net");

function entero(env, nombre, defecto, maximo) {
  const valor = env[nombre] ?? String(defecto);
  if (!/^\d+$/.test(valor) || Number(valor) < 1 || Number(valor) > maximo) throw new Error(`Configuración inválida: ${nombre}.`);
  return Number(valor);
}

function configuracionHttp(env = process.env) {
  const produccion = env.NODE_ENV === "production";
  const origenes = (env.HOSTFLOW_CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean).map((origen) => {
    let url;
    try { url = new URL(origen); } catch { throw new Error("Origen CORS inválido."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Origen CORS inválido.");
    if (produccion && url.protocol !== "https:") throw new Error("Producción requiere orígenes HTTPS.");
    return url.origin;
  });
  if (produccion && origenes.length === 0) throw new Error("Producción requiere HOSTFLOW_CORS_ORIGINS explícitos.");
  return { produccion, origenes,
    limiteLogin: entero(env, "HOSTFLOW_LOGIN_MAX", produccion ? 30 : 100, 1000),
    ventanaLoginMs: entero(env, "HOSTFLOW_LOGIN_WINDOW_MS", 900000, 3600000) };
}

function permiteOrigen(origen, config) {
  if (!origen) return true; // Clientes API sin Origin siguen sujetos a JWT/permisos.
  if (config.origenes.includes(origen)) return true;
  if (config.produccion || config.origenes.length) return false;
  let url;
  try { url = new URL(origen); } catch { return false; }
  const host = url.hostname;
  const privado = isIP(host) === 4 && (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host));
  const puerto = Number(url.port);
  const vite = (puerto >= 5173 && puerto <= 5183) || (puerto >= 4173 && puerto <= 4183);
  return url.origin === origen && url.protocol === "http:" && vite &&
    (["localhost", "127.0.0.1", "[::1]"].includes(host) || privado);
}

module.exports = { configuracionHttp, permiteOrigen };
