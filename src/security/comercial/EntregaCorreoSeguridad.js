const { randomUUID } = require("node:crypto");
const {ErrorSeguridad}=require('../seguridadUsuarios');

// Worker invocado explícitamente. Sin timers, red ni proveedor por defecto.
class EntregaCorreoSeguridad {
  constructor({ repository, protector, proveedor, ahora = Date.now, limiteDiario=100 } = {}) {
    if (typeof repository?.transaccion !== "function" || typeof protector?.abrir !== "function" ||
        typeof proveedor?.enviar !== "function" || !Number.isInteger(limiteDiario) || limiteDiario<1 || limiteDiario>100000) throw new TypeError("Faltan adaptadores de entrega.");
    Object.assign(this, { repository, protector, proveedor, ahora,limiteDiario });
  }
  async procesarUna() {
    const lease = randomUUID();
    let entrega;
    try {
      entrega = await this.repository.transaccion(async tx => {
        const e=await tx.reservarEntrega({ ahora: this.ahora(), lease, leaseMs: 120_000, maxIntentos: 3 });
        if(!e) return null;
        // Presupuesto durable compartido por workers. El rechazo revierte también el lease.
        if(!await tx.admitir({proposito:'correo-salida',ahora:this.ahora(),ip:'worker',destino:'worker',ventanaMs:86400000,
          maxIp:this.limiteDiario,maxDestino:this.limiteDiario,maxGlobal:this.limiteDiario,cooldownMs:0})) {
          throw new ErrorSeguridad(429,'CUOTA_CORREO','Presupuesto de entrega agotado.');
        }
        return e;
      });
    }catch(e){if(e instanceof ErrorSeguridad && e.codigo==='CUOTA_CORREO')return {estado:'limite-alcanzado'};throw e;}
    if (!entrega) return { estado: "sin-pendientes" };
    let exito = false,cuarentena=false,codigo=null;
    let reintentoMs=entrega.intentos>=2?300000:60000;
    try {
      const payload = this.protector.abrir(entrega.sobre, entrega.id);
      await this.proveedor.enviar({ ...payload, idempotencyKey: entrega.id });
      exito = true;
    } catch(e) {
      // Clasificación cerrada. Nunca guardar mensajes del proveedor ni payload.
      cuarentena=e.politica==='cuarentena'||['SOBRE_CORREO_INVALIDO','CLAVE_CORREO_NO_DISPONIBLE'].includes(e.codigo);
      codigo=e.codigo==='SOBRE_CORREO_INVALIDO'?'SOBRE_INVALIDO':e.codigo==='CLAVE_CORREO_NO_DISPONIBLE'||['CORREO_INACTIVO','CONFIGURACION_CORREO_INVALIDA'].includes(e.codigo)?'CONFIGURACION':
        cuarentena?'PROVEEDOR_PERMANENTE':e.codigo==='PROVEEDOR_NO_ACEPTO'?'TRANSITORIO':'RESULTADO_INCIERTO';
      if(Number.isFinite(e.demoraMs))reintentoMs=Math.max(reintentoMs,Math.min(900000,Math.max(60000,e.demoraMs)));
    }
    const finalizada = await this.repository.transaccion(tx => tx.finalizarEntrega({ id: entrega.id, lease, exito,
      ahora: this.ahora(), reintentoMs, maxIntentos: 3,cuarentena,codigo }));
    return { estado: finalizada ? (codigo==='CONFIGURACION'?'pausada-configuracion':exito ? "entregada" : "fallida") : "resultado-incierto" };
  }
}
module.exports = { EntregaCorreoSeguridad };
