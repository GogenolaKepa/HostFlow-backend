// Repositorios reales, Requests ficticios: no dotenv, conexiones ni motor SQL.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sql = require('mssql');
let accesosPool, permitirPool, pool;
const db = require.resolve('../src/config/database');
require.cache[db] = { id: db, filename: db, loaded: true, exports: {
  sql,
  poolPromise: { then(resolve, reject) {
    accesosPool++;
    if (!permitirPool) return reject(Error('Escape al pool prohibido'));
    resolve(pool);
  } },
} };
const reservas = require('../src/repositories/ReservaRepository');
const eventos = require('../src/repositories/ReservaEventoRepository');

const huesped = { nombre: 'Persona', apellido: 'Ficticia', email: 'fixture@example.invalid',
  telefono: 'ficticio', documento: 'prueba', nacionalidad: 'Prueba', origenRegistro: 'Booking' };
const datos = { idPropiedad: '7', idHuesped: '8', canal: 'Booking', estado: 'Confirmada',
  fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12', horaIngreso: '15:00', horaEgreso: '10:00',
  cantidadHuespedes: '2', montoEstimado: '100.25', idExterno: 'fixture-externa' };
// Huellas del SQL ANTERIOR a fase 2E (LF). No se calculan del código a verificar.
const huellas = {
  obtenerHuespedPorNombreYApellido: '6e562a1bf113da9e554ae56bc50013832c433e0680db2007332a5030a11d87e3',
  crearHuespedExterno: '54818e812d2fe0ebc0dc5731327abd2fdf4886a09e5be8bb57c1608b56525d26',
  obtenerPorCanalEIdExterno: '6b460fe869302792d23350e3d44b3bdb6edfe517b80d97415f72357f780ad17d',
  crearReservaExterna: '20c0d464315f8aa21bf4d059558b73f23d42fc0250222865d140717f8607ba5f',
  obtenerPorId: '53b6a20fbba4d2211b1472cc60e6226edf5dedab5c2750e207a373e2cf9e9e71',
};
const casos = [
  ['obtenerPorCanalEIdExterno', ['Booking', datos.idExterno], 1,
    { canal: 'Booking', idExterno: datos.idExterno }, { canal: sql.NVarChar(50), idExterno: sql.NVarChar(150) }],
  ['obtenerHuespedPorNombreYApellido', [huesped.nombre, huesped.apellido], 1,
    { nombre: huesped.nombre, apellido: huesped.apellido }, { nombre: sql.NVarChar(100), apellido: sql.NVarChar(100) }],
  ['crearHuespedExterno', [huesped], 1, huesped,
    { nombre: sql.NVarChar(100), apellido: sql.NVarChar(100), email: sql.NVarChar(150), telefono: sql.NVarChar(50),
      documento: sql.NVarChar(100), nacionalidad: sql.NVarChar(100), origenRegistro: sql.NVarChar(50) }],
  ['crearReservaExterna', [datos], 2,
    { ...datos, idPropiedad: 7, idHuesped: 8, cantidadHuespedes: 2, montoEstimado: 100.25 },
    { idPropiedad: sql.Int, idHuesped: sql.Int, canal: sql.NVarChar(50), estado: sql.NVarChar(50),
      fechaIngreso: sql.Date, fechaEgreso: sql.Date, horaIngreso: sql.VarChar(5), horaEgreso: sql.VarChar(5),
      cantidadHuespedes: sql.Int, montoEstimado: sql.Decimal(18, 2), idExterno: sql.NVarChar(150) }],
];

function conexionFicticia(nombre = 'fixture', { fallarEn, error, vacio = false } = {}) {
  const consultas = [];
  let activa = false;
  const conexion = Object.freeze({
    begin() { assert.fail('La fachada no abre transacciones'); },
    commit() { assert.fail('La fachada no confirma'); },
    rollback() { assert.fail('La fachada no revierte'); },
    request() {
      const parametros = {}, tipos = {};
      return {
        input(k, tipo, valor) { parametros[k] = valor; tipos[k] = tipo; return this; },
        async query(texto) {
          assert.equal(activa, false, 'Requests secuenciales en la misma conexión');
          activa = true;
          consultas.push({ texto, parametros, tipos });
          try {
            await new Promise(resolve => setImmediate(resolve));
            if (consultas.length === fallarEn) throw error;
            if (/INSERT INTO dbo.ReservaEventos/.test(texto)) return { recordset: [{ idEventoReserva: 1,
              idReserva: parametros.idReserva, tipo: parametros.tipo, origen: parametros.origen,
              titulo: parametros.titulo, datosJson: parametros.datosJson }] };
            if (/INSERT INTO dbo.Reservas/.test(texto)) return { recordset: [{ IdReserva: 41 }] };
            if (/INSERT INTO dbo.Huespedes/.test(texto)) return { recordset: vacio ? [] : [{ idHuesped: 8, ...parametros }] };
            if (/FROM dbo.Huespedes/.test(texto)) return { recordset: vacio ? [] : [{ idHuesped: 8, ...huesped }] };
            if (/SELECT COUNT/.test(texto)) return { recordset: [{ cantidad: 1 }] };
            if (/FROM dbo.Propiedades/.test(texto)) return { recordset: [{ idPropiedad: 7, capacidadMaxima: 4 }] };
            if (/FROM dbo.Reservas r/.test(texto)) return { recordset: vacio ? [] : [{ idReserva: parametros.idReserva || 41,
              canal: parametros.canal || 'Booking', idExterno: parametros.idExterno || datos.idExterno, fixture: nombre }] };
            assert.fail('Consulta no prevista por la prueba');
          } finally { activa = false; }
        },
      };
    },
  });
  return { conexion, consultas };
}

