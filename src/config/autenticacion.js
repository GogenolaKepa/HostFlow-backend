function origenAutenticacion() {
  const origen = process.env.HOSTFLOW_AUTH_SOURCE ?? "mock";
  if (!["mock", "sql"].includes(origen)) {
    throw new Error("HOSTFLOW_AUTH_SOURCE debe ser mock o sql.");
  }
  return origen;
}

module.exports = { origenAutenticacion };
