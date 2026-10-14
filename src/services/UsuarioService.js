const bcrypt = require("bcryptjs");
const { ErrorSeguridad, validarCampos, texto, normalizarEmail, validarRol, validarPassword,
  validarRevision, revisionDe, verificarRevision, esUsuarioHabilitado, perfilSeguro,
  sesionInvalida, comprobarPassword } = require("../security/seguridadUsuarios");

class UsuarioService {
  constructor(repository, { cost = 12 } = {}) {
    this.repository = repository;
    this.cost = cost;
  }

  async revalidarActor(tx, actor, { admin = false, cambioObligatorio = false } = {}) {
    const actual = await tx.obtener(actor.idUsuario);
    if (!esUsuarioHabilitado(actual) || actual.versionSesion !== actor.versionSesion) throw sesionInvalida();
    if (actual.debeCambiarPassword && !cambioObligatorio) {
      throw new ErrorSeguridad(403, "PASSWORD_CHANGE_REQUIRED", "Debe cambiar su contraseña para continuar.");
    }
    if (admin && actual.rol !== "Administrador") throw new ErrorSeguridad(403, "SIN_PERMISO", "No tiene permiso para administrar cuentas.");
    return actual;
  }

  async destino(tx, id, revision) {
    const usuario = await tx.obtener(id);
    if (!usuario) throw new ErrorSeguridad(404, "USUARIO_NO_ENCONTRADO", "La cuenta no existe.");
    verificarRevision(usuario, revision);
    return usuario;
  }

  async rol(tx, nombre) {
    const rol = await tx.roles.resolverActivo(validarRol(nombre));
    if (!rol) throw new ErrorSeguridad(409, "ROL_INACTIVO", "El rol solicitado no está activo en SQL.");
    return rol;
  }

  async protegerUltimoAdministrador(tx, usuario, nuevoRol, nuevoEstado) {
    if (usuario.rol === "Administrador" && usuario.rolActivo && usuario.estado === "Activo" &&
        (nuevoRol !== "Administrador" || nuevoEstado !== "Activo") &&
        await tx.contarAdministradoresActivos() <= 1) {
      throw new ErrorSeguridad(409, "ULTIMO_ADMINISTRADOR", "Debe quedar al menos un Administrador activo.");
    }
  }

  async crear(actor, body) {
    validarCampos(body, ["nombre", "email", "rol", "passwordTemporal"]);
    const nombre = texto(body.nombre, "El nombre", 120);
    const email = normalizarEmail(body.email);
    const rol = validarRol(body.rol);
    const hash = await bcrypt.hash(validarPassword(body.passwordTemporal), this.cost);
    return this.repository.transaccionSeguridad(async (tx) => {
      await this.revalidarActor(tx, actor, { admin: true });
      const rolSQL = await this.rol(tx, rol);
      return perfilSeguro(await tx.crear({ nombre, email, passwordHash: hash, idRol: rolSQL.idRol, actor: actor.idUsuario }));
    });
  }

  async editar(actor, id, body) {
    validarCampos(body, ["nombre", "email", "rol", "versionRegistro"]);
    const nombre = texto(body.nombre, "El nombre", 120);
    const email = normalizarEmail(body.email);
    const rol = validarRol(body.rol);
    const revision = validarRevision(body.versionRegistro);
    return this.repository.transaccionSeguridad(async (tx) => {
      await this.revalidarActor(tx, actor, { admin: true });
      const usuario = await this.destino(tx, id, revision);
      const rolSQL = await this.rol(tx, rol);
      await this.protegerUltimoAdministrador(tx, usuario, rol, usuario.estado);
      const revocar = email !== usuario.email || rol !== usuario.rol;
      const actualizado = await tx.actualizar(id, revision, { nombre, email, idRol: rolSQL.idRol }, actor.idUsuario, revocar);
      return { usuario: perfilSeguro(actualizado), sesionRevocada: revocar && actor.idUsuario === id };
    });
  }

  async cambiarEstado(actor, id, body) {
    validarCampos(body, ["estado", "versionRegistro"]);
    if (!["Activo", "Inactivo"].includes(body.estado)) throw new ErrorSeguridad(400, "VALIDACION", "Estado no válido.");
    const revision = validarRevision(body.versionRegistro);
    return this.repository.transaccionSeguridad(async (tx) => {
      await this.revalidarActor(tx, actor, { admin: true });
      const usuario = await this.destino(tx, id, revision);
      await this.protegerUltimoAdministrador(tx, usuario, usuario.rol, body.estado);
      const revocar = body.estado !== usuario.estado;
      const actualizado = await tx.actualizar(id, revision, { estado: body.estado }, actor.idUsuario, revocar);
      return { usuario: perfilSeguro(actualizado), sesionRevocada: revocar && actor.idUsuario === id };
    });
  }

