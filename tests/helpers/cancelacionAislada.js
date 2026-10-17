// Modelo en memoria del driver. No abre conexiones ni reproduce el motor SQL.
const assert = require('node:assert/strict');
const sql = require('mssql');

function prepararCancelacionAislada() {
  const h = {};
  const copiar = valor => structuredClone(valor);
  const filas = tx => tx && Object.hasOwn(tx, 'pendiente') ? tx.pendiente : h.reserva;
  async function bloquear(tx, recurso) {
    if (tx.recursos.has(recurso)) return;
    const anterior = h.colas.get(recurso) || Promise.resolve();
    let liberar;
    const turno = new Promise(resolve => { liberar = resolve; });
    h.colas.set(recurso, turno);
    await anterior;
    tx.recursos.add(recurso);
    tx.liberaciones.push(() => {
      liberar();
      if (h.colas.get(recurso) === turno) h.colas.delete(recurso);
    });
  }
  async function paso(nombre, tx, args) {
    if (h.hooks[nombre]) await h.hooks[nombre](tx, args);
    if (h.fallos[nombre]) throw h.fallos[nombre];
  }
  function request(tx) {
    if (!tx) {
      h.poolRequests++;
      assert.ok(h.permitirPool, 'Escape al pool durante cancelación');
    }
    const args = {};
    return {
      input(nombre, _tipo, valor) { args[nombre] = valor; return this; },
      async query(texto) {
        if (tx) { assert.equal(tx.ocupada, false, 'Requests simultáneos en una transacción'); tx.ocupada = true; }
        h.consultas.push({ tx: tx?.id || null, texto, args: { ...args } });
        try {
          if (texto.includes('sp_getapplock')) {
            await paso('applock', tx, args);
            if (h.resultadoLock < 0) return { recordset: [{ bloqueo: h.resultadoLock }] };
            await bloquear(tx, args.recurso);
            return { recordset: [{ bloqueo: 0 }] };
          }
          if (texto.includes('SELECT IdReserva FROM dbo.Reservas WITH')) {
            assert.ok(tx);
            await paso('bloqueoFila', tx, args);
            await bloquear(tx, 'fila:1');
            return { recordset: h.reserva ? [{ IdReserva: 1 }] : [] };
          }
          if (texto.includes('IdEstadoReserva AS idEstadoReserva')) {
            await paso('control', tx, args);
            const actual = filas(tx);
            return { recordset: actual ? [{ idReserva: actual.idReserva, idEstadoReserva: h.idEstado(actual.estado) }] : [] };
          }
          if (texto.includes('SELECT COUNT')) return { recordset: [{ cantidad: h.conflicto ? 1 : 0 }] };
          if (texto.includes('UPDATE dbo.Reservas')) {
            const cancelacion = texto.includes('DECLARE @IdEstadoCancelada');
            const condicionada = texto.includes('@Actualizadas');
            const finalizacion = !condicionada && /OUTPUT\s+INSERTED\.IdReserva\b/.test(texto);
            await paso(cancelacion ? 'update' : finalizacion ? 'finalizar' : 'editar', tx, args);
            const propietario = tx || { recursos: new Set(), liberaciones: [] };
            await bloquear(propietario, 'fila:1');
            try {
              const actual = filas(tx);
              if (finalizacion && (!actual || actual.estado !== 'Confirmada' || actual.fechaEgreso >= args.fechaActual)) return { recordset: [] };
              if (condicionada && (!actual || actual.idReserva !== args.idReserva || actual.canal !== 'Manual'
                || h.idEstado(actual.estado) !== args.idEstadoEsperado || ['Cancelada', 'Finalizada'].includes(actual.estado))) return { recordset: [] };
              if (h.sinUpdate || !actual) return { recordset: [], rowsAffected: [0] };
              const nueva = { ...actual, ...(cancelacion ? { estado: 'Cancelada' } : finalizacion ? { estado: 'Finalizada' }
                : { fechaIngreso: args.fechaIngreso, fechaEgreso: args.fechaEgreso, horaIngreso: args.horaIngreso,
                  horaEgreso: args.horaEgreso, montoEstimado: args.montoEstimado, estado: args.estado }) };
              if (tx) tx.pendiente = nueva; else h.reserva = nueva;
              if (tx && condicionada) tx.edicion = true;
              h.updates++;
              return { recordset: finalizacion || condicionada ? (h.salidaUpdate || [{ idReserva: 1 }]) : [], rowsAffected: condicionada ? [] : [1] };
            } finally { if (!tx) propietario.liberaciones.forEach(liberar => liberar()); }
          }
          if (texto.includes('INSERT INTO dbo.ReservaEventos')) {
            await paso('evento', tx, args);
            if (h.eventoSinResultado) return { recordset: [] };
            const evento = { idEventoReserva: 1, ...args };
            if (tx) tx.eventos.push(evento); else h.eventos.push(evento);
            return { recordset: [copiar(evento)] };
          }
          if (texto.includes('FROM dbo.Reservas r')) {
            if (tx) {
              tx.lecturas++;
              await paso(tx.lecturas === 3 || (tx.edicion && tx.lecturas === 2)
                ? 'lecturaFinal' : tx.lecturas === 2 ? 'lecturaPostUpdate' : 'lectura', tx, args);
            }
            const actual = filas(tx);
            return { recordset: actual ? [copiar(actual)] : [] };
          }
          assert.fail('SQL no previsto por la fixture');
        } finally { if (tx) tx.ocupada = false; }
      },
    };
  }
  const pool = { request: () => request(null) };
  class Transaction {
    constructor(origen) {
      assert.strictEqual(origen, pool);
      this.id = h.transacciones.length + 1;
      this.recursos = new Set(); this.liberaciones = []; this.eventos = []; this.lecturas = 0; this.ocupada = false;
      h.transacciones.push(this);
    }
    async begin() { h.inicios++; await paso('begin', this); }
    request() { return request(this); }
    async commit() {
      h.commits++;
      await paso('commitAntes', this);
      if (Object.hasOwn(this, 'pendiente')) h.reserva = copiar(this.pendiente);
      h.eventos.push(...copiar(this.eventos));
      h.confirmaciones.push({ reserva: copiar(h.reserva), eventos: copiar(h.eventos) });
      this.confirmada = true;
      this.liberaciones.forEach(liberar => liberar());
      if (h.acusePerdido) throw Error('Acuse ficticio perdido después del commit aplicado');
    }
    async rollback() {
      h.rollbacks++;
      if (this.confirmada) throw Error('El commit ya terminó: rollback no lo revierte');
      await paso('rollback', this);
      this.liberaciones.forEach(liberar => liberar());
    }
  }
  h.reset = () => {
    h.reserva = { idReserva: 1, idPropiedad: 7, idHuesped: 8, canal: 'Manual', estado: 'Confirmada',
      fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12', horaIngreso: '15:00', horaEgreso: '10:00',
      montoEstimado: 100, cantidadHuespedes: 2 };
    h.eventos = []; h.confirmaciones = []; h.fallos = {}; h.hooks = {}; h.colas = new Map(); h.transacciones = [];
    h.inicios = 0; h.commits = 0; h.rollbacks = 0; h.updates = 0; h.poolRequests = 0; h.consultas = [];
    h.permitirPool = false; h.acusePerdido = false; h.sinUpdate = false; h.eventoSinResultado = false; h.resultadoLock = 0;
    h.salidaUpdate = null;
    h.conflicto = false;
  };
  // IDs exclusivamente ficticios del catálogo simulado; no representan los de Azure.
  h.idEstado = estado => ({ Pendiente: 11, Confirmada: 12, Cancelada: 13, Finalizada: 14, 'No show': 15 })[estado];
  h.reset();
  const db = require.resolve('../../src/config/database');
  require.cache[db] = { id: db, filename: db, loaded: true, exports: { sql: { ...sql, Transaction }, poolPromise: Promise.resolve(pool) } };
  return h;
}

function senal() {
  let resolver;
  const promise = new Promise(resolve => { resolver = resolve; });
  return { promise, resolver };
}
module.exports = { prepararCancelacionAislada, senal };
