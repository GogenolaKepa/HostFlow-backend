// Driver Booking/manual ficticio: cambios pendientes, huéspedes, historial y locks.
// Fixture independiente: no cambia el modelo manual anterior ni conecta SQL Server.
const assert = require('node:assert/strict');
const sql = require('mssql');

function prepararBookingAislado() {
  const h = {}, copiar = valor => structuredClone(valor);
  const actual = (tx, id) => tx?.cambios.has(Number(id)) ? tx.cambios.get(Number(id)) : h.filas.get(Number(id));
  const vista = tx => new Map([...h.filas, ...(tx ? tx.cambios : [])]);
  const huespedes = tx => new Map([...h.huespedes, ...(tx ? tx.huespedes : [])]);
  async function paso(nombre, tx, args) {
    if (h.hooks[nombre]) await h.hooks[nombre](tx, args);
    if (h.fallos[nombre]) throw h.fallos[nombre];
  }
  async function bloquear(tx, recurso) {
    if (tx.recursos.has(recurso)) return;
    const anterior = h.colas.get(recurso) || Promise.resolve();
    let liberar;
    const turno = new Promise(resolve => { liberar = resolve; });
    h.colas.set(recurso, turno); await anterior;
    tx.recursos.add(recurso);
    tx.liberaciones.push(() => { liberar(); if (h.colas.get(recurso) === turno) h.colas.delete(recurso); });
  }
  function request(tx) {
    const args = {}, tipos = {};
    return {
      input(k, tipo, valor) { args[k] = valor; tipos[k] = tipo; return this; },
      async query(texto) {
        assert.ok(tx, 'Consulta fuera de transacción');
        assert.equal(tx.confirmada, undefined, 'Consulta después de commit');
        assert.equal(tx.ocupada, false, 'Requests paralelos sobre la misma transacción');
        tx.ocupada = true; h.consultas.push({ tx: tx.id, texto, args: { ...args }, tipos });
        try {
          if (texto.includes('sp_getapplock')) {
            await paso('applock', tx, args);
            if (h.resultadoLock < 0) return { recordset: [{ bloqueo: h.resultadoLock }] };
            await bloquear(tx, args.recurso); return { recordset: [{ bloqueo: 0 }] };
          }
          if (texto.includes('SELECT IdReserva FROM dbo.Reservas WITH')) {
            await bloquear(tx, `fila:${args.idReserva}`);
            return { recordset: actual(tx, args.idReserva) ? [{ IdReserva: args.idReserva }] : [] };
          }
          if (texto.includes('IdEstadoReserva AS idEstadoReserva')) {
            const fila = actual(tx, args.idReserva);
            return { recordset: fila ? [{ idReserva: fila.idReserva, idEstadoReserva: h.idEstado(fila.estado) }] : [] };
          }
          if (/FROM dbo.Propiedades p/.test(texto)) {
            await paso('propiedad', tx, args);
            const fila = h.propiedades.get(args.idPropiedad); return { recordset: fila ? [copiar(fila)] : [] };
          }
          if (/FROM dbo.Huespedes\b/.test(texto)) {
            const porNombre = Object.hasOwn(args, 'nombre');
            await paso(porNombre ? 'buscarHuesped' : 'huesped', tx, args);
            const fila = porNombre ? [...huespedes(tx).values()].sort((a, b) => a.idHuesped - b.idHuesped)
              .find(f => f.nombre === args.nombre && f.apellido === args.apellido) : huespedes(tx).get(args.idHuesped);
            return { recordset: fila ? [copiar(fila)] : [] };
          }
          if (/INSERT INTO dbo.Huespedes\b/.test(texto)) {
            await paso('crearHuesped', tx, args);
            const fila = { ...copiar(args), idHuesped: h.siguienteHuesped++ };
            tx.huespedes.set(fila.idHuesped, fila); h.insertsHuesped++;
            return { recordset: h.huespedSinResultado ? [] : [fila] };
          }
          if (texto.includes('SELECT COUNT')) {
            await paso('conflicto', tx, args);
            const cantidad = [...vista(tx).values()].filter(fila => fila.idPropiedad === args.idPropiedad
              && !['Cancelada', 'No show'].includes(fila.estado) && fila.idReserva !== args.idReservaIgnorada
              && args.fechaIngreso < fila.fechaEgreso && args.fechaEgreso > fila.fechaIngreso).length;
            return { recordset: [{ cantidad }] };
          }
          if (/INSERT INTO dbo.Reservas\b/.test(texto)) {
            await paso('insert', tx, args);
            const idReserva = h.siguienteId++;
            const externa = Object.hasOwn(args, 'canal');
            tx.cambios.set(idReserva, { ...copiar(args), idReserva, canal: externa ? args.canal : 'Manual',
              estado: externa ? args.estado : 'Confirmada', idExterno: externa ? args.idExterno : null,
              estadoSincronizacion: externa ? 'Sincronizada' : 'Solo HostFlow' });
            tx.creadas.add(idReserva); h.inserts++;
            return { recordset: externa ? [{ IdReserva: idReserva }] : [{ idReserva }] };
          }
          if (texto.includes('UPDATE dbo.Reservas')) {
            const cancelacion = texto.includes('DECLARE @IdEstadoCancelada'), edicion = texto.includes('@Actualizadas');
            await paso(cancelacion ? 'cancelar' : edicion ? 'editar' : 'finalizar', tx, args);
            if (!cancelacion && !edicion) {
              const ids = [];
              for (const fila of vista(tx).values()) if (fila.estado === 'Confirmada' && fila.fechaEgreso < args.fechaActual) {
                tx.cambios.set(fila.idReserva, { ...fila, estado: 'Finalizada' }); ids.push({ idReserva: fila.idReserva });
              }
              return { recordset: ids };
            }
            const fila = actual(tx, args.idReserva);
            if (!fila || (edicion && (h.idEstado(fila.estado) !== args.idEstadoEsperado || ['Cancelada', 'Finalizada'].includes(fila.estado)))) return { recordset: [], rowsAffected: [0] };
            tx.cambios.set(args.idReserva, { ...fila, ...(cancelacion ? { estado: 'Cancelada' } : {
              fechaIngreso: args.fechaIngreso, fechaEgreso: args.fechaEgreso, horaIngreso: args.horaIngreso,
              horaEgreso: args.horaEgreso, montoEstimado: args.montoEstimado, estado: args.estado,
            }) });
            tx.editadas.add(args.idReserva);
            return { recordset: edicion ? [{ idReserva: args.idReserva }] : [], rowsAffected: [1] };
          }
          if (texto.includes('INSERT INTO dbo.ReservaEventos')) {
            await paso('evento', tx, args);
            await paso(args.tipo, tx, args);
            if (h.eventoSinResultado === args.tipo) return { recordset: [] };
            const evento = { ...copiar(args), idEventoReserva: h.siguienteEvento++ };
            tx.eventos.push(evento);
            return { recordset: [{ ...evento, ...(h.eventoIncompatible === args.tipo ? { tipo: 'TIPO_INCOMPATIBLE' } : {}) }] };
          }
          if (texto.includes('FROM dbo.Reservas r')) {
            if (Object.hasOwn(args, 'canal')) {
              await paso('identidad', tx, args);
              const fila = [...vista(tx).values()].find(f => f.canal === args.canal && f.idExterno === args.idExterno);
              return { recordset: fila ? [copiar(fila)] : [] };
            }
            const n = (tx.lecturas.get(args.idReserva) || 0) + 1; tx.lecturas.set(args.idReserva, n);
            const creada = tx.creadas.has(args.idReserva);
            await paso(creada ? (n === 1 ? 'lecturaPostInsert' : 'lecturaFinal')
              : tx.editadas.has(args.idReserva) ? 'lecturaFinal' : 'lectura', tx, args);
            const fila = actual(tx, args.idReserva);
            if (h.lecturaVacia === (n === 1 && creada ? 'lecturaPostInsert' : 'lecturaFinal')) return { recordset: [] };
            return { recordset: fila ? [copiar(fila)] : [] };
          }
          assert.fail('SQL no previsto por la fixture multirreserva');
        } finally { tx.ocupada = false; }
      },
    };
  }
  const pool = { request() { h.poolRequests++; assert.fail('Escape al pool independiente'); } };
  class Transaction {
    constructor(origen) {
      assert.strictEqual(origen, pool);
      this.id = h.transacciones.length + 1; h.transacciones.push(this);
      this.cambios = new Map(); this.huespedes = new Map(); this.eventos = []; this.creadas = new Set(); this.editadas = new Set();
      this.lecturas = new Map(); this.recursos = new Set(); this.liberaciones = []; this.ocupada = false;
    }
    async begin(nivel) { assert.equal(nivel, sql.ISOLATION_LEVEL.READ_COMMITTED); h.inicios++; await paso('begin', this); }
    request() { return request(this); }
    async commit() {
      h.commits++; await paso('commitAntes', this);
      for (const [id, fila] of this.cambios) h.filas.set(id, copiar(fila));
      for (const [id, fila] of this.huespedes) h.huespedes.set(id, copiar(fila));
      h.eventos.push(...copiar(this.eventos)); this.confirmada = true;
      h.confirmaciones.push({ tx: this.id, filas: copiar([...h.filas.values()]), eventos: copiar(h.eventos) });
      h.secuencia.push('commit');
      this.liberaciones.forEach(liberar => liberar());
      if (h.acusePerdido) throw Error('Commit ficticio aplicado; acuse perdido');
    }
    async rollback() {
      h.rollbacks++;
      if (this.confirmada) throw Error('Rollback no puede deshacer el commit aplicado');
      await paso('rollback', this); this.liberaciones.forEach(liberar => liberar());
    }
  }
  h.sembrar = datos => {
    const idReserva = h.siguienteId++;
    const fila = { idPropiedad: 7, idHuesped: 8, fechaIngreso: '2100-01-10', fechaEgreso: '2100-01-12',
      horaIngreso: '15:00', horaEgreso: '10:00', cantidadHuespedes: 2, montoEstimado: 100,
      estado: 'Confirmada', canal: 'Manual', ...datos, idReserva };
    h.filas.set(idReserva, fila); return fila;
  };
  h.reset = () => {
    h.filas = new Map(); h.eventos = []; h.colas = new Map(); h.transacciones = []; h.confirmaciones = [];
    h.fallos = {}; h.hooks = {}; h.inicios = 0; h.commits = 0; h.rollbacks = 0; h.inserts = 0; h.poolRequests = 0;
    h.resultadoLock = 0; h.acusePerdido = false; h.eventoSinResultado = false; h.eventoIncompatible = false;
    h.huespedSinResultado = false; h.lecturaVacia = false; h.insertsHuesped = 0; h.siguienteHuesped = 9; h.secuencia = [];
    h.siguienteId = 1; h.siguienteEvento = 1; h.consultas = [];
    h.propiedades = new Map([7, 9].map(idPropiedad => [idPropiedad, { idPropiedad, nombre: 'Casa ficticia', estado: 'Activa', capacidadMaxima: 4 }]));
    h.huespedes = new Map([[8, { idHuesped: 8, nombre: 'Persona', apellido: 'Ficticia' }]]);
  };
  h.idEstado = estado => ({ Pendiente: 11, Confirmada: 12, Cancelada: 13, Finalizada: 14, 'No show': 15 })[estado];
  h.reset();
  const db = require.resolve('../../src/config/database');
  require.cache[db] = { id: db, filename: db, loaded: true, exports: { sql: { ...sql, Transaction }, poolPromise: Promise.resolve(pool) } };
  return h;
}
module.exports = { prepararBookingAislado };