  async restablecer(actor, id, body) {
    validarCampos(body, ["passwordTemporal", "versionRegistro"]);
    if (actor.idUsuario === id) throw new ErrorSeguridad(403, "CAMBIO_PROPIO", "Para su cuenta use el cambio de contraseña con la contraseña actual.");
    const revision = validarRevision(body.versionRegistro);
    const hash = await bcrypt.hash(validarPassword(body.passwordTemporal), this.cost);
    return this.repository.transaccionSeguridad(async (tx) => {
      await this.revalidarActor(tx, actor, { admin: true });
      await this.destino(tx, id, revision);
      return perfilSeguro(await tx.actualizar(id, revision, { passwordHash: hash, debeCambiarPassword: true }, actor.idUsuario, true));
    });
  }

  async editarNombre(actor, body) {
    validarCampos(body, ["nombre", "versionRegistro"]);
    const nombre = texto(body.nombre, "El nombre", 120);
    const revision = validarRevision(body.versionRegistro);
    return this.repository.transaccionSeguridad(async (tx) => {
      await this.revalidarActor(tx, actor);
      await this.destino(tx, actor.idUsuario, revision);
      return tx.actualizar(actor.idUsuario, revision, { nombre }, actor.idUsuario);
    });
  }

  async cambiarPassword(actor, body) {
    validarCampos(body, ["passwordActual", "passwordNueva", "versionRegistro"]);
    validarPassword(body.passwordNueva);
    const revision = validarRevision(body.versionRegistro);
    // bcrypt fuera del bloqueo; la revision vuelve a comprobarse dentro de la transaccion.
    const anterior = await this.repository.obtener(actor.idUsuario, { credenciales: true });
    if (!esUsuarioHabilitado(anterior) || anterior.versionSesion !== actor.versionSesion) throw sesionInvalida();
    verificarRevision(anterior, revision);
    if (!await comprobarPassword(body.passwordActual, anterior.passwordHash)) {
      throw new ErrorSeguridad(400, "PASSWORD_ACTUAL_INVALIDA", "La contraseña actual no es correcta.");
    }
    if (await comprobarPassword(body.passwordNueva, anterior.passwordHash)) {
      throw new ErrorSeguridad(400, "PASSWORD_REPETIDA", "Elija una contraseña distinta de la actual.");
    }
    const hash = await bcrypt.hash(body.passwordNueva, this.cost);
    return this.repository.transaccionSeguridad(async (tx) => {
      await this.revalidarActor(tx, actor, { cambioObligatorio: true });
      await this.destino(tx, actor.idUsuario, revision);
      return tx.actualizar(actor.idUsuario, revision, { passwordHash: hash, debeCambiarPassword: false }, actor.idUsuario, true);
    });
  }

  async logout(actor) {
    return this.repository.transaccionSeguridad(async (tx) => {
      const actual = await this.revalidarActor(tx, actor, { cambioObligatorio: true });
      await tx.actualizar(actual.idUsuario, revisionDe(actual), {}, actual.idUsuario, true);
    });
  }

  async bootstrap({ nombre, email, password, escrituraAutorizada = false }) {
    if (escrituraAutorizada !== true) throw new ErrorSeguridad(403, "ESCRITURA_NO_AUTORIZADA", "El alta inicial requiere autorización explícita.");
    nombre = texto(nombre, "El nombre", 120);
    email = normalizarEmail(email);
    const hash = await bcrypt.hash(validarPassword(password), this.cost);
    return this.repository.transaccionSeguridad(async (tx) => {
      if (!await tx.estaVacia()) throw new ErrorSeguridad(409, "BOOTSTRAP_NO_PERMITIDO", "El alta inicial requiere Usuarios vacía.");
      const rol = await this.rol(tx, "Administrador");
      const usuario = await tx.crear({ nombre, email, passwordHash: hash, idRol: rol.idRol });
      return { idUsuario: usuario.idUsuario, rol: usuario.rol, estado: usuario.estado, debeCambiarPassword: usuario.debeCambiarPassword };
    });
  }
}

module.exports = UsuarioService;
