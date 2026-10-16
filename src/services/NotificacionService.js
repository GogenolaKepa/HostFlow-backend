const { AVISOS, TIPOS_PREFERENCIA, PRIORIDADES_PERSONALES, prioridadAviso, PERMISO_POR_TIPO } = require('../config/notificaciones');
const { filtrosAvisos, validarPreferencias, filtrosPersonales, idPersonal } = require('../security/validacionNotificaciones');
const { ErrorSeguridad, esUsuarioHabilitado, sesionInvalida, validarCampos, validarRevision } = require('../security/seguridadUsuarios');
const { tienePermiso } = require('../config/permisos');
const { NotificacionRepository } = require('../repositories/NotificacionRepository');

function contextoNotificaciones(escritura=false,env=process.env) {
  if(env.HOSTFLOW_NOTIFICACIONES_SQL_ENABLED!=='1'||env.HOSTFLOW_AUTH_SOURCE!=='sql')
    throw new ErrorSeguridad(503,'NOTIFICACIONES_NO_ACTIVADAS','Las preferencias de notificaciones todavía no están activadas.');
  if(escritura&&env.HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED!=='1')
    throw new ErrorSeguridad(503,'NOTIFICACIONES_SOLO_LECTURA','El guardado de preferencias todavía no está habilitado.');
  if(typeof env.HOSTFLOW_EMPRESA_ID!=='string'||!/^[1-9]\d{0,9}$/.test(env.HOSTFLOW_EMPRESA_ID)||Number(env.HOSTFLOW_EMPRESA_ID)>2147483647)
    throw new ErrorSeguridad(503,'NOTIFICACIONES_MODELO_PENDIENTE','Falta preparar la vinculación de notificaciones.');
  return {idEmpresa:Number(env.HOSTFLOW_EMPRESA_ID),soloLectura:env.HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED!=='1'};
}
function dtoPreferencias(filas) {
  if(!Array.isArray(filas)||new Set(filas.map(f=>f.tipo)).size!==filas.length||filas.some(f=>!TIPOS_PREFERENCIA.includes(f.tipo)))
    throw new ErrorSeguridad(503,'NOTIFICACIONES_NO_DISPONIBLES','Las preferencias no están disponibles.');
  return TIPOS_PREFERENCIA.map(tipo=>{
    const row=filas.find(f=>f.tipo===tipo);
    const revision=Buffer.isBuffer(row?.versionRegistro)?row.versionRegistro.toString('hex'):row?.versionRegistro;
    if(row&&(typeof row.habilitada!=='boolean'||!/^[a-f0-9]{16}$/i.test(revision)))throw new ErrorSeguridad(503,'NOTIFICACIONES_NO_DISPONIBLES','Las preferencias no están disponibles.');
    return {tipo,habilitada:row?.habilitada??false,versionRegistro:revision??null,persistida:Boolean(row)};
  });
}
class NotificacionService {
  constructor({repository=new NotificacionRepository(),contexto=contextoNotificaciones,personales=()=>process.env.HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED==='1'}={}){this.repository=repository;this.contexto=contexto;this.personales=personales;}
  contextoPersonal(escritura=false){
    if(!this.personales())throw new ErrorSeguridad(503,'NOTIFICACIONES_PERSONALES_NO_ACTIVADAS','La bandeja personal todavía no está activada.');
    return this.contexto(escritura);
  }
  async validarActor(repo,actor){
    const actual=await repo.usuarios.obtener(actor.idUsuario);
    if(!esUsuarioHabilitado(actual)||actual.versionSesion!==actor.versionSesion||actual.rol!==actor.rol)throw sesionInvalida();
    if(actual.debeCambiarPassword)throw new ErrorSeguridad(403,'PASSWORD_CHANGE_REQUIRED','Debe cambiar su contraseña para continuar.');
  }
  tiposPersonales(actor){
    return TIPOS_PREFERENCIA.filter(tipo=>tienePermiso(actor,PERMISO_POR_TIPO[tipo]));
  }
  async personalesListado(actor,query){
    const {idEmpresa}=this.contextoPersonal(),filtros=filtrosPersonales(query);
    await this.repository.comprobarModelo(idEmpresa,true);
    const resultado=await this.repository.listarPersonales(actor.idUsuario,idEmpresa,filtros,this.tiposPersonales(actor));
    await this.validarActor(this.repository,actor);
    const mas=resultado.filas.length>filtros.limite,filas=resultado.filas.slice(0,filtros.limite);
    const notificaciones=filas.map(f=>this.dtoPersonal(f));
    return {notificaciones,siguiente:mas?Buffer.from(JSON.stringify({hasta:resultado.hasta,antes:filas.at(-1).idEntrega})).toString('base64url'):null,origen:'personal_sql'};
  }
  dtoPersonal(f){
    try{
    idPersonal(f.idNotificacion);idPersonal(f.idEntrega);
    if(!TIPOS_PREFERENCIA.includes(f.tipo)||!PRIORIDADES_PERSONALES.includes(f.prioridad))throw new Error('Contrato SQL inválido');
    const fecha=v=>{const d=v?new Date(v):null;if(!d||!Number.isFinite(d.getTime()))throw new Error('Fecha SQL inválida');return d.toISOString();};
    return {idNotificacion:f.idNotificacion,tipo:f.tipo,prioridad:f.prioridad,fecha:fecha(f.fecha),leida:f.fechaLectura!==null,fechaLectura:f.fechaLectura===null?null:fecha(f.fechaLectura),versionRegistro:validarRevision(Buffer.isBuffer(f.versionRegistro)?f.versionRegistro.toString('hex'):f.versionRegistro)};
    }catch{throw new ErrorSeguridad(503,'NOTIFICACIONES_NO_DISPONIBLES','La notificación no está disponible.');}
  }
  async personalesContador(actor,query){
    const {idEmpresa}=this.contextoPersonal();validarCampos(query,[],[]);await this.repository.comprobarModelo(idEmpresa,true);
    const noLeidas=await this.repository.contarPersonales(actor.idUsuario,idEmpresa,this.tiposPersonales(actor));
    await this.validarActor(this.repository,actor);if(!Number.isSafeInteger(noLeidas)||noLeidas<0)throw new Error('Contador SQL inválido');return {noLeidas};
  }
  async personalLectura(actor,id,body,query){
    const {idEmpresa}=this.contextoPersonal(true);validarCampos(query,[],[]);idPersonal(id);validarCampos(body,['versionRegistro']);const revision=validarRevision(body.versionRegistro);
    return this.repository.transaccion(async tx=>{await this.validarActor(tx,actor);await tx.comprobarModelo(idEmpresa,true);const fila=await tx.marcarPersonalLeida(actor.idUsuario,idEmpresa,id,revision,this.tiposPersonales(actor));return {notificacion:this.dtoPersonal(fila)};});
  }
  async avisos(actor,query) {
    if(!tienePermiso(actor,'alertas.ver'))throw new ErrorSeguridad(403,'SIN_PERMISO','No tiene permiso para consultar estos avisos.');
    const filtros=filtrosAvisos(query),{filas,total,totalSinFiltros=total}=await this.repository.avisos(filtros);
    const avisos=filas.filter(f=>Object.hasOwn(AVISOS,f.tipo)).map(f=>{
      const fecha=f.fecha?new Date(f.fecha):null;
      return {idAviso:f.idAlerta,tipo:f.tipo,...AVISOS[f.tipo],prioridad:prioridadAviso(f.prioridad),
        fecha:fecha&&Number.isFinite(fecha.getTime())?fecha.toISOString():null,destino:{seccion:'alertas'}};
    });
    return {avisos,paginacion:{...filtros,total,totalSinFiltros,paginas:Math.max(1,Math.ceil(total/filtros.limite))},origen:'alertas_persistidas',lecturaPersonal:false};
  }
  async preferencias(actor) {
    const {idEmpresa,soloLectura}=this.contexto();await this.repository.comprobarModelo(idEmpresa);
    const preferencias=dtoPreferencias(await this.repository.preferencias(actor.idUsuario));
    await this.validarActor(this.repository,actor);
    return {preferencias,estado:{persistencia:'sql',soloLectura}};
  }
  async guardar(actor,body) {
    const {idEmpresa}=this.contexto(true),preferencias=validarPreferencias(body);
    return this.repository.transaccion(async tx=>{
      await this.validarActor(tx,actor);
      await tx.comprobarModelo(idEmpresa);
      const guardadas=dtoPreferencias(await tx.guardarPreferencias(actor.idUsuario,preferencias));
      if(guardadas.some(p=>!p.persistida||p.habilitada!==preferencias.find(x=>x.tipo===p.tipo).habilitada))
        throw new ErrorSeguridad(503,'NOTIFICACIONES_NO_DISPONIBLES','No se pudo confirmar el guardado de preferencias.');
      return {preferencias:guardadas,estado:{persistencia:'sql',soloLectura:false}};
    });
  }
}
module.exports=new NotificacionService();module.exports.NotificacionService=NotificacionService;module.exports.contextoNotificaciones=contextoNotificaciones;
