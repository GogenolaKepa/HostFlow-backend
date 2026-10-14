const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID, randomBytes } = require("node:crypto");
const { origenAutenticacion, secretoJWTValido } = require("../config/autenticacion");
const UsuarioRepository = require("../repositories/UsuarioRepository");
const UsuarioService = require("./UsuarioService");
const { esUsuarioHabilitado, normalizarEmail, perfilSeguro, comprobarPassword,
  credencialesInvalidas, errorPersistencia, ErrorSeguridad } = require("../security/seguridadUsuarios");

class AuthService {
  constructor({ origen = origenAutenticacion(), repository = new UsuarioRepository(), cuentas,
    mockUsuarios, secret = () => process.env.JWT_SECRET } = {}) {
    if (!["mock", "sql"].includes(origen)) throw new Error("Origen de autenticación no válido.");
    this.origen = origen;
    this.repository = repository;
    this.cuentas = cuentas || new UsuarioService(repository);
    this.mockUsuarios = origen === "mock" ? (mockUsuarios || require("../data/mockData").usuarios) : [];
    this.secret = secret;
    this.hashDesconocido = null;
  }

  perfil(usuario) { return perfilSeguro(usuario, this.origen); }

  emitirSesion(usuario) {
    const secret = this.secret();
    if (!secretoJWTValido(secret)) throw new ErrorSeguridad(503, "AUTH_NO_DISPONIBLE", "La autenticación no está disponible.");
    const token = jwt.sign({ idUsuario: usuario.idUsuario, email: usuario.email,
      origen: this.origen, ...(this.origen === "sql" ? { versionSesion: usuario.versionSesion } : {}) },
    secret, { algorithm: "HS256", expiresIn: "2h", jwtid: randomUUID() });
    return { token, usuario: this.perfil(usuario), expiraEn: jwt.decode(token).exp };
  }

  async obtenerUsuarioSesion(idUsuario, payload = {}) {
    if (this.origen === "mock") {
      if (payload.origen && payload.origen !== "mock") return null;
      const usuario = this.mockUsuarios.find((u) => u.idUsuario === idUsuario && u.estado === "Activo");
      return usuario ? { idUsuario: usuario.idUsuario, nombre: usuario.nombre,
        email: usuario.email, rol: usuario.rol.nombre } : null;
    }
    // Rechazar tokens mock ANTES de consultar SQL, aunque coincidan los IDs.
    if (payload.origen !== "sql" || !Number.isInteger(payload.versionSesion) || payload.versionSesion <= 0) return null;
    try {
      const usuario = await this.repository.obtener(idUsuario);
      return esUsuarioHabilitado(usuario) && usuario.versionSesion === payload.versionSesion ? usuario : null;
    } catch (error) { throw errorPersistencia(error); }
  }

  async login(email, password) {
    let emailNormalizado;
    try { emailNormalizado = normalizarEmail(email); } catch { throw credencialesInvalidas(); }
    if (this.origen === "mock") {
      const mock = this.mockUsuarios.find((u) => u.email.toLowerCase() === emailNormalizado);
      if (!mock || mock.estado !== "Activo" || !["Administrador", "Operador"].includes(mock.rol.nombre) ||
          !await bcrypt.compare(password, mock.passwordHash)) throw credencialesInvalidas();
      return this.emitirSesion({ idUsuario: mock.idUsuario, nombre: mock.nombre, email: mock.email, rol: mock.rol.nombre });
    }
    try {
      const usuario = await this.repository.buscarPorEmail(emailNormalizado);
      if (!usuario) {
        this.hashDesconocido ||= bcrypt.hash(randomBytes(32).toString("hex"), 12);
      }
      const valida = await comprobarPassword(password, usuario?.passwordHash || await this.hashDesconocido);
      if (!valida || !esUsuarioHabilitado(usuario)) throw credencialesInvalidas();
      return this.emitirSesion(usuario);
    } catch (error) { throw errorPersistencia(error); }
  }

  exigirSQL() {
    if (this.origen !== "sql") throw new ErrorSeguridad(503, "GESTION_SQL_PENDIENTE", "La gestión de cuentas estará disponible después de activar la autenticación SQL.");
  }

  async comprobarPreparacionSQL() {
    if (this.origen !== "sql") return;
    try {
      const req = await this.repository.request();
      const { recordset } = await req.query(`SELECT DB_NAME() AS base,
        HAS_PERMS_BY_NAME(N'dbo.Roles', N'OBJECT', N'SELECT') AS roles,
        HAS_PERMS_BY_NAME(N'dbo.Usuarios', N'OBJECT', N'SELECT') AS lectura,
        HAS_PERMS_BY_NAME(N'dbo.Usuarios', N'OBJECT', N'INSERT') AS alta,
        HAS_PERMS_BY_NAME(N'dbo.Usuarios', N'OBJECT', N'UPDATE') AS edicion,
        HAS_PERMS_BY_NAME(N'sys.sp_getapplock', N'OBJECT', N'EXECUTE') AS bloqueo;`);
      const estado = recordset[0];
      if (estado.base !== "HostFlow" || ["roles", "lectura", "alta", "edicion", "bloqueo"].some((k) => estado[k] !== 1) ||
          await this.repository.contarAdministradoresActivos() < 1 ||
          (await this.repository.roles.listarAsignables()).length !== 2) {
        throw new ErrorSeguridad(503, "SQL_NO_PREPARADO", "SQL no está preparado: revisar destino, permisos, roles y primer Administrador.");
      }
    } catch (error) { throw errorPersistencia(error); }
  }
}

const servicio = new AuthService();
module.exports = servicio;
module.exports.AuthService = AuthService;
