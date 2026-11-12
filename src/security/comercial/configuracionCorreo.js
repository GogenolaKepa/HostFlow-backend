const { normalizarEmail } = require('../seguridadUsuarios');

// Propuesta pública, no configuración operativa ni acreditación del dominio.
// Importar este módulo no lee secretos, entorno, DNS ni activa transportes.
const CORREO_HOSTFLOW_PROPUESTO = Object.freeze({
  habilitado: false,
  nombre: 'HostFlow Seguridad',
  origen: 'https://hostflow.com.ar',
  remitente: 'seguridad@hostflow.com.ar',
  dominioVerificado: 'hostflow.com.ar',
});

function validarRemitente(remitente, dominioVerificado) {
  if (typeof remitente !== 'string' || /[\s<>(),;:\[\]"\\]/.test(remitente) ||
      typeof dominioVerificado !== 'string') throw TypeError('Remitente no acreditado.');
  const email = normalizarEmail(remitente);
  const [local, dominio] = email.split('@');
  const esperado = dominioVerificado.toLowerCase();
  const etiqueta = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
      local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      dominio !== esperado || dominio.length > 253 || dominio.split('.').length < 2 ||
      dominio.split('.').some(p => !etiqueta.test(p))) throw TypeError('Remitente no acreditado.');
  // Valida sintaxis y correspondencia. La verificación DNS sigue siendo externa.
  return Object.freeze({ remitente: email, dominioVerificado: esperado });
}

function formatearRemitente(remitente, dominioVerificado) {
  const validado = validarRemitente(remitente, dominioVerificado);
  return `${CORREO_HOSTFLOW_PROPUESTO.nombre} <${validado.remitente}>`;
}

module.exports = { CORREO_HOSTFLOW_PROPUESTO, validarRemitente, formatearRemitente };
