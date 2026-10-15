const { ErrorSeguridad } = require('../security/seguridadUsuarios');

// Una organización por instalación. Nunca seleccionar la primera fila ni
// tomar IdEmpresa del cuerpo, query, JWT o almacenamiento del navegador.
function contextoEmpresa(env = process.env) {
  if (env.HOSTFLOW_CONFIGURACION_ENABLED !== '1') {
    throw new ErrorSeguridad(503, 'CONFIGURACION_PENDIENTE', 'La persistencia empresarial todavía no está activada. No se pueden guardar cambios.');
  }
  const id = env.HOSTFLOW_EMPRESA_ID;
  if (typeof id !== 'string' || !/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) {
    throw new ErrorSeguridad(503, 'EMPRESA_NO_CONFIGURADA', 'Falta vincular esta instalación con su empresa.');
  }
  return { idEmpresa: Number(id) };
}

// Guarda temporal de activación: no reemplaza JWT, permisos ni la bandera principal.
// Un valor inválido también cierra el guardado para evitar errores de escritura.
function exigirEscrituraConfiguracion(env = process.env) {
  if (env.HOSTFLOW_CONFIGURACION_READ_ONLY !== undefined && env.HOSTFLOW_CONFIGURACION_READ_ONLY !== '0') {
    throw new ErrorSeguridad(503, 'CONFIGURACION_SOLO_LECTURA', 'La configuración empresarial está en modo de solo lectura. El guardado todavía no está habilitado.');
  }
}

module.exports = { contextoEmpresa, exigirEscrituraConfiguracion };
