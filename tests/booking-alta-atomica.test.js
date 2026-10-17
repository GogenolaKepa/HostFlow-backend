// Aplicación/repositorios reales con SQL ficticio. Sin Azure, dotenv ni motor SQL.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { prepararBookingAislado } = require('./helpers/bookingAislado');
const { senal } = require('./helpers/cancelacionAislada');
const h = prepararBookingAislado();
const previo = { JWT_SECRET: process.env.JWT_SECRET, HOSTFLOW_AUTH_SOURCE: process.env.HOSTFLOW_AUTH_SOURCE };
process.env.JWT_SECRET = randomBytes(32).toString('hex'); process.env.HOSTFLOW_AUTH_SOURCE = 'mock';
const servicio = require('../src/services/ReservaService');
const repo = require('../src/repositories/ReservaRepository');
const booking = require('../src/services/BookingInboundService');
const fechaOriginal = servicio.obtenerFechaActualArgentina, ackOriginal = booking.marcarEventoProcesado;
servicio.obtenerFechaActualArgentina = () => '2100-01-01';
booking.marcarEventoProcesado = function(id) {
  h.acks++; h.secuencia.push('ack');
  const entrada = this.obtenerEventoPorId(id);
  const identidad = h.consultas.filter(c => c.args.canal === 'Booking' && c.args.idExterno === entrada.idExterno
    && c.texto.includes('FROM dbo.Reservas r')).at(-1);
  assert.ok(h.transacciones.find(tx => tx.id === identidad.tx).confirmada, 'ACK solo después del commit de SU unidad');
  if (h.falloAckAntes) throw Error('Fallo ficticio privado antes del ACK');
  if (h.ackSinResultado) return undefined;
  const evento = ackOriginal.call(this, id);
  if (h.falloAckDespues) throw Error('Fallo ficticio privado después del ACK');
  return evento;
};
const { usuarios } = require('../src/data/mockData');
const cuentas = ['Administrador', 'Operador'].map((nombre, i) => ({ idUsuario: 992001 + i,
  nombre: 'Inbound ficticio', email: `inbound-${i}@example.invalid`, estado: 'Activo', rol: { nombre } }));
