const { versionReserva } = require('../src/security/versionReserva');
// Servicios/repositorios/JWT reales; driver y filas ficticios, sin dotenv o motor SQL.
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
const repo = require('../src/repositories/ReservaRepository');
const fechaAnterior = servicio.obtenerFechaActualArgentina;
servicio.obtenerFechaActualArgentina = () => '2100-01-01';
const { usuarios } = require('../src/data/mockData');
const cuentas = ['Administrador', 'Operador'].map((nombre, i) => ({ idUsuario: 990001 + i,
  nombre: 'Edición ficticia', email: `edicion-${i}@example.invalid`, estado: 'Activo', rol: { nombre } }));
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
const editar = datos => servicio.modificarReserva(1, datos);
function revertida() {
  assert.equal(h.reserva.estado, 'Confirmada'); assert.equal(h.reserva.montoEstimado, 100);
  assert.deepEqual(h.eventos, []); assert.equal(h.commits, 0); assert.equal(h.rollbacks, 1); assert.equal(h.poolRequests, 0);
}
const esConflicto = e => e.codigo === 'RESERVA_CONFLICTO_CONCURRENCIA' && /Recargá/.test(e.message);

test('edición normal: una conexión/transacción, estado leído en SQL, UPDATE condicionado y DTO antes de commit', async () => {
  const resultado = await editar({ horaIngreso: '18:30', montoEstimado: 200, idEstadoEsperado: -123 });
  assert.equal(resultado.horaIngreso, '18:30'); assert.equal(resultado.montoEstimado, 200); assert.equal(resultado.tipoGestion, 'INTERNA');
  assert.equal(h.inicios, 1); assert.equal(h.commits, 1); assert.equal(h.rollbacks, 0); assert.equal(h.poolRequests, 0);
  assert.equal(new Set(h.consultas.map(c => c.tx)).size, 1);
  assert.equal(h.consultas[0].args.recurso, 'HostFlow:Operaciones:FinalizacionReservas');
  assert.match(h.consultas[1].texto, /UPDLOCK, HOLDLOCK/);
  const update = h.consultas.find(c => c.texto.includes('UPDATE dbo.Reservas'));
  assert.equal(update.args.idEstadoEsperado, h.idEstado('Confirmada'), 'El control procede de SQL, nunca del payload');
  assert.match(update.texto, /IdReserva = @idReserva AND IdEstadoReserva = @idEstadoEsperado/);
  assert.match(update.texto, /Nombre NOT IN \(N'Cancelada', N'Finalizada'\)/);
  assert.match(update.texto, /Nombre = N'Manual'/);
  assert.match(update.texto, /OUTPUT INSERTED.IdReserva INTO @Actualizadas/);
  assert.doesNotMatch(update.texto, /rowversion|@@ROWCOUNT/i);
  assert.match(h.consultas.at(-1).texto, /FROM dbo.Reservas r/);
  assert.equal(h.eventos.length, 1); assert.equal(h.eventos[0].tipo, 'RESERVA_MODIFICADA');
  const datos = JSON.parse(h.eventos[0].datosJson);
  assert.deepEqual(datos.camposModificados, ['horaIngreso', 'montoEstimado']);
  assert.equal(datos.antes.montoEstimado, 100); assert.equal(datos.despues.montoEstimado, 200);
});

test('edición sin cambios conserva la actualización anterior y no inventa un evento', async () => {
  const resultado = await editar({});
  assert.equal(resultado.montoEstimado, 100); assert.equal(h.updates, 1); assert.equal(h.commits, 1);
  assert.deepEqual(h.eventos, []); assert.equal(h.poolRequests, 0);
});

test('estados antes editables y cambios de estado del Administrador conservan sus reglas', async () => {
  for (const estado of ['Pendiente', 'No show']) {
    h.reset(); h.reserva.estado = estado;
    assert.equal((await editar({ montoEstimado: 200 })).estado, estado);
  }
  for (const estado of ['Cancelada', 'Finalizada']) {
    h.reset();
    assert.equal((await editar({ estado })).estado, estado);
    assert.equal(h.eventos[0].tipo, 'RESERVA_MODIFICADA');
  }
});

