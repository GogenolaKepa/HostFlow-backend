// Repositorios reales y Requests ficticios: sin dotenv, conexión ni motor SQL.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
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

const datos = { idPropiedad: 7, idHuesped: 8, fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12',
  horaIngreso: '15:00', horaEgreso: '10:00', cantidadHuespedes: 2, montoEstimado: 100, estado: 'Confirmada' };
const casos = [
  ['obtenerPorId', [41], 1],
  ['obtenerPropiedadPorId', [7], 1],
  ['obtenerHuespedPorId', [8], 1],
  ['existeConflictoFechas', [7, datos.fechaIngreso, datos.fechaEgreso, 41], 1],
  ['crearReservaManual', [datos], 2],
  ['actualizarReservaManual', [41, datos], 2],
  ['cancelarReservaManual', [41], 2],
];

function conexionFicticia(nombre = 'tx', { fallarEn, error, vacio = false, cantidad = 0 } = {}) {
  const consultas = [];
  let activa = false;
  const conexion = Object.freeze({
    begin() { assert.fail('El contexto no debe abrir transacciones'); },
    commit() { assert.fail('El contexto no debe confirmar transacciones'); },
    rollback() { assert.fail('El contexto no debe revertir transacciones'); },
    request() {
      const parametros = {}, tipos = {};
      return {
        input(k, tipo, valor) { parametros[k] = valor; tipos[k] = tipo; return this; },
        async query(texto) {
          assert.equal(activa, false, 'No puede haber dos Requests simultáneos en esta conexión');
          activa = true;
          consultas.push({ texto, parametros, tipos });
          try {
            await new Promise(resolve => setImmediate(resolve));
            if (consultas.length === fallarEn) throw error;
            if (/INSERT INTO dbo.ReservaEventos/.test(texto)) return { recordset: [{
              idEventoReserva: 1, idReserva: parametros.idReserva, tipo: parametros.tipo,
              origen: parametros.origen, titulo: parametros.titulo, datosJson: parametros.datosJson,
            }] };
            if (/INSERT INTO dbo.Reservas/.test(texto)) return { recordset: [{ idReserva: 41 }] };
            if (/UPDATE dbo.Reservas/.test(texto)) return { rowsAffected: [1] };
            if (/SELECT COUNT/.test(texto)) return { recordset: [{ cantidad }] };
            if (/FROM dbo.Reservas r/.test(texto)) return { recordset: vacio ? [] : [{ idReserva: parametros.idReserva, estado: 'Confirmada', nombreFixture: nombre }] };
            if (/FROM dbo.Propiedades/.test(texto)) return { recordset: vacio ? [] : [{ idPropiedad: parametros.idPropiedad, estado: 'Activa', capacidadMaxima: 4 }] };
            if (/FROM dbo.Huespedes/.test(texto)) return { recordset: vacio ? [] : [{ idHuesped: parametros.idHuesped }] };
            assert.fail('Consulta no prevista por la prueba');
          } finally { activa = false; }
        },
      };
    },
  });
  return { conexion, consultas };
}

beforeEach(() => { accesosPool = 0; permitirPool = false; pool = conexionFicticia('pool').conexion; });

for (const [nombre, args, cantidad] of casos) {
  test(`${nombre}: contexto explícito, consultas internas secuenciales y compatibilidad sin contexto`, async () => {
    const tx = conexionFicticia();
    const directo = await reservas[nombre](...args, tx.conexion);
    assert.equal(accesosPool, 0);
    assert.equal(tx.consultas.length, cantidad);
    const esperado = structuredClone(directo);
    if (esperado?.nombreFixture) esperado.nombreFixture = 'pool';
    // Se conserva SQL, tipos, parámetros y resultado con firma histórica, null y undefined.
    permitirPool = true;
    for (const extra of [[], [null], [undefined]]) {
      const anterior = conexionFicticia('pool');
      pool = anterior.conexion;
      const accesos = accesosPool;
      assert.deepEqual(await reservas[nombre](...args, ...extra), esperado);
      assert.deepEqual(anterior.consultas, tx.consultas);
      assert.equal(accesosPool - accesos, cantidad);
    }
  });
}

test('fachada: dependencias, conflictos, escrituras, DTO e historial comparten conexión sin iniciar ni confirmar', async () => {
  const tx = conexionFicticia();
  const contexto = reservas.conContextoTransaccional(tx.conexion);
  assert.ok(Object.isFrozen(contexto));
  assert.strictEqual(contexto.conexion, tx.conexion);
  for (const [nombre, args, cantidad] of casos) {
    const antes = tx.consultas.length;
    await contexto[nombre](...args);
    assert.equal(tx.consultas.length - antes, cantidad);
  }
  const evento = await eventos.crearEvento({ idReserva: 41, tipo: 'RESERVA_CANCELADA',
    titulo: 'Fixture de infraestructura', origen: 'Manual', datosJson: { estadoNuevo: 'Cancelada' } }, contexto.conexion);
  assert.equal(evento.idReserva, 41);
  assert.deepEqual(evento.datosJson, { estadoNuevo: 'Cancelada' });
  assert.equal(accesosPool, 0);
  assert.equal(Object.hasOwn(reservas, 'conexion'), false);
  assert.ok(tx.consultas.every(c => !/sp_getapplock|BEGIN TRANSACTION|COMMIT|ROLLBACK/.test(c.texto)));
});

