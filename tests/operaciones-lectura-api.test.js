// HTTP, controladores, servicios y repositorios reales; sin dotenv o conexión.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const anterior = { JWT_SECRET: process.env.JWT_SECRET, HOSTFLOW_AUTH_SOURCE: process.env.HOSTFLOW_AUTH_SOURCE };
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.HOSTFLOW_AUTH_SOURCE = 'mock';
const consultas = [], escrituras = [];
const reserva = { idReserva: 1, idPropiedad: 1, idHuesped: 1, estado: 'Confirmada', canal: 'Manual',
  fechaIngreso: '2000-01-01', fechaEgreso: '2000-01-03', horaIngreso: '15:00', horaEgreso: '10:00', cantidadHuespedes: 2, montoEstimado: 10 };
const db = require.resolve('../src/config/database');
const cicloTx = { inicios: 0, commits: 0, rollbacks: 0 };
let permitirTx = false, intentosTx = 0;
class Transaction {
  async begin() {
    intentosTx++;
    assert.ok(permitirTx, 'Las lecturas GET/HEAD no deben abrir esta transacción de cancelación');
    cicloTx.inicios++;
  }
  async commit() { cicloTx.commits++; }
  async rollback() { cicloTx.rollbacks++; }
  request() { return {
    input() { return this; },
    async query(texto) {
      consultas.push(texto);
      if (texto.includes('sp_getapplock')) return { recordset: [{ bloqueo: 0 }] };
      if (texto.includes('SELECT IdReserva FROM dbo.Reservas WITH')) return { recordset: [{ IdReserva: 1 }] };
      if (texto.includes('FROM dbo.Reservas r')) return { recordset: [{ ...reserva }] };
      escrituras.push(texto); throw Error('DML prohibido al rechazar la cancelación de una vencida.');
    },
  }; }
}
require.cache[db] = { id: db, filename: db, loaded: true, exports: {
  sql: { ...require('mssql'), Transaction }, poolPromise: Promise.resolve({ request() { const parametros = {}; return {
    input(nombre, _tipo, valor) { parametros[nombre] = valor; return this; },
    async query(texto) {
      consultas.push(texto);
      const codigo = texto.replace(/'(?:[^']|'')*'|\/\*[\s\S]*?\*\/|--[^\r\n]*/g, ' ');
      if (/\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(codigo)) {
        escrituras.push(codigo); throw Error('Escritura prohibida durante GET/HEAD.');
      }
      if (/FROM dbo.Reservas r/i.test(texto) && !/COUNT|GROUP BY/i.test(texto)) return { recordset: [{ ...reserva }] };
      if (texto.includes('@PropiedadesActivas')) return { recordset: [{ propiedadesActivas: 0, reservasActivas: 0, huespedesRegistrados: 0, ingresosMes: 0, ocupacionMensual: 0 }] };
      if (/AS total/i.test(texto)) return { recordset: [{ total: 0 }] };
      return { recordset: [], recordsets: [[], [{ total: 0 }]], rowsAffected: [0] };
    },
  }; } }),
} };
const iaId = require.resolve('../src/services/IaService');
require.cache[iaId] = { id: iaId, filename: iaId, loaded: true, exports: {
  estaConfigurada: () => false, obtenerEstado: () => ({ configurada: false }),
  enriquecerRecomendaciones: () => { throw Error('Proveedor externo prohibido.'); },
} };
const { usuarios } = require('../src/data/mockData');
const cuentas = ['Administrador', 'Operador'].map((nombre, i) => ({ idUsuario: 960001 + i, nombre: 'Prueba aislada',
  email: `${nombre.toLowerCase()}@example.invalid`, estado: 'Activo', rol: { nombre } }));
usuarios.push(...cuentas);
const app = require('../src/app');
const { politicas } = require('../src/config/politicasRutas');
const { permisosDelRol } = require('../src/config/permisos');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => {
  await new Promise(r => server.close(r));
  for (const c of cuentas) usuarios.splice(usuarios.indexOf(c), 1);
  for (const [k, v] of Object.entries(anterior)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
function headers(cuenta) { return { Authorization: `Bearer ${jwt.sign({ idUsuario: cuenta.idUsuario, email: cuenta.email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' })}`, 'Content-Type': 'application/json' }; }
test('TODAS las rutas GET del catálogo y sus HEAD no envían DML, con ambos roles', async () => {
  for (const cuenta of cuentas) for (const p of politicas.filter(x => x.metodo === 'GET')) {
    const ruta = p.path.replace(/:[^/]+/g, '1') + (p.path === '/calendario' ? '?anio=2028&mes=2' : '');
    for (const method of ['GET', 'HEAD']) {
      const previas = consultas.length;
      const response = await fetch(base + '/api' + ruta + (ruta.includes('?') ? '&' : '?') + 'ia=false', { method, headers: headers(cuenta) });
      await response.text();
      assert.equal(escrituras.length, 0, `${cuenta.rol.nombre} ${method} ${p.path} intentó escribir`);
      // Las cuentas/flags SQL se prueban por separado en las suites de seguridad.
      assert.ok([200, 400, 403, 404, 503].includes(response.status), `${method} ${p.path}: ${response.status}`);
      if (!permisosDelRol(cuenta.rol.nombre).includes(p.permiso)) {
        assert.equal(response.status, 403, 'La prohibición por rol precede al controlador');
        assert.equal(consultas.length, previas);
      } else assert.notEqual(response.status, 403);
    }
  }
  assert.ok(consultas.length > 20);
  assert.equal(intentosTx, 0);
});
test('sin sesión todas las lecturas de negocio son 401; preflight del comando no consulta SQL', async () => {
  const antes = consultas.length;
  for (const p of politicas.filter(x=>x.metodo==='GET')) {
    const response = await fetch(base + '/api' + p.path.replace(/:[^/]+/g, '1'));
    assert.equal(response.status, 401); await response.text();
  }
  const preflight = await fetch(base + '/api/reservas/finalizar-vencidas', { method: 'OPTIONS',
    headers: { Origin: 'http://127.0.0.1:5173', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.status, 204); assert.equal(consultas.length, antes);
});
test('finalizar vencidas exige JWT, permiso administrativo y confirmación antes de escribir', async () => {
  const ruta = base + '/api/reservas/finalizar-vencidas';
  for (const [h, body, esperado] of [[{}, { confirmar: true }, 401], [headers(cuentas[1]), { confirmar: true }, 403],
    [headers(cuentas[0]), {}, 400], [headers(cuentas[0]), { confirmar: true, fechaActual: '2100-01-01' }, 400]]) {
    const previas = consultas.length;
    const response = await fetch(ruta, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, esperado); await response.text();
    assert.equal(consultas.length, previas);
  }
});
test('reserva vencida se consulta sin cambiar estado, expone cierre pendiente y no permite modificar/cancelar', async () => {
  const servicio = require('../src/services/ReservaService');
  const fila = await servicio.obtenerReservaPorId(1);
  assert.equal(fila.estado, 'Confirmada'); assert.equal(fila.finalizacionPendiente, true);
  assert.deepEqual(fila.accionesDisponibles, ['VER']);
  permitirTx = true;
  try {
    await assert.rejects(servicio.modificarReserva(1, {}), /vencida/);
    await assert.rejects(servicio.cancelarReserva(1), /vencida/);
  }
  finally { permitirTx = false; }
  assert.deepEqual(cicloTx, { inicios: 2, commits: 0, rollbacks: 2 });
  await assert.rejects(servicio.crearReserva({}), /obligatorios/);
  assert.equal(escrituras.length, 0);
});
