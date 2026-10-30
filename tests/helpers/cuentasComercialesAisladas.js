const { UsuariosAislados } = require("./usuariosAislados");

// DOBLE EXCLUSIVO DE TEST: serializa y restaura snapshots en memoria.
// No es adaptador de producción ni acredita locks/rollback/leases de SQL Server.
class CuentasComercialesAisladas extends UsuariosAislados {
  constructor() {
    super();
    this.desafios = new Map(); this.entregas = new Map(); this.limites = new Map(); this.auditoria = [];
    this.colaComercial = Promise.resolve(); this.empresaHabilitada = true;
  }
  async transaccion(callback) {
    const antes = this.colaComercial;
    let liberar;
    this.colaComercial = new Promise(resolve => { liberar = resolve; });
    await antes;
    const snapshot = structuredClone({ filas: this.filas, desafios: this.desafios, entregas: this.entregas,
      limites: this.limites, auditoria: this.auditoria, numeroRevision: this.numeroRevision, escrituras: this.escrituras });
    try { return await callback(this); }
    catch (e) { Object.assign(this, snapshot); throw e; }
    finally { liberar(); }
  }
  async empresaActiva(id) { return id === 1 && this.empresaHabilitada; }
  async usuario(id) { return this.obtener(id, { credenciales: true }); }
  async buscarUsuario(email) { return this.buscarPorEmail(email); }
  async rolActivo(nombre) { return this.rolesDatos.some(r => r.nombre === nombre && r.activo); }
  async admitir({ proposito, ahora, ip, destino, ventanaMs, maxIp, maxDestino, maxGlobal, cooldownMs }) {
    const claves = [[`ip:${ip}`, maxIp], [`destino:${destino}`, maxDestino], ["global", maxGlobal]];
    const contadores = claves.map(([clave, max]) => {
      const key = `${proposito}:${clave}`;
      const previo = this.limites.get(key);
      const dato = !previo || ahora - previo.inicio >= ventanaMs ? { inicio: ahora, cuenta: 0, ultima: null } : { ...previo };
      return { key, max, dato };
    });
    if (contadores.some(c => c.dato.cuenta >= c.max) || (contadores[1].dato.ultima !== null && ahora - contadores[1].dato.ultima < cooldownMs)) return false;
    for (const c of contadores) this.limites.set(c.key, { ...c.dato, cuenta: c.dato.cuenta + 1, ultima: ahora });
    return true;
  }
  async revocarRecuperaciones(id, ahora) {
    for (const d of this.desafios.values()) if (d.usuarioId === id && d.proposito === "recuperacion" && d.consumidaEn === null && d.revocadaEn === null) d.revocadaEn = ahora;
  }
  async insertarDesafio(d) {
    if ([...this.desafios.values()].some(v => v.hash === d.hash)) throw new Error("Hash duplicado.");
    this.desafios.set(d.id, structuredClone(d));
  }
  async invitacionPendiente(email, idEmpresa, ahora) {
    return [...this.desafios.values()].some(d => d.proposito === "invitacion" && d.email === email && d.idEmpresa === idEmpresa &&
      d.consumidaEn === null && d.revocadaEn === null && d.expiraEn > ahora);
  }
  async desafio(hash, proposito) {
    return structuredClone([...this.desafios.values()].find(d => d.hash === hash && d.proposito === proposito) || null);
  }
  async consumir(id, ahora) {
    const d = this.desafios.get(id);
    if (!d || d.expiraEn <= ahora || d.consumidaEn !== null || d.revocadaEn !== null) return false;
    d.consumidaEn = ahora;
    return true;
  }
  async restablecerPassword({ usuarioId, passwordHash, versionSesion, nuevaVersionSesion, debeCambiarPassword }) {
    const u = this.filas.get(usuarioId);
    if (u.versionSesion !== versionSesion) throw new Error("Versión cambió.");
    await this.actualizar(usuarioId, u.versionRegistro, { passwordHash, debeCambiarPassword }, usuarioId, true);
    if (u.versionSesion !== nuevaVersionSesion) throw new Error("Sesión sin revocar.");
    return true;
  }
  async crearInvitado({ rol, emailVerificadoEn, versionContacto, actorId, ...datos }) {
    const u = await this.crear({ ...datos, actor: actorId, idRol: this.rolesDatos.find(r => r.nombre === rol && r.activo).idRol });
    Object.assign(this.filas.get(u.idUsuario), { debeCambiarPassword: false, emailVerificadoEn, versionContacto });
    return u.idUsuario;
  }
  async revocarInvitacion(id, idEmpresa, ahora) {
    const d = this.desafios.get(id);
    if (d?.proposito === "invitacion" && d.idEmpresa === idEmpresa && d.consumidaEn === null) d.revocadaEn = ahora;
  }
  async auditar(evento) {
    if (this.fallarAuditoria) throw new Error("Fallo simulado, no exponer.");
    this.auditoria.push(structuredClone(evento));
  }
  async encolar(entrega) {
    if (this.fallarOutbox) throw new Error("Outbox no disponible.");
    this.entregas.set(entrega.id, { ...structuredClone(entrega), estado: "pendiente", intentos: 0, proxima: 0 });
  }
  async reservarEntrega({ ahora, lease, leaseMs, maxIntentos }) {
    for (const e of this.entregas.values()) {
      if (!e.sobre) continue;
      const d = e.desafioId && this.desafios.get(e.desafioId);
      if (e.expiraEn <= ahora || (e.desafioId && (!d || d.revocadaEn !== null || d.consumidaEn !== null))) {
        e.estado = "descartada"; e.sobre = null; continue;
      }
      if (e.estado === "entregada" || e.intentos >= maxIntentos || e.proxima > ahora || (e.leaseHasta && e.leaseHasta > ahora)) continue;
      e.estado = "procesando"; e.intentos++; e.lease = lease; e.leaseHasta = ahora + leaseMs;
      return structuredClone(e);
    }
    return null;
  }
  async finalizarEntrega({ id, lease, exito, ahora, reintentoMs, maxIntentos }) {
    const e = this.entregas.get(id);
    if (!e || e.lease !== lease || e.leaseHasta <= ahora) return false;
    e.estado = exito ? "entregada" : "fallida"; e.leaseHasta = null; e.proxima = ahora + reintentoMs;
    if (exito || e.intentos >= maxIntentos) e.sobre = null;
    return true;
  }
}
module.exports = { CuentasComercialesAisladas };
