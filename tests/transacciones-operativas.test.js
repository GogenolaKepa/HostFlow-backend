// Driver y almacenamiento ficticios. Prueba coordinación JS; NO acredita motor SQL.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const realSql = require('mssql');
let estado, falloEvento, falloCommit, bloqueo, commits, rollbacks, consultas;
const colas = new Map();
class Transaction {
  async begin() { this.pendiente = structuredClone(estado); }
  request() {
    const tx = this, args = {};
    return { input(k, _tipo, v) { args[k] = v; return this; }, async query(sql) {
      consultas.push(sql);
      if (sql.includes('sp_getapplock')) {
        const previa = colas.get(args.recurso) || Promise.resolve();
        let liberar; const turno = new Promise(r => { liberar = r; });
        colas.set(args.recurso, turno); await previa;
        tx.liberar = () => { liberar(); if (colas.get(args.recurso) === turno) colas.delete(args.recurso); };
        tx.pendiente = structuredClone(estado);
        return { recordset: [{ bloqueo }] };
      }
      if (sql.includes('UPDATE dbo.Reservas')) {
        const filas = tx.pendiente.reserva.estado === 'Confirmada' ? [{ idReserva: 1 }] : [];
        if (filas.length) tx.pendiente.reserva.estado = 'Finalizada';
        return { recordset: filas };
      }
      if (sql.includes('INSERT INTO dbo.ReservaEventos')) {
        if (falloEvento) throw Error('Fallo ficticio del timeline');
        tx.pendiente.eventos.push(args.tipo);
        return { recordset: [{ idEventoReserva: 1, idReserva: 1, tipo: args.tipo }] };
      }
      if (sql.includes('FROM dbo.Reservas r')) return { recordset: [tx.pendiente.reserva] };
      if (sql.includes('INSERT INTO dbo.TareasLimpieza')) return { recordset: [{ creadas: 1, actualizadas: 0, canceladas: 0 }] };
      if (sql.includes('UPDATE dbo.TareasLimpieza')) return { rowsAffected: [0] };
      throw Error('SQL no previsto en la fixture');
    } };
  }
  async commit() { estado = this.pendiente; commits++; this.liberar?.(); if (falloCommit) throw Error('Acuse de commit ficticio perdido'); }
  async rollback() { rollbacks++; this.liberar?.(); }
}
const db = require.resolve('../src/config/database');
require.cache[db] = { id: db, filename: db, loaded: true, exports: { sql: { ...realSql, Transaction },
  poolPromise: Promise.resolve({ request() { throw Error('Consulta fuera de transacción prohibida'); } }) } };
