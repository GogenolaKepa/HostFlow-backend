// Solo coordina operaciones del MISMO proceso. No sustituye restricciones SQL
// ni una bandeja duradera si la simulación se reemplaza por integraciones reales.
function crearEjecucionSerial() {
  const pendientes = new Map();
  return async function ejecutar(clave, operacion) {
    const anterior = pendientes.get(clave) || Promise.resolve();
    const actual = anterior.catch(() => {}).then(operacion);
    pendientes.set(clave, actual);
    try {
      return await actual;
    } finally {
      if (pendientes.get(clave) === actual) pendientes.delete(clave);
    }
  };
}
module.exports = { crearEjecucionSerial };