for (const paso of ['editar', 'evento', 'lecturaFinal', 'control', 'bloqueoFila', 'applock']) {
  test(`fallo ${paso}: rollback conjunto y propagación sin reintentos`, async () => {
    const error = Object.assign(Error(`Fallo ficticio ${paso}`), { code: ['bloqueoFila', 'applock'].includes(paso) ? 'ETIMEOUT' : 'EREQUEST' });
    h.fallos[paso] = error;
    await assert.rejects(editar({ montoEstimado: 200 }), e => e === error);
    revertida(); assert.equal(h.inicios, 1); assert.ok(h.updates <= 1);
  });
}

test('applock ocupado devuelve rechazo sin alcanzar el UPDATE', async () => {
  h.resultadoLock = -1;
  await assert.rejects(editar({ montoEstimado: 200 }), /ocupada/);
  revertida(); assert.equal(h.consultas.length, 1); assert.equal(h.updates, 0);
});

test('rollback fallido comunica incertidumbre y no afirma ausencia de guardado', async () => {
  h.fallos.evento = Error('Fallo ficticio del evento'); h.fallos.rollback = Error('Rollback ficticio fallido');
  await assert.rejects(editar({ montoEstimado: 200 }), e => e.codigo === 'OPERACION_RESULTADO_INCIERTO' && /Recargá/.test(e.message));
  assert.equal(h.commits, 0); assert.equal(h.rollbacks, 1); assert.equal(h.updates, 1);
  h.transacciones.forEach(tx => tx.liberaciones.forEach(liberar => liberar()));
});

test('commit aplicado con acuse perdido no se deshace mediante rollback ni se reintenta', async () => {
  h.acusePerdido = true;
  await assert.rejects(editar({ montoEstimado: 200 }), e => e.codigo === 'OPERACION_RESULTADO_INCIERTO');
  assert.equal(h.reserva.montoEstimado, 200); assert.equal(h.eventos.length, 1);
  assert.equal(h.commits, 1); assert.equal(h.updates, 1); assert.equal(h.rollbacks, 1);
});

test('UPDATE sin filas, salida múltiple o ID distinto rechazan la escritura y no anuncian éxito', async () => {
  for (const salida of [[], [{ idReserva: 2 }], [{ idReserva: 1 }, { idReserva: 1 }], {}]) {
    h.reset(); h.salidaUpdate = salida;
    await assert.rejects(editar({ montoEstimado: 200 }), esConflicto); revertida();
  }
  h.reset(); h.sinUpdate = true;
  await assert.rejects(editar({ montoEstimado: 200 }), esConflicto); revertida();
});

test('estado cambiado tras validar: el predicado rechaza Cancelada, Finalizada y otro estado distinto', async () => {
  for (const estado of ['Cancelada', 'Finalizada', 'Pendiente']) {
    h.reset();
    // Inyección defensiva de un cambio que el lock físico impediría entre transacciones.
    // No constituye una simulación de que UPDLOCK permite este interleaving en el motor.
    h.hooks.editar = async () => { h.reserva.estado = estado; };
    await assert.rejects(editar({ montoEstimado: 200 }), esConflicto);
    assert.equal(h.reserva.estado, estado); assert.equal(h.reserva.montoEstimado, 100);
    assert.equal(h.updates, 0); assert.equal(h.commits, 0); assert.equal(h.rollbacks, 1); assert.deepEqual(h.eventos, []);
  }
});

test('evento sin resultado revierte la edición en vez de tolerar un historial ausente', async () => {
  h.eventoSinResultado = true;
  await assert.rejects(editar({ montoEstimado: 200 }), /historial de modificación/); revertida();
});

