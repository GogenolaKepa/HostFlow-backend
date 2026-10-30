const { randomUUID } = require("node:crypto");

// Worker invocado explícitamente. Sin timers, red ni proveedor por defecto.
class EntregaCorreoSeguridad {
  constructor({ repository, protector, proveedor, ahora = Date.now } = {}) {
    if (typeof repository?.transaccion !== "function" || typeof protector?.abrir !== "function" ||
        typeof proveedor?.enviar !== "function") throw new TypeError("Faltan adaptadores de entrega.");
    Object.assign(this, { repository, protector, proveedor, ahora });
  }
  async procesarUna() {
    const lease = randomUUID();
    const entrega = await this.repository.transaccion(tx => tx.reservarEntrega({ ahora: this.ahora(), lease, leaseMs: 120_000, maxIntentos: 3 }));
    if (!entrega) return { estado: "sin-pendientes" };
    let exito = false;
    try {
      const payload = this.protector.abrir(entrega.sobre, entrega.id);
      await this.proveedor.enviar({ ...payload, idempotencyKey: entrega.id });
      exito = true;
    } catch { /* No registrar mensajes del proveedor ni el contenido sensible. */ }
    const finalizada = await this.repository.transaccion(tx => tx.finalizarEntrega({ id: entrega.id, lease, exito,
      ahora: this.ahora(), reintentoMs: 60_000, maxIntentos: 3 }));
    return { estado: finalizada ? (exito ? "entregada" : "fallida") : "resultado-incierto" };
  }
}
module.exports = { EntregaCorreoSeguridad };
