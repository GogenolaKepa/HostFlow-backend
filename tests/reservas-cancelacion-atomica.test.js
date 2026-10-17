const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { prepararCancelacionAislada, senal } = require('./helpers/cancelacionAislada');
const h = prepararCancelacionAislada();
const anterior = { JWT_SECRET: process.env.JWT_SECRET, HOSTFLOW_AUTH_SOURCE: process.env.HOSTFLOW_AUTH_SOURCE };
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.HOSTFLOW_AUTH_SOURCE = 'mock';
const servicio = require('../src/services/ReservaService');
const repositorio = require('../src/repositories/ReservaRepository');
const fechaAnterior = servicio.obtenerFechaActualArgentina;
servicio.obtenerFechaActualArgentina = () => '2100-01-01';
const { usuarios } = require('../src/data/mockData');
const cuentas = ['Administrador', 'Operador'].map((nombre, i) => ({ idUsuario: 980001 + i,
  nombre: 'Fixture aislada', email: `cancelacion-${i}@example.invalid`, estado: 'Activo', rol: { nombre } }));
usuarios.push(...cuentas);
const app = require('../src/app');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => h.reset());
after(async () => {
  await new Promise(resolve => server.close(resolve));
  servicio.obtenerFechaActualArgentina = fechaAnterior;
  for (const c of cuentas) usuarios.splice(usuarios.indexOf(c), 1);
  for (const [k, v] of Object.entries(anterior)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
function sinConfirmacion() {
  assert.equal(h.reserva.estado, 'Confirmada'); assert.deepEqual(h.eventos, []);
  assert.equal(h.commits, 0); assert.equal(h.rollbacks, 1); assert.equal(h.poolRequests, 0);
}

test('cancelación: una transacción y conexión; estado, historial obligatorio y DTO antes del commit', async () => {
  const resultado = await servicio.cancelarReserva(1);
  assert.equal(resultado.estado, 'Cancelada'); assert.deepEqual(resultado.accionesDisponibles, ['VER']);
  assert.equal(resultado.tipoGestion, 'INTERNA');
  assert.equal(h.inicios, 1); assert.equal(h.commits, 1); assert.equal(h.rollbacks, 0); assert.equal(h.poolRequests, 0);
  assert.equal(h.transacciones.length, 1); assert.equal(new Set(h.consultas.map(c => c.tx)).size, 1);
  assert.equal(h.reserva.estado, 'Cancelada'); assert.equal(h.eventos.length, 1);
  const evento = h.eventos[0];
  assert.equal(evento.tipo, 'RESERVA_CANCELADA'); assert.equal(evento.origen, 'Manual');
  assert.equal(evento.titulo, 'Reserva cancelada en HostFlow');
  assert.deepEqual(JSON.parse(evento.datosJson), { estadoAnterior: 'Confirmada', estadoNuevo: 'Cancelada',
    fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12', montoEstimado: 100 });
  assert.ok(h.consultas[0].texto.includes('sp_getapplock'));
  assert.equal(h.consultas[0].args.recurso, 'HostFlow:Operaciones:FinalizacionReservas');
  assert.match(h.consultas[1].texto, /UPDLOCK, HOLDLOCK/);
  const textos = h.consultas.map(c => c.texto);
  assert.ok(textos.findIndex(t => t.includes('UPDATE dbo.Reservas')) < textos.findIndex(t => t.includes('INSERT INTO dbo.ReservaEventos')));
  assert.match(textos.at(-1), /FROM dbo.Reservas r/);
});

for (const paso of ['update', 'evento', 'lecturaPostUpdate', 'lecturaFinal', 'bloqueoFila']) {
  test(`fallo de ${paso}: propaga error y revierte reserva e historial sin reintento`, async () => {
    const error = Object.assign(Error(`Fallo ficticio ${paso}`), { code: paso === 'bloqueoFila' ? 'ETIMEOUT' : 'EREQUEST' });
    h.fallos[paso] = error;
    await assert.rejects(servicio.cancelarReserva(1), e => e === error);
    sinConfirmacion();
    assert.equal(h.inicios, 1); assert.ok(h.updates <= 1);
  });
}

test('timeout del applock: no llega a la fila, al UPDATE ni al evento', async () => {
  h.resultadoLock = -1;
  await assert.rejects(servicio.cancelarReserva(1), /ocupada/);
  sinConfirmacion(); assert.equal(h.consultas.length, 1); assert.equal(h.updates, 0);
});

test('rollback fallido: comunica resultado incierto, sin afirmar que nada se guardó', async () => {
  h.fallos.evento = Error('Fallo ficticio del evento');
  h.fallos.rollback = Error('Rollback ficticio fallido');
  await assert.rejects(servicio.cancelarReserva(1), e => e.codigo === 'OPERACION_RESULTADO_INCIERTO' && /Recargá/.test(e.message));
  assert.equal(h.commits, 0); assert.equal(h.rollbacks, 1); assert.equal(h.updates, 1);
  // Liberación exclusiva del modelo ficticio para no dejar Promises pendientes en la suite.
  h.transacciones.forEach(tx => tx.liberaciones.forEach(liberar => liberar()));
});

test('commit aplicado con acuse perdido: no se revierte la evidencia ni se duplica la operación', async () => {
  h.acusePerdido = true;
  await assert.rejects(servicio.cancelarReserva(1), e => e.codigo === 'OPERACION_RESULTADO_INCIERTO');
  assert.equal(h.reserva.estado, 'Cancelada'); assert.equal(h.eventos.length, 1);
  assert.equal(h.inicios, 1); assert.equal(h.updates, 1); assert.equal(h.commits, 1); assert.equal(h.rollbacks, 1);
});

test('UPDATE sin efecto o evento sin resultado impiden confirmar éxito', async () => {
  h.sinUpdate = true;
  await assert.rejects(servicio.cancelarReserva(1), /confirmar la cancelación/); sinConfirmacion();
  h.reset(); h.eventoSinResultado = true;
  await assert.rejects(servicio.cancelarReserva(1), /confirmar el historial/); sinConfirmacion();
});

test('validaciones se releen dentro de la transacción y conservan canal, estados y vencimiento', async () => {
  for (const [datos, mensaje] of [[null, /no existe/], [{ canal: 'Airbnb' }, /no pueden cancelarse/],
    [{ canal: 'Booking' }, /no pueden cancelarse/], [{ estado: 'Cancelada' }, /ya se encuentra cancelada/],
    [{ estado: 'Finalizada' }, /finalizada/], [{ fechaEgreso: '2000-01-01' }, /vencida/]]) {
    h.reset(); h.reserva = datos === null ? null : { ...h.reserva, ...datos };
    await assert.rejects(servicio.cancelarReserva(1), mensaje);
    assert.equal(h.inicios, 1); assert.equal(h.rollbacks, 1); assert.equal(h.updates, 0); assert.equal(h.commits, 0);
    assert.deepEqual(h.eventos, []); assert.equal(h.poolRequests, 0);
  }
});

test('estados manuales antes permitidos conservan la cancelación, sin ampliar rechazos', async () => {
  for (const estado of ['Pendiente', 'No show']) {
    h.reset(); h.reserva.estado = estado;
    assert.equal((await servicio.cancelarReserva(1)).estado, 'Cancelada');
    assert.equal(JSON.parse(h.eventos[0].datosJson).estadoAnterior, estado);
  }
});

test('dos cancelaciones concurrentes: una confirma, la otra relee Cancelada y no duplica historial', { timeout: 3000 }, async () => {
  const entra = senal(), segunda = senal(), continuar = senal();
  h.hooks.evento = async () => { entra.resolver(); await continuar.promise; };
  h.hooks.applock = async tx => { if (tx.id === 2) segunda.resolver(); };
  const una = servicio.cancelarReserva(1);
  await entra.promise;
  const otra = servicio.cancelarReserva(1);
  await segunda.promise;
  assert.equal(h.consultas.filter(c => c.tx === 2).length, 1, 'La segunda todavía espera el recurso');
  continuar.resolver();
  const resultados = await Promise.allSettled([una, otra]);
  assert.equal(resultados[0].status, 'fulfilled'); assert.equal(resultados[1].status, 'rejected');
  assert.match(resultados[1].reason.message, /ya se encuentra cancelada/);
  assert.equal(h.inicios, 2); assert.equal(h.commits, 1); assert.equal(h.rollbacks, 1);
  assert.equal(h.eventos.length, 1); assert.equal(h.updates, 1); assert.equal(h.poolRequests, 0);
});

test('cancelación primero y finalización después comparten recurso y no generan dos transiciones', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal();
  h.hooks.evento = async (_tx, args) => { if (args.tipo === 'RESERVA_CANCELADA') { entra.resolver(); await continuar.promise; } };
  const cancelacion = servicio.cancelarReserva(1); await entra.promise;
  // Corte ficticio adelantado para que ambas operaciones puedan competir por esta fila.
  const finalizacion = repositorio.finalizarConEventos('2100-02-01'); continuar.resolver();
  const [cancelada, lote] = await Promise.all([cancelacion, finalizacion]);
  assert.equal(cancelada.estado, 'Cancelada'); assert.equal(lote.cantidadFinalizadas, 0);
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_CANCELADA']);
  assert.equal(h.reserva.estado, 'Cancelada'); assert.equal(h.poolRequests, 0);
  assert.equal(new Set(h.consultas.filter(c => c.args.recurso).map(c => c.args.recurso)).size, 1);
});

test('finalización primero: cancelación relee Finalizada y revierte sin crear otro evento', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal();
  h.hooks.evento = async (_tx, args) => { if (args.tipo === 'RESERVA_FINALIZADA') { entra.resolver(); await continuar.promise; } };
  const finalizacion = repositorio.finalizarConEventos('2100-02-01'); await entra.promise;
  const cancelacion = servicio.cancelarReserva(1); continuar.resolver();
  const resultados = await Promise.allSettled([finalizacion, cancelacion]);
  assert.equal(resultados[0].status, 'fulfilled'); assert.equal(resultados[1].status, 'rejected');
  assert.match(resultados[1].reason.message, /finalizada/);
  assert.equal(h.reserva.estado, 'Finalizada'); assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_FINALIZADA']);
  assert.equal(new Set(h.consultas.filter(c => c.args.recurso).map(c => c.args.recurso)).size, 1);
});

test('regresión 2C: edición iniciada durante cancelación espera y no sobrescribe Cancelada', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal();
  h.hooks.evento = async () => { entra.resolver(); await continuar.promise; };
  const cancelacion = servicio.cancelarReserva(1); await entra.promise;
  const edicion = servicio.modificarReserva(1, { montoEstimado: 200 }); continuar.resolver();
  const resultados = await Promise.allSettled([cancelacion, edicion]);
  assert.equal(resultados[0].status, 'fulfilled'); assert.equal(resultados[1].status, 'rejected');
  assert.match(resultados[1].reason.message, /no admite modificaciones/);
  assert.equal(h.reserva.estado, 'Cancelada'); assert.equal(h.reserva.montoEstimado, 100);
  assert.equal(h.eventos.length, 1); assert.equal(h.poolRequests, 0);
});

test('regresión 2C: una edición ya validada termina antes de que cancelación relea y cancele', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal();
  h.hooks.editar = async () => { entra.resolver(); await continuar.promise; };
  const edicion = servicio.modificarReserva(1, { montoEstimado: 200 }); await entra.promise;
  const cancelacion = servicio.cancelarReserva(1); continuar.resolver();
  await Promise.all([edicion, cancelacion]);
  assert.equal(h.reserva.estado, 'Cancelada'); assert.equal(h.reserva.montoEstimado, 200);
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_MODIFICADA', 'RESERVA_CANCELADA']);
  assert.equal(JSON.parse(h.eventos[1].datosJson).montoEstimado, 200); assert.equal(h.poolRequests, 0);
});

async function cancelarHTTP(cuenta = cuentas[0], id = '1') {
  const headers = cuenta ? { Authorization: `Bearer ${jwt.sign({ idUsuario: cuenta.idUsuario, email: cuenta.email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' })}` } : {};
  const respuesta = await fetch(`${base}/api/reservas/${id}/cancelar`, { method: 'PATCH', headers });
  return { respuesta, datos: await respuesta.json() };
}

test('HTTP: commit incierto devuelve código seguro, recarga y ningún éxito o reintento automático', async () => {
  h.acusePerdido = true;
  const { respuesta, datos } = await cancelarHTTP();
  assert.equal(respuesta.status, 500);
  assert.deepEqual(datos, { codigo: 'OPERACION_RESULTADO_INCIERTO', mensaje: 'No se pudo confirmar el resultado del guardado. Recargá los datos antes de reintentar.' });
  assert.equal(respuesta.headers.has('Retry-After'), false); assert.equal(Object.hasOwn(datos, 'reserva'), false);
  assert.equal(h.commits, 1); assert.equal(h.updates, 1); assert.equal(h.eventos.length, 1);
});

test('HTTP: 401/403/ID inválido preceden a BEGIN; éxito y validaciones conservan contratos', async () => {
  assert.equal((await cancelarHTTP(null)).respuesta.status, 401);
  assert.equal((await cancelarHTTP(cuentas[1])).respuesta.status, 403);
  assert.equal((await cancelarHTTP(cuentas[0], 'NaN')).respuesta.status, 400);
  assert.equal(h.inicios, 0); assert.equal(h.consultas.length, 0);
  const exito = await cancelarHTTP(); assert.equal(exito.respuesta.status, 200);
  assert.equal(exito.datos.mensaje, 'Reserva cancelada correctamente.'); assert.equal(exito.datos.reserva.estado, 'Cancelada');
  const repetida = await cancelarHTTP(); assert.equal(repetida.respuesta.status, 400);
  assert.deepEqual(repetida.datos, { mensaje: 'La reserva ya se encuentra cancelada.' }); assert.equal(h.eventos.length, 1);
});

test('HTTP: fallo del driver al crear historial se sanitiza y revierte ambas escrituras', async () => {
  h.fallos.evento = Object.assign(Error('Detalle ficticio privado del motor'), { code: 'EREQUEST' });
  const { respuesta, datos } = await cancelarHTTP();
  assert.equal(respuesta.status, 503);
  assert.deepEqual(datos, { codigo: 'ERROR_INTERNO', mensaje: 'No se pudo completar la operación. Reintente más tarde.' });
  sinConfirmacion();
});