test('dos ediciones concurrentes releen secuencialmente y preservan los campos omitidos', { timeout: 3000 }, async () => {
  const entra = senal(), segunda = senal(), continuar = senal();
  h.hooks.evento = async tx => { if (tx.id === 1) { entra.resolver(); await continuar.promise; } };
  h.hooks.applock = async tx => { if (tx.id === 2) segunda.resolver(); };
  const una = editar({ montoEstimado: 200 }); await entra.promise;
  const otra = editar({ horaEgreso: '11:00' }); await segunda.promise;
  assert.equal(h.consultas.filter(c => c.tx === 2).length, 1); continuar.resolver();
  const [primera, segundaEdicion] = await Promise.all([una, otra]);
  assert.equal(primera.montoEstimado, 200); assert.equal(segundaEdicion.montoEstimado, 200); assert.equal(segundaEdicion.horaEgreso, '11:00');
  assert.equal(h.commits, 2); assert.equal(h.eventos.length, 2); assert.equal(h.poolRequests, 0);
  assert.equal(JSON.parse(h.eventos[1].datosJson).antes.montoEstimado, 200);
});

test('edición primero, finalización después: finaliza la versión ya editada sin reapertura posterior', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal();
  h.hooks.evento = async (_tx, args) => { if (args.tipo === 'RESERVA_MODIFICADA') { entra.resolver(); await continuar.promise; } };
  const edicion = editar({ montoEstimado: 200 }); await entra.promise;
  const finalizacion = repo.finalizarConEventos('2100-02-01'); continuar.resolver();
  await Promise.all([edicion, finalizacion]);
  assert.equal(h.reserva.estado, 'Finalizada'); assert.equal(h.reserva.montoEstimado, 200);
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_MODIFICADA', 'RESERVA_FINALIZADA']);
  assert.equal(new Set(h.consultas.filter(c => c.args.recurso).map(c => c.args.recurso)).size, 1);
});

test('finalización primero, edición después: relee Finalizada y rechaza antes de modificar', { timeout: 3000 }, async () => {
  const entra = senal(), continuar = senal();
  h.hooks.evento = async (_tx, args) => { if (args.tipo === 'RESERVA_FINALIZADA') { entra.resolver(); await continuar.promise; } };
  const finalizacion = repo.finalizarConEventos('2100-02-01'); await entra.promise;
  const edicion = editar({ montoEstimado: 200 }); continuar.resolver();
  const resultados = await Promise.allSettled([finalizacion, edicion]);
  assert.equal(resultados[0].status, 'fulfilled'); assert.equal(resultados[1].status, 'rejected');
  assert.match(resultados[1].reason.message, /no admite modificaciones/);
  assert.equal(h.reserva.estado, 'Finalizada'); assert.equal(h.reserva.montoEstimado, 100);
  assert.deepEqual(h.eventos.map(e => e.tipo), ['RESERVA_FINALIZADA']);
});

test('validaciones de existencia, canal, estado, vencimiento, fechas, horas, importes y disponibilidad se mantienen', async () => {
  for (const [cambio, datos, mensaje] of [
    [null, {}, /no existe/], [{ canal: 'Booking' }, {}, /no pueden modificarse/], [{ canal: 'Airbnb' }, {}, /no pueden modificarse/],
    [{ estado: 'Cancelada' }, {}, /no admite/], [{ estado: 'Finalizada' }, {}, /no admite/],
    [{ fechaEgreso: '2000-01-01' }, {}, /vencida/], [{}, { fechaEgreso: '2100-01-01' }, /posterior/],
    [{}, { horaEgreso: '25:00' }, /horarios/], [{}, { montoEstimado: -1 }, /monto/], [{}, { montoEstimado: NaN }, /monto/],
  ]) {
    h.reset(); h.reserva = cambio === null ? null : { ...h.reserva, ...cambio };
    await assert.rejects(editar(datos), mensaje);
    assert.equal(h.updates, 0); assert.equal(h.commits, 0); assert.equal(h.rollbacks, 1); assert.deepEqual(h.eventos, []);
  }
  h.reset(); h.conflicto = true;
  await assert.rejects(editar({}), /conflicto de fechas/); revertida();
});

