// Los repositorios y las reglas de estadía esperan fechas de calendario ISO.
// Date devuelve Invalid Date sin lanzar, y además normaliza días imposibles:
// comparar esas fechas sin validarlas podía dejar pasar entradas inválidas.
function fechaReservaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor.startsWith('0000-')) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}
function rangoReservaValido(ingreso, egreso) {
  return fechaReservaValida(ingreso) && fechaReservaValida(egreso) && egreso > ingreso;
}
module.exports = { fechaReservaValida, rangoReservaValido };
