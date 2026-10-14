const bcrypt = require("bcryptjs");
const { randomBytes } = require("node:crypto");
const { errorPersistencia } = require("../../src/security/seguridadUsuarios");

// Doble local: no importa database.js ni dotenv. IDs de roles diferentes de Azure.
class UsuariosAislados {
  constructor() {
    this.filas = new Map();
    this.rolesDatos = [{ idRol: 41, nombre: "Administrador", activo: true },
      { idRol: 73, nombre: "Operador", activo: true }, { idRol: 92, nombre: "Propietario", activo: true }];
    this.lecturas = 0;
    this.escrituras = 0;
    this.numeroRevision = 0;
    this.cola = Promise.resolve();
    this.roles = {
      resolverActivo: async (nombre) => this.rolesDatos.find((r) => r.nombre === nombre && r.activo && ["Administrador", "Operador"].includes(nombre)) || null,
      listarAsignables: async () => this.rolesDatos.filter((r) => r.activo && ["Administrador", "Operador"].includes(r.nombre)).map(({ nombre }) => ({ nombre })),
    };
  }
  revision() { return (++this.numeroRevision).toString(16).padStart(16, "0"); }
  async agregar({ id, rol = "Administrador", estado = "Activo", obligatorio = false } = {}) {
    const password = randomBytes(20).toString("hex");
    const fila = { idUsuario: id || this.filas.size + 1, nombre: "Cuenta aislada", email: `${id || this.filas.size + 1}@example.invalid`,
      rol, rolActivo: true, estado, debeCambiarPassword: obligatorio, versionSesion: 1,
      versionRegistro: this.revision(), passwordHash: await bcrypt.hash(password, 4) };
    this.filas.set(fila.idUsuario, fila);
    return { usuario: this.copia(fila), password };
  }
  copia(fila, credenciales = false) {
    if (!fila) return null;
    const copia = { ...fila, rolActivo: Boolean(this.rolesDatos.find((r) => r.nombre === fila.rol)?.activo) };
    if (!credenciales) delete copia.passwordHash;
    return copia;
  }
  async obtener(id, { credenciales = false } = {}) { this.lecturas++; return this.copia(this.filas.get(id), credenciales); }
  async buscarPorEmail(email) { this.lecturas++; return this.copia([...this.filas.values()].find((u) => u.email === email), true); }
  async contarAdministradoresActivos() { return [...this.filas.values()].filter((u) => u.rol === "Administrador" && u.estado === "Activo" && this.rolesDatos[0].activo).length; }
  async estaVacia() { return this.filas.size === 0; }
  async listar({ pagina = 1, limite = 25, busqueda = "", estado = "" } = {}) {
    const filas = [...this.filas.values()].filter((u) => (!estado || u.estado === estado) && (u.nombre.includes(busqueda) || u.email.includes(busqueda)));
    return { usuarios: filas.slice((pagina - 1) * limite, pagina * limite).map((u) => this.copia(u)), total: filas.length, pagina, limite };
  }
  async crear({ nombre, email, passwordHash, idRol, actor = null }) {
    if ([...this.filas.values()].some((u) => u.email.toLowerCase().trim() === email.toLowerCase().trim())) throw { number: 2627 };
    const idUsuario = Math.max(0, ...this.filas.keys()) + 1;
    const fila = { idUsuario, nombre, email, passwordHash, idRol, rol: this.rolesDatos.find((r) => r.idRol === idRol).nombre,
      estado: "Activo", debeCambiarPassword: true, versionSesion: 1, versionRegistro: this.revision(), actor };
    this.filas.set(idUsuario, fila); this.escrituras++;
    return this.copia(fila);
  }
  async actualizar(id, revision, cambios, actor, revocar = false) {
    const fila = this.filas.get(id);
    if (!fila || fila.versionRegistro !== revision) throw Object.assign(new Error("Revisión vencida"), { status: 409 });
    if (cambios.email && [...this.filas.values()].some((u) => u.idUsuario !== id && u.email === cambios.email)) throw { number: 2601 };
    Object.assign(fila, cambios, { actor, versionRegistro: this.revision() });
    if (cambios.idRol) fila.rol = this.rolesDatos.find((r) => r.idRol === cambios.idRol).nombre;
    if (revocar) fila.versionSesion++;
    this.escrituras++;
    return this.copia(fila);
  }
  async transaccionSeguridad(callback) {
    const previa = this.cola;
    let liberar;
    this.cola = new Promise((resolve) => { liberar = resolve; });
    await previa;
    const snapshot = new Map([...this.filas].map(([id, u]) => [id, { ...u }]));
    try { return await callback(this); }
    catch (error) { this.filas = snapshot; throw errorPersistencia(error); }
    finally { liberar(); }
  }
}
module.exports = { UsuariosAislados };