test('el repositorio exige contexto y control interno válidos, sin fallback al pool', async () => {
  await assert.rejects(repo.obtenerControlEdicion(1), /contexto transaccional/);
  await assert.rejects(repo.actualizarReservaManualCondicionada(1, {}, { idReserva: 1, idEstadoReserva: 12 }), /contexto transaccional/);
  const contexto = repo.conContextoTransaccional({ request() { assert.fail('Control inválido no debe consultar'); } });
  await assert.rejects(contexto.actualizarReservaManualCondicionada(1, {}, { idReserva: 2, idEstadoReserva: 12 }), esConflicto);
  assert.equal(h.poolRequests, 0);
});

async function editarHTTP(datos, cuenta = cuentas[0], id = '1') {
  const headers = { 'Content-Type': 'application/json' };
  if (cuenta) headers.Authorization = `Bearer ${jwt.sign({ idUsuario: cuenta.idUsuario, email: cuenta.email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' })}`;
  const respuesta = await fetch(`${base}/api/reservas/${id}`, { method: 'PUT', headers, body: JSON.stringify({versionEdicion:versionReserva(h.reserva),...datos}) });
  return { respuesta, datos: await respuesta.json() };
}

test('HTTP: 401/403/400 de ID preceden a BEGIN; Operador conserva solo sus campos permitidos', async () => {
  assert.equal((await editarHTTP({}, null)).respuesta.status, 401);
  assert.equal((await editarHTTP({ montoEstimado: 200 }, cuentas[1])).respuesta.status, 403);
  assert.equal((await editarHTTP({ estado: 'Confirmada' }, cuentas[1])).respuesta.status, 403);
  assert.equal((await editarHTTP({}, cuentas[0], 'NaN')).respuesta.status, 400);
  assert.equal(h.inicios, 0); assert.equal(h.consultas.length, 0);
  const valido = await editarHTTP({ horaEgreso: '11:00' }, cuentas[1]);
  assert.equal(valido.respuesta.status, 200); assert.equal(valido.datos.mensaje, 'Reserva modificada correctamente.');
  assert.equal(valido.datos.reserva.horaEgreso, '11:00'); assert.equal(h.reserva.montoEstimado, 100);
});

test('HTTP: estado cerrado e importe inválido conservan 400 sin escritura', async () => {
  assert.equal((await editarHTTP({ montoEstimado: -1 })).respuesta.status, 400);
  h.reserva.estado = 'Cancelada';
  const cerrada = await editarHTTP({ montoEstimado: 200 });
  assert.equal(cerrada.respuesta.status, 400); assert.deepEqual(cerrada.datos, { mensaje: 'La reserva ya no admite modificaciones.' });
  assert.equal(h.commits, 0); assert.equal(h.updates, 0);
});

test('HTTP: conflicto de escritura es 409, exige recarga y no declara éxito', async () => {
  h.sinUpdate = true;
  const { respuesta, datos } = await editarHTTP({ montoEstimado: 200 });
  assert.equal(respuesta.status, 409); assert.equal(datos.codigo, 'RESERVA_CONFLICTO_CONCURRENCIA');
  assert.match(datos.mensaje, /Recargá/); assert.equal(Object.hasOwn(datos, 'reserva'), false); revertida();
});

test('HTTP: commit incierto es 500 con código cerrado, sin reintentar ni devolver reserva', async () => {
  h.acusePerdido = true;
  const { respuesta, datos } = await editarHTTP({ montoEstimado: 200 });
  assert.equal(respuesta.status, 500);
  assert.deepEqual(datos, { codigo: 'OPERACION_RESULTADO_INCIERTO', mensaje: 'No se pudo confirmar el resultado del guardado. Recargá los datos antes de reintentar.' });
  assert.equal(respuesta.headers.has('Retry-After'), false); assert.equal(h.updates, 1); assert.equal(h.commits, 1);
  assert.equal(h.reserva.montoEstimado, 200); assert.equal(h.eventos.length, 1);
});

