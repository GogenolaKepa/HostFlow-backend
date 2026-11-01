const { randomUUID } = require("node:crypto");
const {ErrorSeguridad}=require('../seguridadUsuarios');
const {normalizarEmail}=require('../seguridadUsuarios');

// Worker invocado explícitamente. Sin timers, red ni proveedor por defecto.
class EntregaCorreoSeguridad {
  constructor({ repository, protector, proveedor, ahora = Date.now, limiteDiario=100, eventos=null, indiceDestino } = {}) {
    if (typeof repository?.transaccion !== "function" || typeof protector?.abrir !== "function" ||
        typeof proveedor?.enviar !== "function" || !Number.isInteger(limiteDiario) || limiteDiario<1 || limiteDiario>100000) throw new TypeError("Faltan adaptadores de entrega.");
    if(eventos!==null&&(eventos.persistencia!=='sql-durable'||typeof eventos.prepararMensaje!=='function'||typeof eventos.vincularAceptacion!=='function'||typeof indiceDestino!=='function'))throw TypeError('Correlación durable no acreditada.');
    Object.assign(this, { repository, protector, proveedor, ahora,limiteDiario,eventos,indiceDestino });
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
      // El destino no puede cambiar entre reintentos de la misma idempotency key.
      // Comprobar supresión también inmediatamente antes del POST del proveedor.
      const antesDeEnviar=async()=>{
        if(!await this.repository.transaccion(async tx=>{
          if(!await tx.entregaVigente({id:entrega.id,lease,ahora:this.ahora()}))return false;
          // Durable antes de TODO envío, incluso sin el módulo opcional de eventos.
          // Una caída después del POST no debe borrar evidencia como "no enviada".
          return tx.marcarEntregaEnCurso({id:entrega.id,lease,ahora:this.ahora()});
        }))return false;
        if(this.eventos){
          const destino=this.indiceDestino(normalizarEmail(payload.destinatario));
          const r=await this.eventos.prepararMensaje({outboxId:entrega.id,lease,destino});
          if(r?.estado==='bloqueado')throw Object.assign(Error('Destino suprimido.'),{codigo:'DESTINO_SUPRIMIDO',politica:'cuarentena'});
          if(r?.estado!=='preparado')throw Object.assign(Error('Correlación no acreditada.'),{codigo:'EVENTOS_RESULTADO_INCIERTO'});
        }
        return true;
      };
      if(!await antesDeEnviar())return {estado:'no-enviada'};
      const aceptacion=await this.proveedor.enviar({ ...payload, idempotencyKey: entrega.id },{antesDeEnviar});
      if(this.eventos){
        // Si la API ya aceptó pero no se pudo acreditar la asociación durable,
        // pausar sin finalizar ni volver a enviar: inspección/reconciliación manual.
        try{
          const r=await this.eventos.vincularAceptacion({outboxId:entrega.id,proveedorId:aceptacion?.id});
          if(r?.estado!=='vinculado')return {estado:'resultado-incierto'};
        }
        catch{return {estado:'resultado-incierto'};}
      }
      exito = true;
    } catch(e) {
      if(['CUENTAS_RESULTADO_INCIERTO','AUTH_TRANSACCION_REVERTIDA','VIGENCIA_NO_ACREDITADA','EVENTOS_RESULTADO_INCIERTO','MODELO_EVENTOS_NO_ACREDITADO','LEASE_NO_ACREDITADO','CORRELACION_INCOMPATIBLE'].includes(e.codigo))return {estado:'resultado-incierto'};
      if(e.codigo==='ENTREGA_OBSOLETA')return {estado:'no-enviada'};
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
