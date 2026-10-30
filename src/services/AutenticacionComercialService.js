const bcrypt = require("bcryptjs");
const { randomUUID } = require("node:crypto");
const { isIP } = require("node:net");
const { crearToken, hashToken } = require("../security/comercial/credencialesTemporales");
const { ErrorSeguridad, validarCampos, normalizarEmail, texto, validarPassword,
  esUsuarioHabilitado, comprobarPassword } = require("../security/seguridadUsuarios");

const RESPUESTA_NEUTRAL = Object.freeze({ status: 202, mensaje: "Si la solicitud corresponde, recibirás instrucciones por correo." });
const tokenInvalido = () => new ErrorSeguridad(400, "ENLACE_INVALIDO", "El enlace no es válido o ya no está disponible.");
const indisponible = () => new ErrorSeguridad(503, "CUENTAS_RESULTADO_INCIERTO", "No se pudo confirmar la operación. No la reenvíe automáticamente.");
function ttl(valor, minimo, maximo) {
  if (!Number.isSafeInteger(valor) || valor < minimo || valor > maximo) throw new TypeError("Caducidad no válida.");
  return valor;
}
function contactoVerificado(u) {
  return Boolean(u && Number.isSafeInteger(u.versionContacto) && u.versionContacto > 0 &&
    typeof u.emailVerificadoEn === "string" && Number.isFinite(Date.parse(u.emailVerificadoEn)));
}

/** Núcleo NO montado en app/routes. Sin SQL, red, .env ni adaptadores por defecto.
 * El puerto repository debe aportar transacciones durables serializables, límites
 * compartidos y outbox atómica. El único adaptador de esta fase está en tests.
 */