beforeEach(() => { accesosPool = 0; permitirPool = false; pool = conexionFicticia().conexion; });

for (const [nombre, args, cantidad, parametros, tipos] of casos) {
  test(`${nombre}: conexión explícita y compatibilidad histórica, SQL/tipos/parámetros intactos`, async () => {
    const tx = conexionFicticia();
    const resultado = await reservas[nombre](...args, tx.conexion);
    assert.equal(accesosPool, 0);
    assert.equal(tx.consultas.length, cantidad);
    assert.deepEqual(tx.consultas[0].parametros, parametros);
    assert.deepEqual(tx.consultas[0].tipos, tipos);
    const hash = texto => createHash('sha256').update(texto.replace(/\r\n/g, '\n')).digest('hex');
    assert.equal(hash(tx.consultas[0].texto), huellas[nombre]);
    if (cantidad === 2) {
      assert.equal(hash(tx.consultas[1].texto), huellas.obtenerPorId);
      assert.deepEqual(tx.consultas[1].parametros, { idReserva: 41 });
      assert.deepEqual(tx.consultas[1].tipos, { idReserva: sql.Int });
    }
    permitirPool = true;
    for (const extra of [[], [null], [undefined]]) {
      const legacy = conexionFicticia(); pool = legacy.conexion;
      const antes = accesosPool;
      assert.deepEqual(await reservas[nombre](...args, ...extra), resultado);
      assert.deepEqual(legacy.consultas, tx.consultas);
      assert.equal(accesosPool - antes, cantidad);
    }
  });

  test(`${nombre}: fallo de cada consulta se propaga sin pool, continuación ni reintento`, async () => {
    const error = Object.assign(Error('Fallo ficticio'), { code: 'ETIMEOUT' });
    for (let fallarEn = 1; fallarEn <= cantidad; fallarEn++) {
      for (const fachada of [false, true]) {
        const tx = conexionFicticia('fixture', { fallarEn, error });
        await assert.rejects(fachada ? reservas.conContextoTransaccional(tx.conexion)[nombre](...args)
          : reservas[nombre](...args, tx.conexion), e => e === error);
        assert.equal(tx.consultas.length, fallarEn);
      }
    }
    assert.equal(accesosPool, 0);
  });
}

test('fachada prepara alta externa, dependencias y evento en la misma conexión, sin administrar transacción', async () => {
  const tx = conexionFicticia(); const contexto = reservas.conContextoTransaccional(tx.conexion);
  assert.ok(Object.isFrozen(contexto)); assert.strictEqual(contexto.conexion, tx.conexion);
  await contexto.obtenerPorCanalEIdExterno('Booking', datos.idExterno);
  await contexto.obtenerPropiedadPorId(7);
  await contexto.obtenerHuespedPorNombreYApellido(huesped.nombre, huesped.apellido);
  await contexto.crearHuespedExterno(huesped);
  assert.equal(await contexto.existeConflictoFechas(7, datos.fechaIngreso, datos.fechaEgreso), true);
  // Infraestructura: no decide rechazar el conflicto ni transforma el canal en Manual.
  const creada = await contexto.crearReservaExterna(datos);
  const evento = await eventos.crearEvento({ idReserva: creada.idReserva, tipo: 'RESERVA_RECIBIDA',
    titulo: 'Reserva ficticia', origen: datos.canal, datosJson: { conflictoDetectado: true } }, contexto.conexion);
  assert.equal(evento.idReserva, 41); assert.equal(evento.tipo, 'RESERVA_RECIBIDA');
  assert.deepEqual(evento.datosJson, { conflictoDetectado: true });
  assert.equal((await contexto.obtenerPorId(creada.idReserva)).idReserva, 41);
  assert.equal(tx.consultas.length, 9); assert.equal(accesosPool, 0);
  assert.ok(tx.consultas.every(c => !/sp_getapplock|BEGIN TRANSACTION|COMMIT|ROLLBACK/.test(c.texto)));
  assert.equal(Object.hasOwn(reservas, 'conexion'), false);
});

