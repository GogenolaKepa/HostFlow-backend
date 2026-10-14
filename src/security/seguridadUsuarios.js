const bcrypt = require("bcryptjs");
const { permisosDelRol } = require("../config/permisos");

const ROLES_ASIGNABLES = Object.freeze(["Administrador", "Operador"]);
const RECURSO_BLOQUEO = "HostFlow:Seguridad:AdministradoresActivos";

class ErrorSeguridad extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

function validarCampos(body, permitidos, obligatorios = permitidos) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ErrorSeguridad(400, "VALIDACION", "El cuerpo debe ser un objeto.");
  }
  if (Object.keys(body).some((campo) => !permitidos.includes(campo))) {
    throw new ErrorSeguridad(400, "CAMPO_NO_PERMITIDO", "La solicitud contiene campos no permitidos.");
  }
  if (obligatorios.some((campo) => !Object.hasOwn(body, campo))) {
    throw new ErrorSeguridad(400, "VALIDACION", "Faltan campos obligatorios.");
  }
}

function texto(valor, nombre, maximo) {
  if (typeof valor !== "string" || !valor.trim() || valor.trim().length > maximo) {
    throw new ErrorSeguridad(400, "VALIDACION", `${nombre} no es válido.`);
  }
  return valor.trim();
}

function normalizarEmail(valor) {
  const email = texto(valor, "El correo", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ErrorSeguridad(400, "VALIDACION", "El correo no es válido.");
  }
  return email;
}

function validarRol(rol) {
  if (!ROLES_ASIGNABLES.includes(rol)) {
    throw new ErrorSeguridad(400, "ROL_NO_PERMITIDO", "Solo se permite Administrador u Operador.");
  }
  return rol;
}

function validarPassword(password) {
  if (typeof password !== "string" || [...password].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || [...password].length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new ErrorSeguridad(400, "PASSWORD_INVALIDA", "La contraseña debe tener al menos 12 caracteres y como máximo 72 bytes UTF-8, sin caracteres de control.");
  }
  return password;
}

function validarRevision(valor) {
  if (typeof valor !== "string" || !/^[a-f0-9]{16}$/i.test(valor)) {
    throw new ErrorSeguridad(400, "REVISION_INVALIDA", "Debe indicar la revisión vigente de la cuenta.");
  }
  return valor.toLowerCase();
}

function revisionDe(usuario) {
  return Buffer.isBuffer(usuario.versionRegistro)
    ? usuario.versionRegistro.toString("hex") : usuario.versionRegistro;
}

function verificarRevision(usuario, revision) {
  if (revisionDe(usuario) !== revision) {
    throw new ErrorSeguridad(409, "REVISION_VENCIDA", "La cuenta cambió. Recargue los datos antes de continuar.");
  }
}

function esUsuarioHabilitado(usuario) {
  return Boolean(usuario && usuario.estado === "Activo" && usuario.rolActivo === true &&
    ROLES_ASIGNABLES.includes(usuario.rol) && Number.isInteger(usuario.versionSesion) && usuario.versionSesion > 0);
}

function perfilSeguro(usuario, origen = "sql") {
  const perfil = {
    idUsuario: usuario.idUsuario,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    permisos: permisosDelRol(usuario.rol),
    origenAutenticacion: origen,
    gestionCuentasDisponible: origen === "sql",
    debeCambiarPassword: origen === "sql" && Boolean(usuario.debeCambiarPassword),
  };
  if (origen === "sql") {
    perfil.estado = usuario.estado;
    perfil.versionRegistro = revisionDe(usuario);
    for (const campo of ["fechaCreacion", "fechaActualizacion"]) {
      if (usuario[campo] instanceof Date) perfil[campo] = usuario[campo].toISOString();
    }
  }
  return perfil;
}

function credencialesInvalidas() {
  return new ErrorSeguridad(401, "CREDENCIALES_INVALIDAS", "El correo o la contraseña no son válidos.");
}

function sesionInvalida() {
  return new ErrorSeguridad(401, "SESION_INVALIDA", "La sesión no es válida o venció. Inicie sesión nuevamente.");
}

function errorPersistencia(error) {
  if (error instanceof ErrorSeguridad) return error;
  const numero = error?.number ?? error?.originalError?.info?.number;
  if ([2601, 2627].includes(numero)) {
    return new ErrorSeguridad(409, "EMAIL_DUPLICADO", "Ya existe una cuenta con ese correo.");
  }
  if ([1205, 1222].includes(numero)) {
    return new ErrorSeguridad(409, "OPERACION_CONCURRENTE", "Otra operación está en curso. Reintente.");
  }
  return new ErrorSeguridad(503, "SEGURIDAD_NO_DISPONIBLE", "La gestión de cuentas no está disponible. Reintente más tarde.");
}

function responderError(res, error) {
  const seguro = errorPersistencia(error);
  return res.status(seguro.status).json({ mensaje: seguro.message, codigo: seguro.codigo });
}

async function comprobarPassword(password, hash) {
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 72 ||
      typeof hash !== "string" || !/^\$2[ab]\$(0[4-9]|1[0-5])\$[./A-Za-z0-9]{53}$/.test(hash)) return false;
  return bcrypt.compare(password, hash);
}

module.exports = { ROLES_ASIGNABLES, RECURSO_BLOQUEO, ErrorSeguridad, validarCampos, texto,
  normalizarEmail, validarRol, validarPassword, validarRevision, revisionDe, verificarRevision,
  esUsuarioHabilitado, perfilSeguro, credencialesInvalidas, sesionInvalida,
  errorPersistencia, responderError, comprobarPassword };