class AutenticacionComercialService {
  constructor({ repository, protector, indicePrivado, origen, idEmpresa,
    ahora = Date.now, hashPassword = (p) => bcrypt.hash(p, 12),
    recuperacionMs = 15 * 60_000, invitacionMs = 24 * 60 * 60_000 } = {}) {
    if (typeof repository?.transaccion !== "function" || typeof protector?.sellar !== "function" ||
        typeof indicePrivado !== "function" || !Number.isSafeInteger(idEmpresa) || idEmpresa <= 0 ||
        typeof ahora !== "function" || typeof hashPassword !== "function") throw new TypeError("Faltan adaptadores de seguridad explícitos.");
    const url = new URL(origen);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new TypeError("El origen de los enlaces debe ser HTTPS fijo, sin ruta ni credenciales.");
    }
    Object.assign(this, { repository, protector, indicePrivado, origen: url.origin, idEmpresa, ahora, hashPassword });
    this.duraciones = { recuperacion: ttl(recuperacionMs, 60_000, 60 * 60_000), invitacion: ttl(invitacionMs, 60_000, 7 * 86400_000) };
  }

  async transaccion(operacion) {
    try { return await this.repository.transaccion(operacion); }
    catch (error) { throw error instanceof ErrorSeguridad ? error : indisponible(); }
  }

  async admitir(tx, proposito, destino, ip, ahora) {
    // IP determinada por servidor/proxy confiable, nunca desde el body ni XFF libre.
    if (typeof ip !== "string" || !isIP(ip)) return false;
    return await tx.admitir({ proposito, ahora, ip: this.indicePrivado("ip", ip),
      destino: this.indicePrivado("destino", destino), ventanaMs: 15 * 60_000,
      maxIp: 20, maxDestino: proposito.startsWith("confirmar-") ? 5 : 3,
      maxGlobal: 100, cooldownMs: proposito.startsWith("confirmar-") ? 0 : 60_000 }) === true;
  }

  async administrador(tx, actor) {
    const u = actor && Number.isSafeInteger(actor.idUsuario) ? await tx.usuario(actor.idUsuario) : null;
    if (!esUsuarioHabilitado(u) || u.rol !== "Administrador" || u.debeCambiarPassword ||
        u.versionSesion !== actor?.versionSesion || !await tx.empresaActiva(this.idEmpresa)) {
      throw new ErrorSeguridad(403, "SIN_PERMISO", "No tiene permiso para invitar cuentas.");
    }
    return u;
  }

  recuperable(u) {
    // Administradores requieren una política de recuperación reforzada, aún no aprobada.
    return esUsuarioHabilitado(u) && u.rol === "Operador" && contactoVerificado(u);
  }

  async emitir(tx, datos, ahora) {
    const { token, hash } = crearToken(datos.proposito);
    const desafio = { ...datos, id: randomUUID(), hash, creadaEn: ahora,
      expiraEn: ahora + this.duraciones[datos.proposito], consumidaEn: null, revocadaEn: null };
    await tx.insertarDesafio(desafio);
    const id = randomUUID();
    const enlace = `${this.origen}/cuenta/${datos.proposito}#token=${token}`;
    await tx.encolar({ id, desafioId: desafio.id, expiraEn: desafio.expiraEn,
      sobre: this.protector.sellar({ destinatario: datos.email, plantilla: datos.proposito, enlace }, id) });
    return desafio.id;
  }

  async solicitarRecuperacion(body, { ip } = {}) {
    // Igual salida para inexistentes/inactivos/no verificados/límites/fallo interno.
    // NO exponer directamente por HTTP: falta ingreso asíncrono durable contra canal temporal.
    try {
      validarCampos(body, ["email"]);
      const email = normalizarEmail(body.email);
      await this.transaccion(async (tx) => {
        const ahora = this.ahora();
        if (!await this.admitir(tx, "solicitar-recuperacion", email, ip, ahora)) return;
        const u = await tx.buscarUsuario(email);
        if (!this.recuperable(u) || !await tx.empresaActiva(this.idEmpresa)) return;
        await tx.revocarRecuperaciones(u.idUsuario, ahora);
        await this.emitir(tx, { proposito: "recuperacion", email, usuarioId: u.idUsuario,
          versionSesion: u.versionSesion, versionContacto: u.versionContacto,
          emailVerificadoEn: u.emailVerificadoEn, idEmpresa: this.idEmpresa }, ahora);
        await tx.auditar({ tipo: "RECUPERACION_SOLICITADA", usuarioId: u.idUsuario, ahora });
      });
    } catch { /* La futura capa de métricas no debe registrar email, token ni errores del driver. */ }
    return { ...RESPUESTA_NEUTRAL };
  }

  async invitar(actor, body, { ip } = {}) {
    // Primera fase: solo altas nuevas de Operador en la instalación actual.
    // Ningún rol/empresa/ID de usuario procede del formulario.
    validarCampos(body, ["nombre", "email"]);
    const email = normalizarEmail(body.email);
    const nombre = texto(body.nombre, "El nombre", 120);
    return this.transaccion(async (tx) => {
      const admin = await this.administrador(tx, actor);
      const ahora = this.ahora();
      if (!await this.admitir(tx, "invitar", email, ip, ahora)) return { ...RESPUESTA_NEUTRAL };
      if (await tx.buscarUsuario(email) || await tx.invitacionPendiente(email, this.idEmpresa, ahora)) return { ...RESPUESTA_NEUTRAL };
      if (!await tx.rolActivo("Operador")) throw new ErrorSeguridad(409, "ROL_INACTIVO", "El rol de destino no está disponible.");
      const desafioId = await this.emitir(tx, { proposito: "invitacion", email, nombre, rol: "Operador", idEmpresa: this.idEmpresa,
        invitadorId: admin.idUsuario, versionInvitador: admin.versionSesion }, ahora);
      await tx.auditar({ tipo: "INVITACION_EMITIDA", actorId: admin.idUsuario, desafioId, idEmpresa: this.idEmpresa, ahora });
      return { ...RESPUESTA_NEUTRAL };
    });
  }

  async vigente(tx, hash, proposito, ahora) {
    const d = hash && await tx.desafio(hash, proposito);
    if (!d || d.proposito !== proposito || d.idEmpresa !== this.idEmpresa || d.consumidaEn !== null ||
        d.revocadaEn !== null || d.expiraEn <= ahora || !await tx.empresaActiva(this.idEmpresa)) throw tokenInvalido();
    if (proposito === "recuperacion") {
      const u = await tx.usuario(d.usuarioId);
      if (!this.recuperable(u) || u.email !== d.email || u.versionSesion !== d.versionSesion ||
          u.versionContacto !== d.versionContacto || u.emailVerificadoEn !== d.emailVerificadoEn) throw tokenInvalido();
      return { d, u };
    }
    const admin = await tx.usuario(d.invitadorId);
    if (!esUsuarioHabilitado(admin) || admin.rol !== "Administrador" || admin.debeCambiarPassword ||
        admin.versionSesion !== d.versionInvitador || d.rol !== "Operador" || !await tx.rolActivo(d.rol) ||
        await tx.buscarUsuario(d.email)) throw tokenInvalido();
    return { d };
  }

  async confirmar(proposito, body, { ip } = {}) {
    validarCampos(body, ["token", "passwordNueva"]);
    const hash = hashToken(body.token, proposito);
    // Cuotas en transacción separada: un fallo posterior no devuelve el presupuesto.
    const admitida = await this.transaccion((tx) => this.admitir(tx, `confirmar-${proposito}`, hash || "invalido", ip, this.ahora()));
    if (!admitida) throw new ErrorSeguridad(429, "LIMITE_SOLICITUDES", "Demasiadas solicitudes. Intente más tarde.");
    const previa = await this.transaccion((tx) => this.vigente(tx, hash, proposito, this.ahora()));
    const password = validarPassword(body.passwordNueva);
    if (previa.u && await comprobarPassword(password, previa.u.passwordHash)) {
      throw new ErrorSeguridad(400, "PASSWORD_REPETIDA", "Elija una contraseña distinta de la actual.");
    }
    const passwordHash = await this.hashPassword(password); // bcrypt fuera del bloqueo.
    if (typeof passwordHash !== "string" || !/^\$2[ab]\$(0[4-9]|1[0-5])\$[./A-Za-z0-9]{53}$/.test(passwordHash)) throw indisponible();
    return this.transaccion(async (tx) => {
      const ahora = this.ahora();
      const { d, u } = await this.vigente(tx, hash, proposito, ahora); // Revalidar DESPUÉS de bcrypt.
      if (await tx.consumir(d.id, ahora) !== true) throw tokenInvalido();
      let usuarioId;
      if (u) {
        usuarioId = u.idUsuario;
        const actualizada = await tx.restablecerPassword({ usuarioId, passwordHash, versionSesion: u.versionSesion,
          nuevaVersionSesion: u.versionSesion + 1, debeCambiarPassword: false, ahora });
        if (actualizada !== true) throw tokenInvalido();
        await tx.revocarRecuperaciones(usuarioId, ahora);
      } else {
        usuarioId = await tx.crearInvitado({ nombre: d.nombre, email: d.email, rol: d.rol,
          passwordHash, emailVerificadoEn: new Date(ahora).toISOString(), versionContacto: 1,
          estado: "Activo", debeCambiarPassword: false, versionSesion: 1, actorId: d.invitadorId });
        if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) throw indisponible();
      }
      const id = randomUUID();
      await tx.encolar({ id, desafioId: null, expiraEn: ahora + 86400_000,
        sobre: this.protector.sellar({ destinatario: d.email, plantilla: "seguridad-cuenta", evento: proposito }, id) });
      await tx.auditar({ tipo: proposito === "recuperacion" ? "PASSWORD_RESTABLECIDA" : "INVITACION_ACEPTADA", usuarioId, ahora });
      return { status: 204 }; // No token JWT ni inicio automático de sesión.
    });
  }

  confirmarRecuperacion(body, contexto) { return this.confirmar("recuperacion", body, contexto); }
  aceptarInvitacion(body, contexto) { return this.confirmar("invitacion", body, contexto); }

  async revocarInvitacion(actor, id) {
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) throw tokenInvalido();
    return this.transaccion(async (tx) => {
      await this.administrador(tx, actor);
      await tx.revocarInvitacion(id, this.idEmpresa, this.ahora());
      await tx.auditar({ tipo: "INVITACION_REVOCADA", actorId: actor.idUsuario, desafioId: id, idEmpresa: this.idEmpresa, ahora: this.ahora() });
      return { status: 204 };
    });
  }
}
module.exports = { AutenticacionComercialService, RESPUESTA_NEUTRAL };