test('dos contextos intercalados conservan conexión, huésped y lecturas finales independientes', async () => {
  const a = conexionFicticia('A'), b = conexionFicticia('B');
  const ca = reservas.conContextoTransaccional(a.conexion), cb = reservas.conContextoTransaccional(b.conexion);
  const [uno, dos] = await Promise.all([
    (async () => { await ca.crearHuespedExterno(huesped); return ca.crearReservaExterna(datos); })(),
    (async () => { await cb.obtenerHuespedPorNombreYApellido('Otra', 'Persona'); return cb.crearReservaExterna({ ...datos, canal: 'Airbnb', idExterno: 'otra-fixture' }); })(),
  ]);
  assert.equal(uno.fixture, 'A'); assert.equal(dos.fixture, 'B');
  assert.equal(a.consultas.length, 3); assert.equal(b.consultas.length, 3);
  assert.deepEqual(a.consultas[0].parametros, huesped);
  assert.deepEqual(b.consultas[0].parametros, { nombre: 'Otra', apellido: 'Persona' });
  assert.equal(a.consultas[1].parametros.canal, 'Booking');
  assert.equal(b.consultas[1].parametros.canal, 'Airbnb');
  assert.equal(b.consultas[1].parametros.idExterno, 'otra-fixture');
  assert.equal(accesosPool, 0); assert.equal(Object.hasOwn(reservas, 'conexion'), false);
});

test('canal e ID externo son parámetros independientes y se conserva su contenido literal', async () => {
  const tx = conexionFicticia(), contexto = reservas.conContextoTransaccional(tx.conexion);
  for (const canal of ['Booking', 'Airbnb']) {
    const idExterno = "fixture-' OR 1=1; --";
    const encontrada = await contexto.obtenerPorCanalEIdExterno(canal, idExterno);
    assert.equal(encontrada.canal, canal); assert.equal(encontrada.idExterno, idExterno);
    const consulta = tx.consultas.at(-1);
    assert.ok(consulta.texto.includes('cr.Nombre = @canal'));
    assert.ok(consulta.texto.includes('r.IdExterno = @idExterno'));
    assert.equal(consulta.texto.includes(idExterno), false);
    await contexto.crearReservaExterna({ ...datos, canal, idExterno });
    assert.equal(tx.consultas.at(-2).parametros.canal, canal);
    assert.equal(tx.consultas.at(-2).parametros.idExterno, idExterno);
  }
  assert.equal(accesosPool, 0);
});

test('valores opcionales de huésped y reserva conservan defaults y conversiones anteriores', async () => {
  const tx = conexionFicticia(), contexto = reservas.conContextoTransaccional(tx.conexion);
  await contexto.crearHuespedExterno({ nombre: 'Persona', apellido: 'Prueba', origenRegistro: 'Airbnb' });
  assert.deepEqual(tx.consultas[0].parametros, { nombre: 'Persona', apellido: 'Prueba', origenRegistro: 'Airbnb',
    email: null, telefono: null, documento: null, nacionalidad: null });
  const minimos = { idPropiedad: '7', idHuesped: '8', canal: 'Booking',
    fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12', idExterno: 'fixture-externa' };
  await contexto.crearReservaExterna(minimos);
  assert.deepEqual(tx.consultas[1].parametros, { ...minimos, idPropiedad: 7, idHuesped: 8, estado: 'Confirmada',
    horaIngreso: '00:00', horaEgreso: '00:00', cantidadHuespedes: 1, montoEstimado: 0 });
  assert.ok(tx.consultas[1].texto.includes("N'Sincronizada'")); assert.equal(accesosPool, 0);
});

test('conexiones inválidas se rechazan sin fallback', async () => {
  for (const invalida of [false, 0, '', {}, { request: true }]) {
    assert.throws(() => reservas.conContextoTransaccional(invalida), /contexto transaccional/);
    for (const [nombre, args] of casos) await assert.rejects(reservas[nombre](...args, invalida), /contexto transaccional/);
  }
  assert.equal(accesosPool, 0);
});

test('lecturas vacías y salidas ausentes mantienen contratos, sin reintentos ni éxito inventado', async () => {
  const tx = conexionFicticia('fixture', { vacio: true });
  const contexto = reservas.conContextoTransaccional(tx.conexion);
  assert.equal(await contexto.obtenerPorCanalEIdExterno('Booking', 'ausente'), null);
  assert.equal(await contexto.obtenerHuespedPorNombreYApellido('Persona', 'Ausente'), null);
  assert.equal(await contexto.crearHuespedExterno(huesped), undefined);
  assert.equal(await contexto.crearReservaExterna(datos), null);
  assert.equal(tx.consultas.length, 5); assert.equal(accesosPool, 0);
});

test('errores legacy de pool y consultas posteriores siguen propagándose sin reintento', async () => {
  for (const [nombre, args, cantidad] of casos) {
    await assert.rejects(reservas[nombre](...args), /Escape al pool prohibido/);
    permitirPool = true;
    const error = Error('Fallo ficticio del pool');
    for (let fallarEn = 1; fallarEn <= cantidad; fallarEn++) {
      const legacy = conexionFicticia('fixture', { fallarEn, error }); pool = legacy.conexion;
      const antes = accesosPool;
      await assert.rejects(reservas[nombre](...args), e => e === error);
      assert.equal(legacy.consultas.length, fallarEn); assert.equal(accesosPool - antes, fallarEn);
    }
    permitirPool = false;
  }
});
