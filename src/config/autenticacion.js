function origenAutenticacion(env = process.env) {
  const origen = env.HOSTFLOW_AUTH_SOURCE ?? "mock";
  if (!["mock", "sql"].includes(origen)) {
    throw new Error("HOSTFLOW_AUTH_SOURCE debe ser mock o sql.");
  }
  if (env.NODE_ENV === "production" && origen !== "sql") {
    throw new Error("Producción requiere autenticación SQL explícita; mock no está permitido.");
  }
  return origen;
}

function secretoJWTValido(secreto, env = process.env) {
  return typeof secreto === "string" && Boolean(secreto.trim()) &&
    (env.NODE_ENV !== "production" || Buffer.byteLength(secreto, "utf8") >= 32);
}

module.exports = { origenAutenticacion, secretoJWTValido };
