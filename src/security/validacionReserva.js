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
function idReservaValido(valor) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return false;
  if (!/^[1-9]\d{0,9}$/.test(String(valor))) return false;
  return Number.isInteger(Number(valor)) && Number(valor) <= 2147483647;
}
function numeroReserva(valor, predeterminado) {
  if (valor === undefined || valor === null || valor === '') return predeterminado;
  if (typeof valor !== 'number' && typeof valor !== 'string') return NaN;
  if (typeof valor === 'string' && !valor.trim()) return NaN;
  return Number(valor);
}
function cantidadReserva(valor, predeterminado = 1) {
  const cantidad = numeroReserva(valor, predeterminado);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 2147483647) {
    throw new Error('La cantidad de huéspedes no es válida.');
  }
  return cantidad;
}
function montoReserva(valor, predeterminado = 0) {
  const monto = numeroReserva(valor, predeterminado);
  if (!Number.isFinite(monto) || monto < 0) throw new Error('El monto estimado no es válido.');
  return monto;
}
module.exports = { fechaReservaValida, rangoReservaValido, idReservaValido, cantidadReserva, montoReserva };
