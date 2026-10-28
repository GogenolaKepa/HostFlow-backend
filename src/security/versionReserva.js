const { createHmac, timingSafeEqual } = require('node:crypto');

// Huella del estado de negocio leído; NO es rowversion ni un contador de cambios.
// HMAC evita exponer valores ocultos por permisos mediante un hash adivinable.
const campos = ['idReserva', 'idPropiedad', 'idHuesped', 'canal', 'estado',
  'fechaIngreso', 'horaIngreso', 'fechaEgreso', 'horaEgreso', 'cantidadHuespedes',
  'montoEstimado', 'idExterno', 'estadoSincronizacion'];
function versionReserva(reserva, secreto = process.env.JWT_SECRET) {
  if (!reserva || typeof secreto !== 'string' || !secreto.trim()) return null;
  const estado = campos.map(campo => reserva[campo] ?? null);
  return createHmac('sha256', secreto).update('HostFlow:Reserva:estado:v1:')
    .update(JSON.stringify(estado)).digest('hex');
}
function exigirVersionReserva(version) {
  if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) {
    throw Object.assign(new Error('Recargá la reserva antes de guardar: falta una versión de lectura válida.'),
      { status: 428, codigo: 'RESERVA_VERSION_REQUERIDA' });
  }
  return version;
}
function comprobarVersionReserva(reserva, version) {
  exigirVersionReserva(version);
  const actual = versionReserva(reserva);
  if (!actual || !timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(version, 'hex'))) {
    throw Object.assign(new Error('La reserva cambió desde que la abriste. Recargá los datos antes de reintentar.'),
      { status: 409, codigo: 'RESERVA_CONFLICTO_CONCURRENCIA' });
  }
}
module.exports = { versionReserva, exigirVersionReserva, comprobarVersionReserva };