test('conflicto sin ID ignorado no confunde la conexión con un parámetro del SQL', async () => {
  const tx = conexionFicticia('tx', { cantidad: 1 });
  const contexto = reservas.conContextoTransaccional(tx.conexion);
  assert.equal(await contexto.existeConflictoFechas(7, datos.fechaIngreso, datos.fechaEgreso), true);
  assert.equal(Object.hasOwn(tx.consultas[0].parametros, 'idReservaIgnorada'), false);
  assert.equal(await contexto.existeConflictoFechas(7, datos.fechaIngreso, datos.fechaEgreso, 41), true);
  assert.equal(tx.consultas[1].parametros.idReservaIgnorada, 41);
  assert.equal(accesosPool, 0);
});

test('errores de cada consulta, incluidas las lecturas posteriores al DML, se propagan sin escapar ni continuar', async () => {
  const error = new Error('Fallo ficticio de Request');
  for (const [nombre, args, cantidad] of casos) {
    for (let fallarEn = 1; fallarEn <= cantidad; fallarEn++) {
      for (const fachada of [false, true]) {
        const tx = conexionFicticia('tx', { fallarEn, error });
        const operacion = fachada ? reservas.conContextoTransaccional(tx.conexion)[nombre](...args)
          : reservas[nombre](...args, tx.conexion);
        await assert.rejects(operacion, e => e === error);
        assert.equal(tx.consultas.length, fallarEn, `${nombre} no debe continuar tras el fallo`);
      }
    }
  }
  const tx = conexionFicticia('tx', { fallarEn: 1, error });
  await assert.rejects(eventos.crearEvento({ idReserva: 41, tipo: 'RESERVA_CANCELADA', titulo: 'Fixture' }, tx.conexion), e => e === error);
  assert.equal(accesosPool, 0);
});

test('un contexto inválido se rechaza sin fallback al pool', async () => {
  for (const invalido of [false, 0, '', {}, { request: true }]) {
    assert.throws(() => reservas.conContextoTransaccional(invalido), /contexto transaccional/);
    for (const [nombre, args] of casos) await assert.rejects(reservas[nombre](...args, invalido), /contexto transaccional/);
  }
  for (const ausente of [null, undefined]) assert.throws(() => reservas.conContextoTransaccional(ausente), /contexto transaccional/);
  assert.equal(accesosPool, 0);
});

test('sin contexto, los errores del pool y de la lectura posterior siguen propagándose sin reintentos', async () => {
  permitirPool = true;
  const error = new Error('Fallo ficticio del pool');
  for (const [nombre, args, cantidad] of casos) {
    for (let fallarEn = 1; fallarEn <= cantidad; fallarEn++) {
      const anterior = conexionFicticia('pool', { fallarEn, error });
      pool = anterior.conexion;
      const accesos = accesosPool;
      await assert.rejects(reservas[nombre](...args), e => e === error);
      assert.equal(accesosPool - accesos, fallarEn);
      assert.equal(anterior.consultas.length, fallarEn);
    }
  }
});

test('contextos intercalados conservan su conexión sin contaminar el singleton', async () => {
  const a = conexionFicticia('A'), b = conexionFicticia('B');
  const ca = reservas.conContextoTransaccional(a.conexion), cb = reservas.conContextoTransaccional(b.conexion);
  const [uno, dos] = await Promise.all([ca.crearReservaManual(datos), cb.cancelarReservaManual(42)]);
  assert.equal(uno.nombreFixture, 'A'); assert.equal(dos.nombreFixture, 'B');
  assert.equal(uno.idReserva, 41); assert.equal(dos.idReserva, 42);
  assert.equal(a.consultas.length, 2); assert.equal(b.consultas.length, 2);
  assert.equal(Object.hasOwn(reservas, 'conexion'), false); assert.equal(accesosPool, 0);
});

test('lecturas vacías y conflicto falso conservan sus contratos con y sin contexto', async () => {
  const tx = conexionFicticia('tx', { vacio: true });
  permitirPool = true; pool = tx.conexion;
  for (const repo of [reservas, reservas.conContextoTransaccional(tx.conexion)]) {
    assert.equal(await repo.obtenerPorId(41), null);
    assert.equal(await repo.obtenerPropiedadPorId(7), null);
    assert.equal(await repo.obtenerHuespedPorId(8), null);
    assert.equal(await repo.existeConflictoFechas(7, datos.fechaIngreso, datos.fechaEgreso), false);
  }
});
