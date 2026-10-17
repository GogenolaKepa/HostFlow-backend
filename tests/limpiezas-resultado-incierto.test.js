// HTTP/JWT/controlador/servicio/helper reales. Driver y filas ficticias, sin SQL real.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const anterior = { JWT_SECRET: process.env.JWT_SECRET, HOSTFLOW_AUTH_SOURCE: process.env.HOSTFLOW_AUTH_SOURCE };
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.HOSTFLOW_AUTH_SOURCE = 'mock';
let estado, modo, consultas, commits, rollbacks, updates;
const detallePrivado = 'Detalle ficticio reservado del driver';

function request(tx) {
  const parametros = {};
  return {
    input(k, _tipo, valor) { parametros[k] = valor; return this; },
    async query(texto) {
      consultas++;
      if (/sp_getapplock/.test(texto)) return { recordset: [{ bloqueo: 0 }] };
      if (/UPDATE dbo.TareasLimpieza/.test(texto)) {
        assert.ok(tx, 'El UPDATE debe seguir siendo transaccional');
        if (modo === 'driver') throw Object.assign(Error(detallePrivado), { code: 'EREQUEST' });
        if (modo === 'desconocido') throw Object.assign(Error(detallePrivado), { codigo: 'CODIGO_NO_PUBLICO' });
        updates++; tx.pendiente = parametros.estado;
        return { rowsAffected: [1] };
      }
      if (/FROM dbo.TareasLimpieza/.test(texto)) return { recordset: [{ idTareaLimpieza: 1, estado: tx ? tx.pendiente : estado }] };
      assert.fail('Consulta ajena al PATCH de limpieza');
    },
  };
}
class Transaction {
  async begin() { this.pendiente = estado; }
  request() { return request(this); }
  async commit() { commits++; estado = this.pendiente; if (modo === 'incierto') throw Error(detallePrivado); }
  async rollback() { rollbacks++; }
}
const db = require.resolve('../src/config/database');
require.cache[db] = { id: db, filename: db, loaded: true, exports: {
  sql: { ...sql, Transaction }, poolPromise: Promise.resolve({ request: () => request() }),
} };
const { usuarios } = require('../src/data/mockData');
const cuentas = ['Administrador', 'Operador'].map((nombre, i) => ({ idUsuario: 970001 + i,
  nombre: 'Cuenta ficticia', email: `fixture-${i}@example.invalid`, estado: 'Activo', rol: { nombre } }));
usuarios.push(...cuentas);
const app = require('../src/app');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { estado = 'Pendiente'; modo = 'incierto'; consultas = 0; commits = 0; rollbacks = 0; updates = 0; });
after(async () => {
  await new Promise(resolve => server.close(resolve));
  for (const cuenta of cuentas) usuarios.splice(usuarios.indexOf(cuenta), 1);
  for (const [k, v] of Object.entries(anterior)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
async function cambiar(cuenta = cuentas[0], nuevoEstado = 'Completada', id = '1') {
  const headers = { 'Content-Type': 'application/json' };
  if (cuenta) headers.Authorization = `Bearer ${jwt.sign({ idUsuario: cuenta.idUsuario, email: cuenta.email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' })}`;
  const response = await fetch(`${base}/api/limpiezas/${id}/estado`, { method: 'PATCH', headers, body: JSON.stringify({ estado: nuevoEstado }) });
  return { response, data: await response.json() };
}

for (const cuenta of cuentas) {
  test(`PATCH ${cuenta.rol.nombre}: acuse de commit perdido conserva código, exige recargar y no reintenta`, async () => {
    const { response, data } = await cambiar(cuenta);
    assert.equal(response.status, 500);
    assert.deepEqual(data, { codigo: 'OPERACION_RESULTADO_INCIERTO',
      mensaje: 'No se pudo confirmar el resultado del guardado. Recargá los datos antes de reintentar.' });
    assert.equal(Object.hasOwn(data, 'tarea'), false);
    assert.equal(response.headers.has('Retry-After'), false);
    assert.equal(JSON.stringify(data).includes(detallePrivado), false);
    assert.doesNotMatch(data.mensaje, /correctamente|éxito|automátic/i);
    assert.equal(estado, 'Completada', 'Fixture: commit aplicado, acuse perdido; rollback no prueba ausencia de guardado');
    assert.equal(updates, 1); assert.equal(commits, 1); assert.equal(rollbacks, 1); assert.equal(consultas, 4);
  });
}

test('fallo interno o del driver conserva sanitización y no publica códigos no reconocidos', async () => {
  for (const fallo of ['desconocido', 'driver']) {
    modo = fallo;
    const { response, data } = await cambiar();
    // El controlador ya devuelve 500; respuestasSeguras solo convierte 4xx del driver en 503.
    assert.equal(response.status, 500);
    assert.deepEqual(data, { codigo: 'ERROR_INTERNO', mensaje: 'No se pudo completar la operación. Reintente más tarde.' });
    assert.equal(JSON.stringify(data).includes(detallePrivado), false);
  }
  assert.equal(commits, 0); assert.equal(updates, 0); assert.equal(rollbacks, 2);
});

test('validación, cancelación derivada y 401 se mantienen sin escritura', async () => {
  assert.equal((await cambiar(null)).response.status, 401);
  assert.equal(consultas, 0);
  assert.equal((await cambiar(cuentas[0], 'Completada', 'NaN')).response.status, 400);
  assert.equal(consultas, 0);
  const invalido = await cambiar(cuentas[0], 'Estado inexistente');
  assert.equal(invalido.response.status, 400);
  assert.deepEqual(invalido.data, { mensaje: 'El estado de la tarea de limpieza no es válido.' });
  assert.equal(consultas, 0);
  estado = 'Cancelada';
  assert.equal((await cambiar()).response.status, 400);
  assert.equal(updates, 0); assert.equal(commits, 0);
});

test('PATCH válido conserva éxito y contrato existente en ambos roles', async () => {
  modo = 'correcto';
  for (const cuenta of cuentas) {
    estado = 'Pendiente';
    const { response, data } = await cambiar(cuenta);
    assert.equal(response.status, 200);
    assert.deepEqual(data, { mensaje: 'Estado de la tarea de limpieza actualizado correctamente.',
      tarea: { idTareaLimpieza: 1, estado: 'Completada' } });
  }
  assert.equal(updates, 2); assert.equal(commits, 2); assert.equal(rollbacks, 0);
});
