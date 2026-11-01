const {ErrorSeguridad}=require('../security/seguridadUsuarios');
const PRIORIDAD=Object.freeze({'email.sent':10,'email.delivery_delayed':20,'email.delivered':30,'email.failed':40,'email.bounced':50,'email.suppressed':60,'email.complained':70});
const BLOQUEAN=new Set(['email.bounced','email.suppressed','email.complained']);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const fallo=(codigo='EVENTOS_RESULTADO_INCIERTO')=>new ErrorSeguridad(503,codigo,'No se pudo acreditar el estado del correo.');
// Adaptador optativo del MISMO puerto transaccional comercial. No abre conexiones,
// no obtiene secretos, no monta webhook ni se incorpora al runtime operativo.
class EventosCorreoSql{
  constructor({repository,habilitado=false}={}){
    if(typeof repository?.transaccion!=='function')throw TypeError('Puerto SQL transaccional explícito obligatorio.');
    this.repository=repository;this.habilitado=habilitado;this.persistencia='sql-durable';
  }
  async transaccion(fn){
    if(this.habilitado!==true)throw fallo('EVENTOS_INACTIVOS');
    try{return await this.repository.transaccion(async tx=>{
      const r=await tx.q("SELECT CONVERT(nvarchar(80),value) AS modelo FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthEventos';");
      if(r.recordset[0]?.modelo!=='authcom-eventos-v1')throw fallo('MODELO_EVENTOS_NO_ACREDITADO');
      return fn(tx);
    });}catch(e){throw e instanceof ErrorSeguridad?e:fallo();}
  }
  async prepararMensaje({outboxId,lease,destino}={}){
    if(!uuid(outboxId)||!uuid(lease)||!Buffer.isBuffer(destino)||destino.length!==32)throw TypeError('Mensaje no válido.');
    // Snapshot antes de esperar, para que el destino no pueda mutar mientras tanto.
    destino=Buffer.from(destino);
    return this.transaccion(async tx=>{
      const leaseVivo=await tx.q(`SELECT Id FROM authcom.Outbox WITH(UPDLOCK,HOLDLOCK) WHERE Id=@outboxId AND Lease=@lease
        AND Estado='procesando' AND EnCuarentena=0 AND LeaseHasta>DATEADD(second,30,SYSUTCDATETIME()) AND ExpiraEn>SYSUTCDATETIME();`,{outboxId,lease});
      if(leaseVivo.recordset.length!==1)throw fallo('LEASE_NO_ACREDITADO');
      if((await tx.q('SELECT Destino FROM authcom.CorreoBloqueos WITH(UPDLOCK,HOLDLOCK) WHERE Destino=@destino;',{destino})).recordset.length)return {estado:'bloqueado'};
      const previo=await tx.q('SELECT Destino FROM authcom.CorreoMensajes WITH(UPDLOCK,HOLDLOCK) WHERE OutboxId=@outboxId;',{outboxId});
      if(previo.recordset.length){if(!Buffer.isBuffer(previo.recordset[0].Destino)||!previo.recordset[0].Destino.equals(destino))throw fallo('CORRELACION_INCOMPATIBLE');}
      else await tx.q('INSERT authcom.CorreoMensajes(OutboxId,Destino) VALUES(@outboxId,@destino);',{outboxId,destino});
      // La marca durable preenvío pertenece al worker común, también sin eventos.
      return {estado:'preparado'};
    });
  }
  async #aplicar(tx,m,e){
    await tx.q(`UPDATE authcom.CorreoMensajes SET Prioridad=@prioridad,Estado=@tipo,EstadoEn=@fecha WHERE OutboxId=@outboxId
      AND (Prioridad<@prioridad OR Prioridad=@prioridad AND (EstadoEn IS NULL OR EstadoEn<@fecha));`,
    {outboxId:m.OutboxId,prioridad:PRIORIDAD[e.Tipo],tipo:e.Tipo,fecha:new Date(e.OcurridoEn)});
    if(BLOQUEAN.has(e.Tipo))await tx.q(`INSERT authcom.CorreoBloqueos(Destino,Tipo,Fecha,EventoId)
      SELECT @destino,@tipo,@fecha,@evento WHERE NOT EXISTS(SELECT 1 FROM authcom.CorreoBloqueos WITH(UPDLOCK,HOLDLOCK) WHERE Destino=@destino);`,
    {destino:m.Destino,tipo:e.Tipo,fecha:new Date(e.OcurridoEn),evento:e.EventoId});
    await tx.q('UPDATE authcom.CorreoEventos SET OutboxId=@outboxId,AplicadoEn=SYSUTCDATETIME() WHERE EventoId=@evento AND AplicadoEn IS NULL;',{outboxId:m.OutboxId,evento:e.EventoId});
  }
  async registrarEventoCorreo(v){
    if(typeof v?.eventoId!=='string'||!/^msg_[A-Za-z0-9_-]{1,120}$/.test(v.eventoId)||!uuid(v.proveedorId)||!Object.hasOwn(PRIORIDAD,v.tipo)||
      typeof v.huella!=='string'||!/^[a-f0-9]{64}$/.test(v.huella)||typeof v.ocurridoEn!=='string'||!Number.isFinite(Date.parse(v.ocurridoEn)))throw TypeError('Evento no válido.');
    const e={EventoId:v.eventoId,ProveedorId:v.proveedorId,Tipo:v.tipo,OcurridoEn:new Date(v.ocurridoEn),Huella:Buffer.from(v.huella,'hex')};
    return this.transaccion(async tx=>{
      const previo=await tx.q('SELECT Huella FROM authcom.CorreoEventos WITH(UPDLOCK,HOLDLOCK) WHERE EventoId=@evento;',{evento:e.EventoId});
      if(previo.recordset.length){if(!Buffer.isBuffer(previo.recordset[0].Huella)||!previo.recordset[0].Huella.equals(e.Huella))throw fallo('EVENTO_INCOMPATIBLE');return {estado:'duplicado'};}
      await tx.q('INSERT authcom.CorreoEventos(EventoId,ProveedorId,Huella,Tipo,OcurridoEn) VALUES(@evento,@proveedor,@huella,@tipo,@fecha);',
        {evento:e.EventoId,proveedor:e.ProveedorId,huella:e.Huella,tipo:e.Tipo,fecha:e.OcurridoEn});
      const r=await tx.q('SELECT OutboxId,Destino FROM authcom.CorreoMensajes WITH(UPDLOCK,HOLDLOCK) WHERE ProveedorId=@proveedor;',{proveedor:e.ProveedorId});
      if(!r.recordset.length)return {estado:'sin-correlacion'};
      await this.#aplicar(tx,r.recordset[0],e);return {estado:'registrado'};
    });
  }
  async vincularAceptacion({outboxId,proveedorId}={}){
    if(!uuid(outboxId)||!uuid(proveedorId))throw TypeError('Correlación no válida.');
    return this.transaccion(async tx=>{
      const r=await tx.q('SELECT OutboxId,Destino,ProveedorId FROM authcom.CorreoMensajes WITH(UPDLOCK,HOLDLOCK) WHERE OutboxId=@outboxId;',{outboxId});
      const m=r.recordset[0];if(!m||m.ProveedorId&&m.ProveedorId.toLowerCase()!==proveedorId.toLowerCase())throw fallo('CORRELACION_INCOMPATIBLE');
      if(!m.ProveedorId)await tx.q('UPDATE authcom.CorreoMensajes SET ProveedorId=@proveedor WHERE OutboxId=@outboxId AND ProveedorId IS NULL;',{outboxId,proveedor:proveedorId});
      // Lote acotado. Volver a invocar con la MISMA correlación drena el resto,
      // nunca otro POST de email ni otra asociación de un ID desconocido a ciegas.
      const pendientes=await tx.q('SELECT TOP(101) EventoId,Tipo,OcurridoEn FROM authcom.CorreoEventos WITH(UPDLOCK,HOLDLOCK) WHERE ProveedorId=@proveedor AND AplicadoEn IS NULL ORDER BY OcurridoEn,EventoId;',{proveedor:proveedorId});
      for(const e of pendientes.recordset.slice(0,100))await this.#aplicar(tx,m,e);
      return {estado:'vinculado',aplicados:Math.min(100,pendientes.recordset.length),hayMas:pendientes.recordset.length>100};
    });
  }
}
module.exports={EventosCorreoSql};
