const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entornoAzure, iniciar } = require('../scripts/devAzure');

test('dev:azure conserva credenciales heredadas y cierra flags peligrosas sin mutar el entorno', () => {
  const env = { HOST: '0.0.0.0', PORT: '9000', DB_PASSWORD: 'solo-fixture',
    HOSTFLOW_MONEDAS_WRITE_ENABLED: '1', HOSTFLOW_CONFIGURACION_READ_ONLY: '0',
    HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED: '1', HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED: '1' };
  const antes = { ...env }, actual = entornoAzure(env);
  assert.deepEqual(env, antes); assert.equal(actual.DB_PASSWORD, env.DB_PASSWORD);
  assert.equal(actual.HOST, '127.0.0.1'); assert.equal(actual.PORT, '4000');
  assert.equal(actual.HOSTFLOW_AUTH_SOURCE, 'sql'); assert.equal(actual.HOSTFLOW_EMPRESA_ID, '1');
  for (const campo of ['HOSTFLOW_MONEDAS_WRITE_ENABLED', 'HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED', 'HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED']) assert.equal(actual[campo], '0');
  assert.equal(actual.HOSTFLOW_CONFIGURACION_READ_ONLY, '1');
  assert.equal(actual.HOSTFLOW_MONEDAS_RESERVAS_ENABLED, '1');
});
test('dev:azure rechaza producción y empresas inválidas; no inventa credenciales', () => {
  assert.throws(() => entornoAzure({ NODE_ENV: 'production' }));
  for (const empresa of ['0', '-1', 'x', '2147483648']) assert.throws(() => entornoAzure({ HOSTFLOW_EMPRESA_ID: empresa }));
  assert.equal(entornoAzure({ HOSTFLOW_EMPRESA_ID: '2' }).HOSTFLOW_EMPRESA_ID, '2');
  assert.equal(Object.hasOwn(entornoAzure({}), 'DB_PASSWORD'), false);
});
test('launcher usa nodemon local, sin shell y sin lanzar servidor en esta prueba', () => {
  let llamadas = 0;
  const child = { on() { return this; } };
  const resultado = iniciar({}, (exe, args, opciones) => {
    llamadas++; assert.equal(exe, process.execPath); assert.match(args[0], /nodemon/);
    assert.equal(args[1], 'src/server.js'); assert.equal(opciones.stdio, 'inherit');
    assert.equal(opciones.shell, undefined); assert.equal(opciones.env.HOSTFLOW_MONEDAS_WRITE_ENABLED, '0');
    return child;
  });
  assert.equal(llamadas, 1); assert.equal(resultado, child);
  assert.equal(require.cache[require.resolve('../src/config/database')], undefined);
});
