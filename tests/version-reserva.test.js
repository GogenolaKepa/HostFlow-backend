const { test } = require('node:test');
const assert = require('node:assert/strict');
const { versionReserva, exigirVersionReserva, comprobarVersionReserva } = require('../src/security/versionReserva');

test('huella estable por estado, independiente del orden y aislada de otros usos de JWT', () => {
  const reserva = { idReserva: 1, montoEstimado: 100, estado: 'Confirmada' };
  const version = versionReserva(reserva, 'clave-ficticia-de-prueba');
  assert.match(version, /^[a-f0-9]{64}$/);
  assert.equal(versionReserva({ estado: 'Confirmada', montoEstimado: 100, idReserva: 1 }, 'clave-ficticia-de-prueba'), version);
  for (const cambios of [{idReserva:2},{montoEstimado:101},{estado:'Cancelada'},{horaEgreso:'11:00'},{idHuesped:2}]) {
    assert.notEqual(versionReserva({...reserva,...cambios}, 'clave-ficticia-de-prueba'), version);
  }
  assert.notEqual(versionReserva(reserva, 'otra-clave-ficticia'), version);
  assert.equal(versionReserva(reserva, ''), null);
  assert.throws(()=>exigirVersionReserva(null),e=>e.status===428);
  assert.throws(()=>comprobarVersionReserva(reserva, '0'.repeat(64)),e=>e.status===409);
});
