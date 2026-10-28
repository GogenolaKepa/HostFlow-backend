const path = require('node:path');

// Configuración exclusiva del proceso hijo. Importar este archivo no inicia nada.
function entornoAzure(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('dev:azure es exclusivo de desarrollo.');
  const empresa = env.HOSTFLOW_EMPRESA_ID || '1';
  if (!/^[1-9]\d*$/.test(empresa) || Number(empresa) > 2147483647) {
    throw new Error('HOSTFLOW_EMPRESA_ID debe identificar una empresa válida.');
  }
  return { ...env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4000',
    HOSTFLOW_AUTH_SOURCE: 'sql', HOSTFLOW_EMPRESA_ID: empresa,
    HOSTFLOW_CONFIGURACION_ENABLED: '1', HOSTFLOW_CONFIGURACION_READ_ONLY: '1',
    HOSTFLOW_NOTIFICACIONES_SQL_ENABLED: '1', HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED: '0',
    HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED: '0',
    HOSTFLOW_MONEDAS_SQL_ENABLED: '1', HOSTFLOW_MONEDAS_WRITE_ENABLED: '0',
    HOSTFLOW_MONEDAS_RESERVAS_ENABLED: '1' };
}
function iniciar(env = process.env, spawn = require('node:child_process').spawn) {
  const child = spawn(process.execPath, [require.resolve('nodemon/bin/nodemon.js'), 'src/server.js'],
    { cwd: path.resolve(__dirname, '..'), env: entornoAzure(env), stdio: 'inherit', windowsHide: true });
  child.on('error', () => { console.error('No se pudo iniciar el proceso de desarrollo.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  return child;
}
if (require.main === module) {
  try { iniciar(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { entornoAzure, iniciar };