const reservas = require('../src/repositories/ReservaRepository');
const limpiezas = require('../src/repositories/LimpiezaRepository');
const alertas = require('../src/repositories/AlertaRepository');
beforeEach(() => {
  estado = { reserva: { idReserva: 1, estado: 'Confirmada', canal: 'Manual', fechaEgreso: '2000-01-01' }, eventos: [] };
  falloEvento = false; falloCommit = false; bloqueo = 0; commits = 0; rollbacks = 0; consultas = [];
});
test('finalización explícita y timeline usan la misma transacción; repetición no duplica eventos', async () => {
  const uno = await reservas.finalizarConEventos('2028-01-01');
  assert.equal(uno.cantidadFinalizadas, 1); assert.equal(estado.reserva.estado, 'Finalizada');
  assert.deepEqual(estado.eventos, ['RESERVA_FINALIZADA']);
  assert.equal((await reservas.finalizarConEventos('2028-01-01')).cantidadFinalizadas, 0);
  assert.equal(estado.eventos.length, 1); assert.equal(commits, 2);
});
test('fallo del timeline revierte también el cambio de estado y permite reintento explícito', async () => {
  falloEvento = true; await assert.rejects(reservas.finalizarConEventos('2028-01-01'), /ficticio/);
  assert.equal(estado.reserva.estado, 'Confirmada'); assert.deepEqual(estado.eventos, []);
  assert.equal(commits, 0); assert.equal(rollbacks, 1);
  falloEvento = false; await reservas.finalizarConEventos('2028-01-01'); assert.equal(estado.eventos.length, 1);
});
test('bloqueo rechazado no actualiza ni confirma; dos comandos serializados no duplican timeline', async () => {
  bloqueo = -1; await assert.rejects(reservas.finalizarConEventos('2028-01-01'), /ocupada/);
  assert.equal(consultas.length, 1); assert.equal(commits, 0); assert.equal(rollbacks, 1);
  bloqueo = 0; await Promise.all([reservas.finalizarConEventos('2028-01-01'), reservas.finalizarConEventos('2028-01-01')]);
  assert.equal(estado.eventos.length, 1);
});
test('acuse de commit incierto obliga a recargar y no reintenta ni comunica éxito', async () => {
  falloCommit = true; await assert.rejects(reservas.finalizarConEventos('2028-01-01'), /Recargá/);
  assert.equal(commits, 1); assert.equal(estado.eventos.length, 1);
});
test('sincronización de limpiezas es transaccional y evita UPDATE de candidatas sin cambios', async () => {
  const resultado = await limpiezas.sincronizar('2028-01-01', '2029-01-01');
  assert.equal(resultado.creadas, 1); assert.equal(commits, 1);
  const consulta = consultas.find(s => s.includes('INSERT INTO dbo.TareasLimpieza'));
  assert.match(consulta, /EXCEPT SELECT candidata/); assert.match(consulta, /tarea.Estado <> N'Completada'/);
});
test('actualización de limpieza cancelada concurrentemente revierte, sin falso éxito', async () => {
  await assert.rejects(limpiezas.cambiarEstado(1, 'Completada'), /cancelada/);
  assert.equal(commits, 0); assert.equal(rollbacks, 1);
  assert.match(consultas.at(-1), /AND Estado <> N'Cancelada'/);
});
test('reconciliación de alertas comparte contexto y revierte el lote ante un fallo', async () => {
  await assert.rejects(alertas.conSincronizacion(async repo => {
    assert.ok(repo.conexion instanceof Transaction);
    repo.conexion.pendiente.eventos.push('solo-fixture'); throw Error('Lote ficticio fallido');
  }), /ficticio/);
  assert.equal(commits, 0); assert.equal(rollbacks, 1); assert.deepEqual(estado.eventos, []);
});
test('fuentes de alertas se leen secuencialmente, compatibles con una única conexión mssql transaccional', async () => {
  let activa = false, cantidad = 0;
  const leer = async () => {
    assert.equal(activa, false, 'No puede haber otro Request en progreso');
    activa = true; cantidad++; await new Promise(resolve => setImmediate(resolve)); activa = false;
    return [];
  };
  const resultado = await require('../src/services/AlertaService').construirAlertasOperativas({
    obtenerIncidenciasAlertables: leer, obtenerSincronizacionesConError: leer,
    obtenerCheckinsProximos: leer, obtenerConflictosActivos: leer,
  });
  assert.deepEqual(resultado, []); assert.equal(cantidad, 4);
});
test('inspección futura está bloqueada y contiene solo lectura de metadatos', () => {
  const fs = require('node:fs'), path = require('node:path');
  const texto = fs.readFileSync(path.join(__dirname,'../sql/proposals/normalizacion_operativa/00_inspeccion_previa_bloqueada.sql'),'utf8');
  assert.match(texto, /@AutorizarLectura bit = 0/); assert.match(texto, /@ServidorEsperado sysname = NULL/);
  assert.match(texto, /VIEW DEFINITION/); assert.match(texto, /EngineEdition/);
  const codigo = texto.replace(/'(?:[^']|'')*'|--[^\r\n]*/g,' ');
  assert.doesNotMatch(codigo, /\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|GRANT|REVOKE|DENY|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(texto, /FROM\s+dbo\./i);
});
