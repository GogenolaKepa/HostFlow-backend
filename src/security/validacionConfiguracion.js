const { ErrorSeguridad, validarCampos, validarRevision } = require('./seguridadUsuarios');

const ZONA_OPERATIVA = 'America/Argentina/Buenos_Aires';
const CAMPOS_EMPRESA = Object.freeze({ nombreComercial: 120, razonSocial: 180, correoContacto: 254,
  telefono: 40, pais: 80, provincia: 100, ciudad: 100, direccion: 240, informacionAdicional: 1000 });
const error = mensaje => new ErrorSeguridad(400, 'VALIDACION_CONFIGURACION', mensaje);

function validarEmpresa(body) {
  validarCampos(body, [...Object.keys(CAMPOS_EMPRESA), 'versionRegistro']);
  const datos = {};
  for (const [campo, limite] of Object.entries(CAMPOS_EMPRESA)) {
    const valor = body[campo];
    const tieneControl = typeof valor === 'string' && [...valor].some(c => {
      const n=c.charCodeAt(0);return (n<32||n===127) && !(campo==='informacionAdicional'&&[9,10,13].includes(n));
    });
    if (typeof valor !== 'string' || tieneControl || valor.trim().length > limite) {
      throw error(`El campo ${campo} no es válido (máximo ${limite} caracteres, sin controles).`);
    }
    datos[campo] = valor.trim();
  }
  if (!datos.nombreComercial) throw error('Ingresá el nombre comercial.');
  if (datos.correoContacto && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correoContacto)) throw error('El correo de contacto no es válido.');
  datos.correoContacto = datos.correoContacto.toLowerCase();
  return { datos, revision: validarRevision(body.versionRegistro) };
}

function validarOperativas(body) {
  validarCampos(body, ['horaIngreso', 'horaEgreso', 'versionRegistro']);
  for (const campo of ['horaIngreso','horaEgreso']) {
    if (typeof body[campo] !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body[campo])) throw error('Los horarios deben ser válidos y tener formato HH:mm.');
  }
  return { datos: { horaIngreso: body.horaIngreso, horaEgreso: body.horaEgreso }, revision: validarRevision(body.versionRegistro) };
}

function dtoEmpresa(row) {
  return { ...Object.fromEntries(Object.keys(CAMPOS_EMPRESA).map(campo => [campo, row[campo] ?? ''])), versionRegistro: revision(row) };
}
function revision(row) {
  const valor = Buffer.isBuffer(row.versionRegistro) ? row.versionRegistro.toString('hex') : row.versionRegistro;
  if (typeof valor !== 'string' || !/^[a-f0-9]{16}$/i.test(valor)) throw new ErrorSeguridad(503, 'CONFIGURACION_NO_DISPONIBLE', 'La configuración no está disponible.');
  return valor.toLowerCase();
}
function dtoOperativas(row) {
  if (row.zonaHoraria !== ZONA_OPERATIVA || ['horaIngreso','horaEgreso'].some(c=>!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row[c] || ''))) {
    throw new ErrorSeguridad(503, 'CONFIGURACION_NO_DISPONIBLE', 'Los horarios operativos no son compatibles.');
  }
  return { horaIngreso: row.horaIngreso, horaEgreso: row.horaEgreso, zonaHoraria: ZONA_OPERATIVA, versionRegistro: revision(row) };
}
function errorConfiguracion(error) {
  return error instanceof ErrorSeguridad ? error : new ErrorSeguridad(503, 'CONFIGURACION_NO_DISPONIBLE', 'No se pudo acceder a la configuración empresarial. Reintentá o revisá su activación.');
}

module.exports = { CAMPOS_EMPRESA, ZONA_OPERATIVA, validarEmpresa, validarOperativas, dtoEmpresa, dtoOperativas, errorConfiguracion };
