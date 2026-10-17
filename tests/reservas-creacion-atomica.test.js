// Repositorios/servicios/HTTP reales, driver y varias reservas ficticios. Sin SQL real.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const { prepararCreacionAislada } = require('./helpers/creacionAislada');
const { senal } = require('./helpers/cancelacionAislada');
const h = prepararCreacionAislada();
const anterior = { JWT_SECRET: process.env.JWT_SECRET, HOSTFLOW_AUTH_SOURCE: process.env.HOSTFLOW_AUTH_SOURCE };
process.env.JWT_SECRET = randomBytes(32).toString('hex'); process.env.HOSTFLOW_AUTH_SOURCE = 'mock';
const servicio = require('../src/services/ReservaService');
const repo = require('../src/repositories/ReservaRepository');
const fechaAnterior = servicio.obtenerFechaActualArgentina;
servicio.obtenerFechaActualArgentina = () => '2100-01-01';
const { usuarios } = require('../src/data/mockData');
const cuentas = ['Administrador', 'Operador'].map((nombre, i) => ({ idUsuario: 991001 + i,
  nombre: 'Alta ficticia', email: `alta-${i}@example.invalid`, estado: 'Activo', rol: { nombre } }));
usuarios.push(...cuentas);
const app = require('../src/app');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => h.reset());
after(async () => {
  await new Promise(resolve => server.close(resolve)); servicio.obtenerFechaActualArgentina = fechaAnterior;
  for (const c of cuentas) usuarios.splice(usuarios.indexOf(c), 1);
  for (const [k, v] of Object.entries(anterior)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
const datos = cambios => ({ idPropiedad: 7, idHuesped: 8, fechaIngreso: '2100-01-10', horaIngreso: '17:20',
  fechaEgreso: '2100-01-12', horaEgreso: '09:40', cantidadHuespedes: 2, montoEstimado: 125.5, ...cambios });
const crear = cambios => servicio.crearReserva(datos(cambios));
function revertida() {
  assert.equal(h.filas.size, 0); assert.deepEqual(h.eventos, []); assert.equal(h.commits, 0);
  assert.equal(h.rollbacks, 1); assert.equal(h.poolRequests, 0);
}
function recursoComun() {
  const recursos = h.consultas.filter(c => c.args.recurso).map(c => c.args.recurso);
  assert.ok(recursos.length >= 2); assert.deepEqual([...new Set(recursos)], ['HostFlow:Operaciones:FinalizacionReservas']);
  assert.equal(h.poolRequests, 0);
}

test('alta correcta: misma transacción/conexión, parámetros históricos, evento obligatorio y DTO antes de commit', async () => {
  const resultado = await crear({ horaIngreso: ' 17:20 ', cantidadHuespedes: '2', montoEstimado: '125.50' });
  assert.equal(resultado.canal, 'Manual'); assert.equal(resultado.estado, 'Confirmada'); assert.equal(resultado.tipoGestion, 'INTERNA');
  assert.deepEqual(resultado.accionesDisponibles, ['VER', 'EDITAR', 'CANCELAR']);
  assert.equal(h.inicios, 1); assert.equal(h.commits, 1); assert.equal(h.rollbacks, 0); assert.equal(h.inserts, 1);
  assert.equal(h.filas.size, 1); assert.equal(h.eventos.length, 1); assert.equal(h.poolRequests, 0);
  assert.equal(new Set(h.consultas.map(c => c.tx)).size, 1);
  assert.equal(h.consultas[0].args.recurso, 'HostFlow:Operaciones:FinalizacionReservas');
  assert.match(h.consultas[1].texto, /FROM dbo.Propiedades/);
  const insert = h.consultas.find(c => /INSERT INTO dbo.Reservas\b/.test(c.texto));
  assert.deepEqual(insert.args, datos());
  assert.strictEqual(insert.tipos.idPropiedad, sql.Int); assert.strictEqual(insert.tipos.fechaIngreso, sql.Date);
  assert.deepEqual(insert.tipos.horaIngreso, sql.VarChar(5)); assert.deepEqual(insert.tipos.montoEstimado, sql.Decimal(18, 2));
  assert.match(insert.texto, /N'Manual'/); assert.match(insert.texto, /N'Confirmada'/); assert.match(insert.texto, /N'Solo HostFlow'/);
  assert.equal(h.eventos[0].tipo, 'RESERVA_CREADA'); assert.equal(h.eventos[0].origen, 'Manual');
  assert.equal(h.eventos[0].titulo, 'Reserva creada en HostFlow');
  assert.deepEqual(JSON.parse(h.eventos[0].datosJson), { canal: 'Manual', estado: 'Confirmada', idPropiedad: 7,
    propiedad: 'Casa ficticia', idHuesped: 8, huesped: 'Persona Ficticia', fechaIngreso: '2100-01-10',
    horaIngreso: '17:20', fechaEgreso: '2100-01-12', horaEgreso: '09:40', cantidadHuespedes: 2, montoEstimado: 125.5 });
  assert.match(h.consultas.at(-1).texto, /FROM dbo.Reservas r/);
});

for (const paso of ['propiedad', 'huesped', 'conflicto', 'insert', 'lecturaPostInsert', 'evento', 'lecturaFinal']) {
  test(`fallo ${paso}: revierte alta e historial y no anuncia éxito`, async () => {
    const error = Object.assign(Error(`Fallo ficticio ${paso}`), { code: 'EREQUEST' }); h.fallos[paso] = error;
    await assert.rejects(crear(), e => e === error); revertida(); assert.equal(h.inicios, 1); assert.ok(h.inserts <= 1);
  });
}

test('historial sin resultado impide commit; rollback libera el recurso para una nueva solicitud explícita', async () => {
  h.eventoSinResultado = true; await assert.rejects(crear(), /historial de creación/); revertida();
  h.eventoSinResultado = false;
  await crear(); assert.equal(h.filas.size, 1); assert.equal(h.eventos.length, 1); assert.equal(h.commits, 1);
});

test('rollback fallido devuelve incertidumbre sin prometer que no se guardó nada', async () => {
  h.fallos.evento = Error('Fallo ficticio del evento'); h.fallos.rollback = Error('Rollback ficticio fallido');
  await assert.rejects(crear(), e => e.codigo === 'OPERACION_RESULTADO_INCIERTO' && /Recargá/.test(e.message));
  assert.equal(h.inserts, 1); assert.equal(h.commits, 0); assert.equal(h.rollbacks, 1);
  h.transacciones.forEach(tx => tx.liberaciones.forEach(liberar => liberar()));
});

test('commit aplicado con acuse perdido conserva fila/evento, sin reintentar ni atribuir efecto al rollback', async () => {
  h.acusePerdido = true;
  await assert.rejects(crear(), e => e.codigo === 'OPERACION_RESULTADO_INCIERTO');
  assert.equal(h.filas.size, 1); assert.equal(h.eventos.length, 1); assert.equal(h.inicios, 1);
  assert.equal(h.inserts, 1); assert.equal(h.commits, 1); assert.equal(h.rollbacks, 1);
});

test('timeout y rechazo de applock no llegan a dependencias ni INSERT', async () => {
  h.fallos.applock = Object.assign(Error('Timeout ficticio'), { code: 'ETIMEOUT' });
  await assert.rejects(crear(), e => e.code === 'ETIMEOUT'); revertida(); assert.equal(h.consultas.length, 1);
  h.reset(); h.resultadoLock = -1;
  await assert.rejects(crear(), /ocupada/); revertida(); assert.equal(h.consultas.length, 1); assert.equal(h.inserts, 0);
});

test('dos altas incompatibles: la segunda no comprueba disponibilidad hasta la confirmación de la primera', { timeout: 3000 }, async () => {
  const entra = senal(), segunda = senal(), continuar = senal();
  h.hooks.evento = async tx => { if (tx.id === 1) { entra.resolver(); await continuar.promise; } };
  h.hooks.applock = async tx => { if (tx.id === 2) segunda.resolver(); };
  const una = crear(); await entra.promise;
  const otra = crear({ fechaIngreso: '2100-01-11', fechaEgreso: '2100-01-13' }); await segunda.promise;
  assert.equal(h.consultas.filter(c => c.tx === 2).length, 1); continuar.resolver();
  const resultados = await Promise.allSettled([una, otra]);
  assert.equal(resultados[0].status, 'fulfilled'); assert.equal(resultados[1].status, 'rejected');
  assert.match(resultados[1].reason.message, /ya posee una reserva/);
  assert.equal(h.filas.size, 1); assert.equal(h.eventos.length, 1); assert.equal(h.inserts, 1);
  assert.equal(h.commits, 1); assert.equal(h.rollbacks, 1); recursoComun();
});

test('dos altas compatibles: egreso exclusivo permite entrada el mismo día, conservando horas', async () => {
  const [una, otra] = await Promise.all([crear(), crear({ fechaIngreso: '2100-01-12', fechaEgreso: '2100-01-14', horaIngreso: '08:00' })]);
  assert.equal(una.fechaEgreso, otra.fechaIngreso); assert.equal(otra.horaIngreso, '08:00');
  assert.equal(h.filas.size, 2); assert.equal(h.eventos.length, 2); assert.equal(h.commits, 2); recursoComun();
});

test('propiedades distintas admiten las mismas fechas sin introducir un conflicto global de disponibilidad', async () => {
  await Promise.all([crear(), crear({ idPropiedad: 9 })]);
  assert.equal(h.filas.size, 2); assert.equal(h.commits, 2); recursoComun();
});

test('disponibilidad conserva los estados anteriores: Finalizada participa; Cancelada y No show se excluyen', async () => {
  for (const estado of ['Confirmada', 'Pendiente', 'Finalizada']) {
    h.reset(); h.sembrar({ estado });
    await assert.rejects(crear(), /ya posee una reserva/);
    assert.equal(h.filas.size, 1); assert.equal(h.inserts, 0); assert.equal(h.eventos.length, 0);
  }
  for (const estado of ['Cancelada', 'No show']) {
    h.reset(); h.sembrar({ estado }); await crear(); assert.equal(h.filas.size, 2);
  }
});

test('cancelación primero libera disponibilidad antes de que el alta la evalúe', { timeout: 3000 }, async () => {
  h.sembrar({}); const entra = senal(), continuar = senal();
  h.hooks.evento = async (_tx, a) => { if (a.tipo === 'RESERVA_CANCELADA') { entra.resolver(); await continuar.promise; } };
  const cancelacion = servicio.cancelarReserva(1); await entra.promise;
  const alta = crear(); continuar.resolver(); await Promise.all([cancelacion, alta]);
  assert.equal(h.filas.get(1).estado, 'Cancelada'); assert.equal(h.filas.get(2).estado, 'Confirmada');
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_CANCELADA', 'RESERVA_CREADA']); recursoComun();
});

test('alta que encuentra conflicto primero no se reintenta cuando luego termina la cancelación', { timeout: 3000 }, async () => {
  h.sembrar({}); const entra = senal(), continuar = senal();
  h.hooks.conflicto = async () => { entra.resolver(); await continuar.promise; };
  const alta = crear(); await entra.promise;
  const cancelacion = servicio.cancelarReserva(1); continuar.resolver();
  const resultados = await Promise.allSettled([alta, cancelacion]);
  assert.equal(resultados[0].status, 'rejected'); assert.equal(resultados[1].status, 'fulfilled');
  assert.equal(h.filas.size, 1); assert.equal(h.inserts, 0); assert.equal(h.filas.get(1).estado, 'Cancelada'); recursoComun();
});

test('edición primero: alta consulta las fechas actualizadas antes de reservar el rango liberado', { timeout: 3000 }, async () => {
  h.sembrar({}); const entra = senal(), continuar = senal();
  h.hooks.evento = async (_tx, a) => { if (a.tipo === 'RESERVA_MODIFICADA') { entra.resolver(); await continuar.promise; } };
  const edicion = servicio.modificarReserva(1, { fechaIngreso: '2100-01-20', fechaEgreso: '2100-01-22' }); await entra.promise;
  const alta = crear(); continuar.resolver(); await Promise.all([edicion, alta]);
  assert.equal(h.filas.get(1).fechaIngreso, '2100-01-20'); assert.equal(h.filas.get(2).fechaIngreso, '2100-01-10'); recursoComun();
});

test('alta primero: edición posterior no puede mover otra reserva al rango recién ocupado', { timeout: 3000 }, async () => {
  h.sembrar({}); const entra = senal(), continuar = senal();
  h.hooks.evento = async (_tx, a) => { if (a.tipo === 'RESERVA_CREADA') { entra.resolver(); await continuar.promise; } };
  const alta = crear({ fechaIngreso: '2100-01-20', fechaEgreso: '2100-01-22' }); await entra.promise;
  const edicion = servicio.modificarReserva(1, { fechaIngreso: '2100-01-20', fechaEgreso: '2100-01-22' }); continuar.resolver();
  const resultados = await Promise.allSettled([alta, edicion]);
  assert.equal(resultados[0].status, 'fulfilled'); assert.equal(resultados[1].status, 'rejected');
  assert.match(resultados[1].reason.message, /conflicto de fechas/);
  assert.equal(h.filas.get(1).fechaIngreso, '2100-01-10'); assert.equal(h.filas.size, 2); recursoComun();
});

test('alta primero y finalización después: reserva y evento se confirman antes del cambio global explícito', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal();
  h.hooks.evento = async (_tx, a) => { if (a.tipo === 'RESERVA_CREADA') { entra.resolver(); await continuar.promise; } };
  const alta = crear({ fechaIngreso: '2099-12-28', fechaEgreso: '2099-12-30' }); await entra.promise;
  const finalizacion = repo.finalizarConEventos('2100-01-01'); continuar.resolver();
  const [creada, lote] = await Promise.all([alta, finalizacion]);
  assert.equal(creada.estado, 'Confirmada'); assert.equal(lote.cantidadFinalizadas, 1); assert.equal(h.filas.get(1).estado, 'Finalizada');
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_CREADA', 'RESERVA_FINALIZADA']); recursoComun();
});

test('finalización primero no libera artificialmente disponibilidad de una reserva Finalizada', { timeout: 3000 }, async () => {
  h.sembrar({ fechaIngreso: '2099-12-28', fechaEgreso: '2099-12-30' }); const entra = senal(), continuar = senal();
  h.hooks.evento = async (_tx, a) => { if (a.tipo === 'RESERVA_FINALIZADA') { entra.resolver(); await continuar.promise; } };
  const finalizacion = repo.finalizarConEventos('2100-01-01'); await entra.promise;
  const alta = crear({ fechaIngreso: '2099-12-29', fechaEgreso: '2099-12-31' }); continuar.resolver();
  const resultados = await Promise.allSettled([finalizacion, alta]);
  assert.equal(resultados[0].status, 'fulfilled'); assert.equal(resultados[1].status, 'rejected');
  assert.equal(h.filas.get(1).estado, 'Finalizada'); assert.equal(h.filas.size, 1); assert.equal(h.inserts, 0); recursoComun();
});

test('validaciones puras previas no abren transacción ni consultan dependencias', async () => {
  for (const cambio of [{ idPropiedad: 0 }, { idHuesped: '01' }, { fechaIngreso: '2100-02-30' }, { fechaEgreso: '2100-01-09' }, { horaIngreso: '24:00' }]) await assert.rejects(crear(cambio));
  assert.equal(h.inicios, 0); assert.equal(h.consultas.length, 0);
});

test('dependencias, estado, capacidad e importes inválidos se rechazan sin INSERT', async () => {
  for (const cambio of [{ idPropiedad: 99 }, { idHuesped: 99 }, { cantidadHuespedes: 5 }, { cantidadHuespedes: 1.5 }, { montoEstimado: -1 }, { montoEstimado: 'Infinity' }]) {
    h.reset(); await assert.rejects(crear(cambio)); revertida(); assert.equal(h.inserts, 0);
  }
  h.reset(); h.propiedades.get(7).estado = 'Inactiva';
  await assert.rejects(crear(), /no se encuentra disponible/); revertida();
});

async function crearHTTP(cambio = {}, cuenta = cuentas[0]) {
  const headers = { 'Content-Type': 'application/json' };
  if (cuenta) headers.Authorization = `Bearer ${jwt.sign({ idUsuario: cuenta.idUsuario, email: cuenta.email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' })}`;
  const respuesta = await fetch(`${base}/api/reservas`, { method: 'POST', headers, body: JSON.stringify(datos(cambio)) });
  return { respuesta, datos: await respuesta.json() };
}

test('HTTP: 401/403 y validación pura 400 preceden a BEGIN; ambos roles conservan alta permitida', async () => {
  assert.equal((await crearHTTP({}, null)).respuesta.status, 401);
  assert.equal((await crearHTTP({ canal: 'Booking' }, cuentas[1])).respuesta.status, 403);
  assert.equal((await crearHTTP({ estado: 'Confirmada' }, cuentas[1])).respuesta.status, 403);
  assert.equal((await crearHTTP({ horaIngreso: '24:00' })).respuesta.status, 400); assert.equal(h.inicios, 0);
  for (const cuenta of cuentas) {
    h.reset(); const creada = await crearHTTP({}, cuenta);
    assert.equal(creada.respuesta.status, 201); assert.equal(creada.datos.mensaje, 'Reserva creada correctamente.');
    assert.equal(creada.datos.reserva.canal, 'Manual'); assert.equal(h.eventos.length, 1);
  }
});

test('HTTP: conflicto anterior conserva 400 y no registra un alta ni historial', async () => {
  h.sembrar({}); const { respuesta, datos } = await crearHTTP();
  assert.equal(respuesta.status, 400); assert.deepEqual(datos, { mensaje: 'La propiedad ya posee una reserva en ese rango de fechas.' });
  assert.equal(h.filas.size, 1); assert.equal(h.inserts, 0); assert.equal(h.eventos.length, 0);
});

test('HTTP: commit aplicado con acuse perdido devuelve código seguro, sin éxito, reserva ni Retry-After', async () => {
  h.acusePerdido = true; const { respuesta, datos } = await crearHTTP();
  assert.equal(respuesta.status, 500);
  assert.deepEqual(datos, { codigo: 'OPERACION_RESULTADO_INCIERTO', mensaje: 'No se pudo confirmar el resultado del guardado. Recargá los datos antes de reintentar.' });
  assert.equal(respuesta.headers.has('Retry-After'), false); assert.equal(h.inserts, 1); assert.equal(h.commits, 1);
  assert.equal(h.filas.size, 1); assert.equal(h.eventos.length, 1);
});

test('HTTP: fallo de historial del driver se sanitiza y revierte la reserva', async () => {
  h.fallos.evento = Object.assign(Error('Detalle ficticio reservado del motor'), { code: 'EREQUEST' });
  const { respuesta, datos } = await crearHTTP(); assert.equal(respuesta.status, 503);
  assert.deepEqual(datos, { codigo: 'ERROR_INTERNO', mensaje: 'No se pudo completar la operación. Reintente más tarde.' }); revertida();
});