usuarios.push(...cuentas);
const app = require('../src/app'); let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  h.reset(); h.acks = 0; h.falloAckAntes = false; h.falloAckDespues = false;
  h.ackSinResultado = false;
  booking.eventosPendientes = [];
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  servicio.obtenerFechaActualArgentina = fechaOriginal; booking.marcarEventoProcesado = ackOriginal;
  for (const c of cuentas) usuarios.splice(usuarios.indexOf(c), 1);
  for (const [k, v] of Object.entries(previo)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
const datos = cambios => ({ idExterno: 'booking-fixture', idPropiedad: 7, nombreHuesped: 'Persona', apellidoHuesped: 'Ficticia',
  fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12', horaIngreso: '17:20', horaEgreso: '09:40',
  cantidadHuespedes: 2, montoEstimado: 125.5, ...cambios });
const nuevo = cambios => booking.simularNuevaReserva(datos(cambios));
const procesar = evento => servicio.procesarEventoBooking(evento.idEvento);
const manual = cambios => servicio.crearReserva({ idPropiedad: 7, idHuesped: 8, fechaIngreso: '2100-01-10',
  fechaEgreso: '2100-01-12', horaIngreso: '15:00', horaEgreso: '10:00', cantidadHuespedes: 2, montoEstimado: 100, ...cambios });
function sinGuardados(evento, huespedesAntes = 0) {
  assert.equal(h.filas.size, 0); assert.equal(h.eventos.length, 0); assert.equal(h.huespedes.size, huespedesAntes);
  assert.equal(h.commits, 0); assert.equal(h.rollbacks, 1); assert.equal(h.acks, 0);
  assert.equal(evento.estado, 'Pendiente'); assert.equal(h.poolRequests, 0);
}
function protocolo() {
  const locks = h.consultas.filter(c => c.texto.includes('sp_getapplock'));
  assert.ok(locks.length >= 2);
  assert.ok(locks.every(c => c.args.recurso === 'HostFlow:Operaciones:FinalizacionReservas'));
  assert.equal(h.poolRequests, 0);
}

test('alta con huésped reutilizado: una conexión, SQL histórico, historial estricto, DTO/commit/ACK ordenados', async () => {
  const evento = nuevo();
  h.hooks.commitAntes = () => {
    assert.equal(evento.estado, 'Pendiente'); assert.equal(h.acks, 0);
    assert.match(h.consultas.at(-1).texto, /FROM dbo.Reservas r/);
    assert.equal(h.filas.size, 0); assert.equal(h.eventos.length, 0);
  };
  const resultado = await procesar(evento);
  assert.equal(resultado.duplicada, false); assert.equal(resultado.conflictoDetectado, false); assert.equal(resultado.advertencia, null);
  assert.equal(resultado.evento.estado, 'Procesado'); assert.equal(resultado.reserva.canal, 'Booking');
  assert.equal(resultado.reserva.estado, 'Confirmada'); assert.equal(resultado.reserva.estadoSincronizacion, 'Sincronizada');
  assert.equal(resultado.reserva.tipoGestion, 'EXTERNA');
  assert.equal(h.inicios, 1); assert.equal(h.commits, 1); assert.equal(h.rollbacks, 0); assert.equal(h.inserts, 1);
  assert.equal(h.insertsHuesped, 0); assert.equal(h.acks, 1); assert.deepEqual(h.secuencia, ['commit', 'ack']);
  assert.equal(h.poolRequests, 0); assert.equal(new Set(h.consultas.map(c => c.tx)).size, 1);
  assert.equal(h.consultas[0].args.recurso, 'HostFlow:Operaciones:FinalizacionReservas');
  assert.deepEqual(h.consultas[1].args, { canal: 'Booking', idExterno: evento.idExterno });
  const insert = h.consultas.find(c => /INSERT INTO dbo.Reservas\b/.test(c.texto));
  assert.deepEqual(insert.args, { idPropiedad: 7, idHuesped: 8, canal: 'Booking', estado: 'Confirmada',
    fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12', horaIngreso: '17:20', horaEgreso: '09:40',
    cantidadHuespedes: 2, montoEstimado: 125.5, idExterno: evento.idExterno });
  const historial = h.eventos[0];
  assert.equal(historial.tipo, 'RESERVA_RECIBIDA'); assert.equal(historial.origen, 'Booking');
  assert.equal(historial.titulo, 'Reserva recibida desde Booking');
  assert.equal(historial.descripcion, 'HostFlow recibió y sincronizó una nueva reserva confirmada desde Booking.');
  assert.deepEqual(JSON.parse(historial.datosJson), { canal: 'Booking', idExterno: evento.idExterno,
    idEventoExterno: evento.idEvento, estado: 'Confirmada', propiedad: 'Casa ficticia', huesped: 'Persona Ficticia',
    fechaIngreso: '2100-01-10', horaIngreso: '17:20', fechaEgreso: '2100-01-12', horaEgreso: '09:40',
    cantidadHuespedes: 2, montoEstimado: 125.5, conflictoDetectado: false });
});

test('huésped nuevo y reserva se publican juntos al confirmar; búsqueda y defaults anteriores', async () => {
  h.huespedes.clear(); const evento = nuevo({ nombreHuesped: '', apellidoHuesped: '' });
  h.hooks.commitAntes = tx => {
    assert.equal(h.huespedes.size, 0); assert.equal(tx.huespedes.size, 1);
    assert.equal(tx.cambios.size, 1); assert.equal(tx.eventos.length, 1);
  };
  await procesar(evento);
  assert.equal(h.huespedes.size, 1); assert.equal(h.insertsHuesped, 1);
  const huesped = [...h.huespedes.values()][0];
  assert.deepEqual(huesped, { idHuesped: 9, nombre: 'Huésped', apellido: 'Booking', email: null, telefono: null,
    documento: null, nacionalidad: null, origenRegistro: 'Booking' });
  assert.equal(h.filas.get(1).idHuesped, huesped.idHuesped);
});

test('conflicto externo se acepta y confirma AMBOS eventos con payload/origen originales', async () => {
  h.sembrar({}); const evento = nuevo(); const resultado = await procesar(evento);
  assert.equal(resultado.conflictoDetectado, true); assert.match(resultado.advertencia, /genera un conflicto/);
  assert.equal(h.filas.size, 2); assert.equal(h.commits, 1);
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_RECIBIDA', 'CONFLICTO_DETECTADO']);
  const conflicto = h.eventos[1]; assert.equal(conflicto.origen, 'Sistema');
  assert.equal(conflicto.titulo, 'Conflicto de disponibilidad detectado');
  assert.equal(conflicto.descripcion, 'HostFlow detectó una superposición con otra reserva. Como el cambio proviene de un canal externo confirmado, la información del canal se conserva y el conflicto queda registrado para revisión.');
  assert.deepEqual(JSON.parse(conflicto.datosJson), { canal: 'Booking', contexto: 'RESERVA_RECIBIDA',
    fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12', idExterno: evento.idExterno, idOperacion: null, idSolicitud: null });
});

test('duplicada relee por canal/ID bajo lock, no reconstruye historial y acusa después de commit', async () => {
  const fila = h.sembrar({ canal: 'Booking', idExterno: 'booking-fixture' });
  const evento = nuevo({ fechaIngreso: 'fecha-invalida' });
  const resultado = await procesar(evento);
  assert.equal(resultado.duplicada, true); assert.equal(resultado.reserva.idReserva, fila.idReserva);
  assert.equal(resultado.advertencia, 'La reserva ya existía en HostFlow. No se creó un duplicado.');
  assert.equal(h.inserts, 0); assert.equal(h.insertsHuesped, 0); assert.equal(h.eventos.length, 0);
  assert.deepEqual(h.secuencia, ['commit', 'ack']); assert.equal(h.consultas.length, 3);
});

test('el mismo ID externo de Airbnb no se confunde con Booking', async () => {
  h.sembrar({ canal: 'Airbnb', idExterno: 'booking-fixture' });
  const r = await procesar(nuevo()); assert.equal(r.duplicada, false); assert.equal(r.reserva.canal, 'Booking');
  assert.equal(h.filas.size, 2); assert.equal(h.inserts, 1);
});

for (const paso of ['identidad', 'propiedad', 'buscarHuesped', 'crearHuesped', 'conflicto', 'insert', 'lecturaPostInsert', 'RESERVA_RECIBIDA', 'lecturaFinal']) {
  test(`fallo ${paso}: rollback conjunto huésped/reserva/historial, sin ACK ni reintento`, async () => {
    h.huespedes.clear(); const evento = nuevo();
    const error = Object.assign(Error('Detalle ficticio privado del motor'), { code: 'EREQUEST' }); h.fallos[paso] = error;
    await assert.rejects(procesar(evento), e => e === error); sinGuardados(evento);
    assert.equal(h.inicios, 1); assert.ok(h.inserts <= 1); assert.ok(h.insertsHuesped <= 1);
  });
}

test('fallo del evento de conflicto revierte también recepción y huésped nuevo', async () => {
  h.huespedes.clear(); h.sembrar({}); const evento = nuevo();
  h.fallos.CONFLICTO_DETECTADO = Error('Fallo ficticio de conflicto');
  await assert.rejects(procesar(evento), /Fallo ficticio/);
  assert.equal(h.filas.size, 1); assert.equal(h.filas.get(1).canal, 'Manual');
  assert.equal(h.huespedes.size, 0); assert.equal(h.eventos.length, 0); assert.equal(h.acks, 0); assert.equal(h.rollbacks, 1);
});

for (const tipo of ['RESERVA_RECIBIDA', 'CONFLICTO_DETECTADO']) {
  test(`${tipo}: resultado ausente o incompatible impide commit`, async () => {
    for (const flag of ['eventoSinResultado', 'eventoIncompatible']) {
      h.reset(); h.acks = 0; h.huespedes.clear(); if (tipo === 'CONFLICTO_DETECTADO') h.sembrar({});
      booking.eventosPendientes = []; const evento = nuevo(); h[flag] = tipo;
      await assert.rejects(procesar(evento), /historial/);
      assert.equal(h.filas.size, tipo === 'CONFLICTO_DETECTADO' ? 1 : 0);
      assert.equal(h.huespedes.size, 0); assert.equal(h.eventos.length, 0); assert.equal(h.commits, 0);
      assert.equal(h.acks, 0); assert.equal(evento.estado, 'Pendiente');
    }
  });
}

test('huésped o lectura post-INSERT sin resultado no confirman una reserva ni acusan', async () => {
  for (const flag of ['huespedSinResultado', 'lecturaVacia']) {
    h.reset(); h.acks = 0; h.huespedes.clear(); booking.eventosPendientes = []; const evento = nuevo();
    h[flag] = flag === 'lecturaVacia' ? 'lecturaPostInsert' : true;
    await assert.rejects(procesar(evento), /No se pudo confirmar/); sinGuardados(evento);
  }
});

test('lectura final vacía o DTO duplicado fallido revierte y conserva ACK pendiente', async () => {
  h.lecturaVacia = 'lecturaFinal'; const evento = nuevo();
  await assert.rejects(procesar(evento), /no existe/); sinGuardados(evento, 1);
  h.reset(); h.acks = 0; booking.eventosPendientes = [];
  h.sembrar({ canal: 'Booking', idExterno: 'booking-fixture' }); h.fallos.lectura = Error('Lectura duplicada fallida');
  const otro = nuevo(); await assert.rejects(procesar(otro), /Lectura duplicada/);
  assert.equal(h.inserts, 0); assert.equal(h.acks, 0); assert.equal(h.rollbacks, 1); assert.equal(otro.estado, 'Pendiente');
});

test('rollback fallido devuelve incertidumbre y no acuse, sin afirmar que nada persistió', async () => {
  h.huespedes.clear(); const evento = nuevo();
  h.fallos.RESERVA_RECIBIDA = Error('Evento ficticio fallido'); h.fallos.rollback = Error('Rollback ficticio fallido');
  await assert.rejects(procesar(evento), e => e.codigo === 'OPERACION_RESULTADO_INCIERTO' && /Recargá/.test(e.message));
  assert.equal(h.rollbacks, 1); assert.equal(h.commits, 0); assert.equal(h.acks, 0); assert.equal(evento.estado, 'Pendiente');
  h.transacciones.forEach(tx => tx.liberaciones.forEach(liberar => liberar()));
});

test('commit aplicado con acuse SQL perdido: error incierto, filas/eventos conservados, ACK de cola pendiente', async () => {
  h.huespedes.clear(); const evento = nuevo(); h.acusePerdido = true;
  await assert.rejects(procesar(evento), e => e.codigo === 'OPERACION_RESULTADO_INCIERTO');
  assert.equal(h.filas.size, 1); assert.equal(h.huespedes.size, 1); assert.equal(h.eventos.length, 1);
  assert.equal(h.inicios, 1); assert.equal(h.commits, 1); assert.equal(h.rollbacks, 1); assert.equal(h.acks, 0);
  assert.equal(evento.estado, 'Pendiente'); assert.equal(h.inserts, 1);
  h.acusePerdido = false;
  const repetido = await procesar(evento);
  assert.equal(repetido.duplicada, true); assert.equal(h.inserts, 1); assert.equal(h.insertsHuesped, 1);
  assert.equal(h.eventos.length, 1); assert.equal(evento.estado, 'Procesado');
});

test('fallo del commit antes de aplicarse también es conservador: no ACK ni reintento automático', async () => {
  const evento = nuevo(); h.fallos.commitAntes = Error('Acuse incierto ficticio');
  await assert.rejects(procesar(evento), e => e.codigo === 'OPERACION_RESULTADO_INCIERTO');
  assert.equal(h.commits, 1); assert.equal(h.rollbacks, 1); assert.equal(h.acks, 0);
  assert.equal(evento.estado, 'Pendiente'); assert.equal(h.filas.size, 0); assert.equal(h.inicios, 1);
});

test('fallo del ACK después de commit confirmado: código distinto, sin rollback y relectura explícita sin duplicar', async () => {
  h.huespedes.clear(); const evento = nuevo(); h.falloAckAntes = true;
  await assert.rejects(procesar(evento), e => e.codigo === 'BOOKING_ACUSE_PENDIENTE' && /confirmados en HostFlow/.test(e.message));
  assert.equal(h.filas.size, 1); assert.equal(h.huespedes.size, 1); assert.equal(h.eventos.length, 1);
  assert.equal(h.rollbacks, 0); assert.equal(h.commits, 1); assert.equal(h.acks, 1); assert.equal(evento.estado, 'Pendiente');
  h.falloAckAntes = false;
  const segundo = await procesar(evento);
  assert.equal(segundo.duplicada, true); assert.equal(h.inserts, 1); assert.equal(h.insertsHuesped, 1);
  assert.equal(h.eventos.length, 1); assert.equal(evento.estado, 'Procesado'); assert.equal(h.rollbacks, 0);
});

test('ACK que cambia memoria y luego falla no se presenta como rollback ni éxito', async () => {
  const evento = nuevo(); h.falloAckDespues = true;
  await assert.rejects(procesar(evento), e => e.codigo === 'BOOKING_ACUSE_PENDIENTE');
  assert.equal(evento.estado, 'Procesado'); assert.equal(h.filas.size, 1); assert.equal(h.eventos.length, 1);
  assert.equal(h.rollbacks, 0); assert.equal(h.commits, 1); assert.equal(h.inserts, 1);
});

test('ACK sin resultado confirmado no anuncia éxito aunque SQL haya confirmado', async () => {
  const evento = nuevo(); h.ackSinResultado = true;
  await assert.rejects(procesar(evento), e => e.codigo === 'BOOKING_ACUSE_PENDIENTE');
  assert.equal(evento.estado, 'Pendiente'); assert.equal(h.filas.size, 1); assert.equal(h.eventos.length, 1);
  assert.equal(h.rollbacks, 0); assert.equal(h.commits, 1); assert.equal(h.acks, 1);
});

test('timeouts de SQL y rechazo de applock revierten sin ACK ni creación', async () => {
  for (const paso of ['applock', 'identidad', 'insert']) {
    h.reset(); h.acks = 0; booking.eventosPendientes = []; const evento = nuevo();
    const error = Object.assign(Error('Timeout ficticio'), { code: 'ETIMEOUT' }); h.fallos[paso] = error;
    await assert.rejects(procesar(evento), e => e === error); sinGuardados(evento, 1);
  }
  h.reset(); h.acks = 0; booking.eventosPendientes = []; const evento = nuevo(); h.resultadoLock = -1;
  await assert.rejects(procesar(evento), /ocupada/); sinGuardados(evento, 1); assert.equal(h.consultas.length, 1);
});

test('dos entregas pendientes con la misma identidad no insertan dos veces tras releer', async () => {
  const a = nuevo(), b = nuevo(); const [uno, dos] = await Promise.all([procesar(a), procesar(b)]);
  assert.equal(uno.duplicada, false); assert.equal(dos.duplicada, true); assert.equal(h.inserts, 1);
  assert.equal(h.eventos.length, 1); assert.equal(h.acks, 2); assert.equal(h.filas.size, 1); protocolo();
});

test('el lock SQL cooperante también relee identidad sin depender de la cola serial en memoria', { timeout: 3000 }, async () => {
  const a = nuevo(), b = nuevo(), entra = senal(), continuar = senal(), espera = senal();
  h.hooks.RESERVA_RECIBIDA = async () => { entra.resolver(); await continuar.promise; };
  h.hooks.applock = async tx => { if (tx.id === 2) espera.resolver(); };
  // Acceso directo deliberado: no usar procesarEventoBooking ni su cola de proceso.
  const una = servicio.procesarNuevaReservaBooking(a); await entra.promise;
  const otra = servicio.procesarNuevaReservaBooking(b); await espera.promise;
  assert.equal(h.consultas.filter(c => c.tx === 2).length, 1);
  continuar.resolver(); const [r1, r2] = await Promise.all([una, otra]);
  assert.equal(r1.duplicada, false); assert.equal(r2.duplicada, true);
  assert.equal(h.inserts, 1); assert.equal(h.eventos.length, 1); assert.equal(h.acks, 2); protocolo();
});

test('Booking primero: alta manual espera el commit y después rechaza la disponibilidad ocupada', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal(), espera = senal();
  h.hooks.RESERVA_RECIBIDA = async () => { entra.resolver(); await continuar.promise; };
  h.hooks.applock = async tx => { if (tx.id === 2) espera.resolver(); };
  const externa = procesar(nuevo()); await entra.promise;
  const interna = manual(); await espera.promise; assert.equal(h.consultas.filter(c => c.tx === 2).length, 1);
  continuar.resolver(); const r = await Promise.allSettled([externa, interna]);
  assert.equal(r[0].status, 'fulfilled'); assert.equal(r[1].status, 'rejected');
  assert.match(r[1].reason.message, /ya posee una reserva/); assert.equal(h.filas.size, 1); protocolo();
});

test('manual primero: Booking espera y acepta el conflicto con ambos eventos obligatorios', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal(); h.hooks.RESERVA_CREADA = async () => { entra.resolver(); await continuar.promise; };
  const interna = manual(); await entra.promise; const externa = procesar(nuevo()); continuar.resolver();
  const [, r] = await Promise.all([interna, externa]); assert.equal(r.conflictoDetectado, true);
  assert.equal(h.filas.size, 2); assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_CREADA', 'RESERVA_RECIBIDA', 'CONFLICTO_DETECTADO']); protocolo();
});

test('cancelación primero: Booking observa rango liberado; mismo protocolo y sin conflicto artificial', { timeout: 3000 }, async () => {
  h.sembrar({}); const entra = senal(), continuar = senal();
  h.hooks.RESERVA_CANCELADA = async () => { entra.resolver(); await continuar.promise; };
  const cancelacion = servicio.cancelarReserva(1); await entra.promise; const externa = procesar(nuevo()); continuar.resolver();
  const [, r] = await Promise.all([cancelacion, externa]); assert.equal(r.conflictoDetectado, false);
  assert.equal(h.filas.get(1).estado, 'Cancelada'); protocolo();
});

test('Booking primero: cancelación posterior conserva la recepción e historial de conflicto ya confirmados', { timeout: 3000 }, async () => {
  h.sembrar({}); const entra = senal(), continuar = senal();
  h.hooks.RESERVA_RECIBIDA = async () => { entra.resolver(); await continuar.promise; };
  const externa = procesar(nuevo()); await entra.promise;
  const cancelacion = servicio.cancelarReserva(1); continuar.resolver();
  const [r] = await Promise.all([externa, cancelacion]); assert.equal(r.conflictoDetectado, true);
  assert.equal(h.filas.get(1).estado, 'Cancelada'); assert.equal(h.filas.get(2).canal, 'Booking');
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_RECIBIDA', 'CONFLICTO_DETECTADO', 'RESERVA_CANCELADA']); protocolo();
});

test('edición primero: Booking relee disponibilidad después del commit de las nuevas fechas', { timeout: 3000 }, async () => {
  h.sembrar({}); const entra = senal(), continuar = senal();
  h.hooks.RESERVA_MODIFICADA = async () => { entra.resolver(); await continuar.promise; };
  const edicion = servicio.modificarReserva(1, { fechaIngreso: '2100-01-20', fechaEgreso: '2100-01-22' });
  await entra.promise; const externa = procesar(nuevo()); continuar.resolver();
  const [, r] = await Promise.all([edicion, externa]); assert.equal(r.conflictoDetectado, false); protocolo();
});

test('Booking primero: edición posterior no ocupa el rango externo recién confirmado', { timeout: 3000 }, async () => {
  h.sembrar({ fechaIngreso: '2100-01-20', fechaEgreso: '2100-01-22' });
  const entra = senal(), continuar = senal();
  h.hooks.RESERVA_RECIBIDA = async () => { entra.resolver(); await continuar.promise; };
  const externa = procesar(nuevo()); await entra.promise;
  const edicion = servicio.modificarReserva(1, { fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12' }); continuar.resolver();
  const r = await Promise.allSettled([externa, edicion]);
  assert.equal(r[0].status, 'fulfilled'); assert.equal(r[1].status, 'rejected'); assert.match(r[1].reason.message, /conflicto de fechas/);
  assert.equal(h.filas.get(1).fechaIngreso, '2100-01-20'); protocolo();
});

test('finalización y Booking comparten lock y se confirman secuencialmente con sus historiales', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal();
  h.hooks.RESERVA_RECIBIDA = async () => { entra.resolver(); await continuar.promise; };
  const externa = procesar(nuevo({ fechaIngreso: '2099-12-28', fechaEgreso: '2099-12-30' }));
  await entra.promise; const finalizacion = repo.finalizarConEventos('2100-01-01'); continuar.resolver();
  const [r, f] = await Promise.all([externa, finalizacion]); assert.equal(r.reserva.estado, 'Confirmada');
  assert.equal(f.cantidadFinalizadas, 1); assert.equal(h.filas.get(1).estado, 'Finalizada');
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_RECIBIDA', 'RESERVA_FINALIZADA']); protocolo();
});

test('finalización primero: Booking conserva aceptación y conflicto ante la fila histórica Finalizada', { timeout: 3000 }, async () => {
  h.sembrar({ fechaIngreso: '2099-12-28', fechaEgreso: '2099-12-30' });
  const entra = senal(), continuar = senal();
  h.hooks.RESERVA_FINALIZADA = async () => { entra.resolver(); await continuar.promise; };
  const finalizacion = repo.finalizarConEventos('2100-01-01'); await entra.promise;
  const externa = procesar(nuevo({ fechaIngreso: '2099-12-28', fechaEgreso: '2099-12-30' })); continuar.resolver();
  const [, r] = await Promise.all([finalizacion, externa]); assert.equal(r.conflictoDetectado, true);
  assert.equal(h.filas.get(1).estado, 'Finalizada'); assert.equal(h.filas.size, 2);
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_FINALIZADA', 'RESERVA_RECIBIDA', 'CONFLICTO_DETECTADO']); protocolo();
});

test('validaciones conservan mensajes y no crean huésped, reserva ni ACK ante datos inválidos', async () => {
  for (const cambio of [{ fechaIngreso: '2100-02-30' }, { horaIngreso: '24:00' }, { cantidadHuespedes: 5 },
    { cantidadHuespedes: 1.5 }, { montoEstimado: -1 }, { montoEstimado: 'Infinity' }, { idPropiedad: 99 }]) {
    h.reset(); h.acks = 0; booking.eventosPendientes = []; const evento = nuevo(cambio);
    await assert.rejects(procesar(evento)); sinGuardados(evento, 1); assert.equal(h.inserts, 0); assert.equal(h.insertsHuesped, 0);
  }
});

async function http(evento, cuenta = cuentas[0], id = evento.idEvento) {
  const headers = cuenta ? { Authorization: `Bearer ${jwt.sign({ idUsuario: cuenta.idUsuario, email: cuenta.email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' })}` } : {};
  const res = await fetch(`${base}/api/integraciones/booking/eventos/${id}/procesar`, { method: 'POST', headers });
  return { res, body: await res.json() };
}

test('HTTP: 401/403/ID inválido antes de BEGIN; Administrador autorizado conserva respuesta 200', async () => {
  const evento = nuevo();
  assert.equal((await http(evento, null)).res.status, 401);
  assert.equal((await http(evento, cuentas[1])).res.status, 403);
  assert.equal((await http(evento, cuentas[0], '1e2')).res.status, 400); assert.equal(h.inicios, 0);
  const r = await http(evento); assert.equal(r.res.status, 200); assert.equal(r.body.duplicada, false);
  assert.equal(r.body.evento.estado, 'Procesado'); assert.equal(r.body.reserva.canal, 'Booking');
});

test('HTTP: commit incierto conserva código/mensaje seguro, sin éxito ni sugerencia de reintento automático', async () => {
  const evento = nuevo(); h.acusePerdido = true; const { res, body } = await http(evento);
  assert.equal(res.status, 500); assert.deepEqual(body, { codigo: 'OPERACION_RESULTADO_INCIERTO',
    mensaje: 'No se pudo confirmar el resultado del guardado. Recargá los datos antes de reintentar.' });
  assert.equal(res.headers.has('Retry-After'), false); assert.equal(h.acks, 0); assert.equal(h.inserts, 1);
  assert.equal(h.filas.size, 1); assert.equal(h.eventos.length, 1);
});

test('HTTP: ACK pendiente se distingue de SQL incierto; driver sanitizado y validación 400 preservados', async () => {
  const evento = nuevo(); h.falloAckAntes = true; const r = await http(evento);
  assert.equal(r.res.status, 500); assert.equal(r.body.codigo, 'BOOKING_ACUSE_PENDIENTE');
  assert.match(r.body.mensaje, /confirmados en HostFlow/); assert.match(r.body.mensaje, /Recargá/);
  assert.equal(r.res.headers.has('Retry-After'), false); assert.equal(Object.hasOwn(r.body, 'reserva'), false);
  assert.equal(h.rollbacks, 0); assert.equal(h.inserts, 1);
  h.reset(); h.acks = 0; h.falloAckAntes = false; booking.eventosPendientes = [];
  h.fallos.RESERVA_RECIBIDA = Object.assign(Error('Detalle ficticio reservado'), { code: 'EREQUEST' });
  const otro = nuevo(); const fallo = await http(otro); assert.equal(fallo.res.status, 503);
  assert.deepEqual(fallo.body, { codigo: 'ERROR_INTERNO', mensaje: 'No se pudo completar la operación. Reintente más tarde.' });
  assert.equal(h.filas.size, 0); assert.equal(h.acks, 0);
  h.reset(); h.acks = 0; booking.eventosPendientes = [];
  const invalido = nuevo({ horaIngreso: '24:00' }); assert.equal((await http(invalido)).res.status, 400);
});