test('HTTP: errores del driver siguen sanitizados y no dejan historial ni modificación parcial', async () => {
  h.fallos.evento = Object.assign(Error('Detalle ficticio reservado del motor'), { code: 'EREQUEST' });
  const { respuesta, datos } = await editarHTTP({ montoEstimado: 200 });
  assert.equal(respuesta.status, 503);
  assert.deepEqual(datos, { codigo: 'ERROR_INTERNO', mensaje: 'No se pudo completar la operación. Reintente más tarde.' }); revertida();
});


test('formulario sin versión: 428 antes de BEGIN; tampoco admite una huella inválida', async () => {
  for(const versionEdicion of [null, '', 'alterada', {}, []]) {
    const r=await editarHTTP({horaEgreso:'11:00',versionEdicion});
    assert.equal(r.respuesta.status,428); assert.equal(r.datos.codigo,'RESERVA_VERSION_REQUERIDA');
  }
  assert.equal(h.inicios,0); assert.equal(h.updates,0); assert.equal(h.eventos.length,0);
});

test('dos formularios: HTTP rechaza el segundo estado obsoleto, conserva el primero y su único evento', async () => {
  const versionEdicion=versionReserva(h.reserva);
  const primera=await editarHTTP({horaEgreso:'11:00',versionEdicion});
  assert.equal(primera.respuesta.status,200);
  assert.notEqual(primera.datos.reserva.versionEdicion,versionEdicion);
  const segunda=await editarHTTP({horaEgreso:'12:00',versionEdicion});
  assert.equal(segunda.respuesta.status,409);assert.equal(segunda.datos.codigo,'RESERVA_CONFLICTO_CONCURRENCIA');
  assert.equal(h.reserva.horaEgreso,'11:00');assert.equal(h.updates,1);assert.equal(h.eventos.length,1);
  assert.equal(h.commits,1);assert.equal(h.rollbacks,1);assert.equal(h.poolRequests,0);
  const explicita=await editarHTTP({horaEgreso:'12:00',versionEdicion:primera.datos.reserva.versionEdicion});
  assert.equal(explicita.respuesta.status,200);assert.equal(h.eventos.length,2);
});

test('huella obtenida desde GET conserva contrato y permisos; nombre de propiedad no es una revisión de reserva', async () => {
  h.permitirPool=true;
  const dto=await servicio.obtenerReservaPorId(1);
  assert.equal(dto.versionEdicion,versionReserva(h.reserva));
  assert.equal(versionReserva({...h.reserva,propiedad:'Etiqueta cambiada'}),dto.versionEdicion);
  assert.notEqual(versionReserva({...h.reserva,idPropiedad:999}),dto.versionEdicion);
});

test('dos envíos simultáneos de la misma versión: uno espera y luego obtiene conflicto sin otro historial', {timeout:3000},async()=>{
  const version=versionReserva(h.reserva),entra=senal(),seguir=senal();
  h.hooks.evento=async tx=>{if(tx.id===1){entra.resolver();await seguir.promise;}};
  const primero=servicio.modificarReserva(1,{montoEstimado:200},version);await entra.promise;
  const segundo=servicio.modificarReserva(1,{montoEstimado:300},version);
  const rechazo=assert.rejects(segundo,esConflicto);seguir.resolver();await Promise.all([primero,rechazo]);
  assert.equal(h.reserva.montoEstimado,200);assert.equal(h.eventos.length,1);assert.equal(h.updates,1);
});

test('commit aplicado sin acuse: el reenvío explícito con versión anterior no duplica escritura ni historial',async()=>{
  const version=versionReserva(h.reserva);h.acusePerdido=true;
  await assert.rejects(servicio.modificarReserva(1,{montoEstimado:200},version),e=>e.codigo==='OPERACION_RESULTADO_INCIERTO');
  h.acusePerdido=false;
  await assert.rejects(servicio.modificarReserva(1,{montoEstimado:200},version),esConflicto);
  assert.equal(h.updates,1);assert.equal(h.eventos.length,1);
});
