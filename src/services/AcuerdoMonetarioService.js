const {estadoMonedas,exigirMonedas}=require('../config/monedas');
const {AcuerdoMonetarioRepository}=require('../repositories/AcuerdoMonetarioRepository');
const {MonedasRepository}=require('../repositories/MonedasRepository');
const {ErrorSeguridad,validarCampos,validarRevision}=require('../security/seguridadUsuarios');
const {normalizarAcuerdo,presentarAcuerdo,validarReservaMonetaria}=require('../domain/acuerdosMonetarios');
const {fijarCheckin,fechaValida}=require('../domain/monedas');
class AcuerdoMonetarioService {
 constructor({estado=estadoMonedas,contexto=exigirMonedas,repository=op=>new AcuerdoMonetarioRepository(op),
  reservas=()=>require('../repositories/ReservaRepository'),eventos=()=>require('../repositories/ReservaEventoRepository'),
  cotizaciones=()=>require('./MonedasService').cotizaciones,reloj=()=>new Date()}={}){
  Object.assign(this,{estado,contexto,repository,reservas,eventos,cotizaciones,reloj});
 }
 exigir(escritura=false){
  if(!this.estado().reservas)throw new ErrorSeguridad(503,'MONEDAS_PENDIENTES','Los acuerdos monetarios de Reservas todavía no están habilitados.');
  return this.contexto(escritura);
 }
 prepararAlta(body,actor){
  if(body===undefined&&!this.estado().reservas)return null;
  this.exigir(true);this.validarActor(actor);return normalizarAcuerdo(body);
 }
 validarActor(actor){if(!Number.isInteger(actor?.idUsuario)||actor.idUsuario<1||!Number.isInteger(actor?.versionSesion)||actor.versionSesion<1)throw new ErrorSeguridad(403,'ACUERDO_AUTOR','Se requiere la identidad vigente del autor.');}
 async revalidar(contexto,actor,permisos){
  this.validarActor(actor);
  if(!contexto?.conexion||typeof contexto.conexion.request!=='function')throw new TypeError('El acuerdo requiere el contexto transaccional de Reservas.');
  await this.repository({conexion:contexto.conexion}).revalidarAutor(actor,permisos);
 }
 async leer(reserva,contexto){
  if(!this.estado().reservas||reserva.canal!=='Manual')return null;
  const {idEmpresa}=this.exigir();const repo=this.repository({conexion:contexto?.conexion||null});
  await repo.comprobarModelo(idEmpresa);return presentarAcuerdo(await repo.obtener(idEmpresa,reserva.idReserva),reserva);
 }
 async enriquecerReservas(reservas){
  if(!this.estado().reservas)return reservas;
  const {idEmpresa}=this.exigir(),repo=this.repository({});await repo.comprobarModelo(idEmpresa);
  const acuerdos=new Map((await repo.listar(idEmpresa)).map(a=>[a.idReserva,a]));
  return reservas.map(r=>r.canal==='Manual'&&acuerdos.has(r.idReserva)?{...r,acuerdoMonetario:presentarAcuerdo(acuerdos.get(r.idReserva),r)}:r);
 }
 async crearParaAlta(reserva,dato,actor,contexto){
  const {idEmpresa}=this.exigir(true);validarReservaMonetaria(reserva);await this.revalidar(contexto,actor,['reservas.crear']);
  const repo=this.repository({conexion:contexto.conexion});await repo.comprobarModelo(idEmpresa);
  return presentarAcuerdo(await repo.guardar(idEmpresa,reserva.idReserva,dato,actor.idUsuario),reserva);
 }
 async validarEdicion(reserva,datos,contexto){
  if(['acuerdoMonetario','monedaAcordada','importeAcordado','monedaPago','cotizacion'].some(campo=>Object.hasOwn(datos,campo)))throw new ErrorSeguridad(400,'ACUERDO_ENDPOINT','Revisá el acuerdo desde su acción monetaria; no se reemplaza al editar la estadía.');
  const acuerdo=await this.leer(reserva,contexto);
  if(acuerdo?.fijadoEn&&((datos.fechaIngreso&&datos.fechaIngreso!==reserva.fechaIngreso)||(datos.horaIngreso&&datos.horaIngreso!==reserva.horaIngreso)))
   throw new ErrorSeguridad(409,'ACUERDO_FIJADO','El check-in ya tiene una cotización fijada y no puede cambiarse silenciosamente.');
  return acuerdo;
 }
 async obtener(idReserva){
  this.exigir();const reserva=await this.reservas().obtenerPorId(idReserva);
  if(!reserva)throw new ErrorSeguridad(404,'RESERVA_NO_ENCONTRADA','La reserva no existe.');
  return this.leer(reserva);
 }
 async resumen(query){
  validarCampos(query,['fechaDesde','fechaHasta','idPropiedad','canal','estado'],['fechaDesde','fechaHasta']);
  if(!fechaValida(query.fechaDesde)||!fechaValida(query.fechaHasta)||query.fechaDesde>query.fechaHasta)throw new ErrorSeguridad(400,'VALIDACION','El periodo monetario no es válido.');
  if(query.idPropiedad!==undefined&&(!/^[1-9]\d{0,9}$/.test(query.idPropiedad)||Number(query.idPropiedad)>2147483647))throw new ErrorSeguridad(400,'VALIDACION','La propiedad indicada no es válida.');
  if(query.canal!==undefined&&!['Manual','Booking','Airbnb'].includes(query.canal))throw new ErrorSeguridad(400,'VALIDACION','El canal indicado no es válido.');
  if(query.estado!==undefined&&!['Pendiente','Confirmada','Cancelada','Finalizada','No show'].includes(query.estado))throw new ErrorSeguridad(400,'VALIDACION','El estado indicado no es válido.');
  if(!this.estado().reservas)return {disponible:false,motivo:'Los acuerdos monetarios no están activados. Las métricas operativas se conservan.'};
  const {idEmpresa}=this.exigir(),repo=this.repository({});await repo.comprobarModelo(idEmpresa);
  const filtros={fechaDesde:query.fechaDesde,fechaHasta:query.fechaHasta,idPropiedad:query.idPropiedad?Number(query.idPropiedad):null,canal:query.canal||null,estado:query.estado||null};
  const filas=await repo.resumen(idEmpresa,filtros),porMoneda=[];let sinMoneda=0n,total=0n;
  for(const r of filas){
   if(typeof r.cantidad!=='string'||!/^\d+$/.test(r.cantidad))throw new ErrorSeguridad(500,'MONEDAS_LECTURA_FINAL','Resumen incompleto.');
   total+=BigInt(r.cantidad);
   if(r.moneda===null){sinMoneda+=BigInt(r.cantidad);continue;}
   if(!['ARS','USD'].includes(r.moneda)||typeof r.importe!=='string'||!/^(0|[1-9]\d{0,35})\.\d{2}$/.test(r.importe))throw new ErrorSeguridad(500,'MONEDAS_LECTURA_FINAL','Totales monetarios incompatibles.');
   porMoneda.push({moneda:r.moneda,importe:r.importe,cantidad:r.cantidad});
  }
  return {disponible:true,criterio:'IMPORTES_ACORDADOS_ORIGINALES_SIN_COBROS',filtros,porMoneda:porMoneda.sort((a,b)=>a.moneda.localeCompare(b.moneda)),sinMoneda:String(sinMoneda),totalReservas:String(total),excluye:['Cancelada','No show']};
 }
 async guardar(idReserva,actor,body){
  const {idEmpresa}=this.exigir(true);this.validarActor(actor);validarCampos(body,['acuerdo','revision']);
  const dato=normalizarAcuerdo(body.acuerdo),version=body.revision===null?null:validarRevision(body.revision);
  return this.reservas().conReservaManualAtomica(idReserva,async contexto=>{
   const reserva=await contexto.obtenerPorId(idReserva);validarReservaMonetaria(reserva);
   await this.revalidar(contexto,actor,['reservas.modificar','reservas.importes']);
   const repo=this.repository({conexion:contexto.conexion});await repo.comprobarModelo(idEmpresa);
   const anterior=await repo.obtener(idEmpresa,idReserva);
   if(anterior?.fijadoEn)throw new ErrorSeguridad(409,'ACUERDO_FIJADO','La cotización fijada es inmutable.');
   if((anterior&&version===null)||(!anterior&&version!==null))throw new ErrorSeguridad(409,'ACUERDO_CONFLICTO','El acuerdo cambió. Recargá los datos.');
   const resultado=presentarAcuerdo(await repo.guardar(idEmpresa,idReserva,dato,actor.idUsuario,version),reserva);
   await this.historial(contexto,idReserva,'Acuerdo monetario confirmado','ACUERDO_CONFIRMADO',anterior,resultado);
   return resultado;
  });
 }
 async fijar(idReserva,actor,body){
  const {idEmpresa}=this.exigir(true);this.validarActor(actor);
  validarCampos(body,['revision','confirmar','cotizacionId','confirmarManual','aceptarUltimaOficial'],['revision','confirmar']);
  const version=validarRevision(body.revision);
  if(body.confirmar!==true||(Object.hasOwn(body,'aceptarUltimaOficial')&&typeof body.aceptarUltimaOficial!=='boolean'))throw new ErrorSeguridad(400,'ACUERDO_CONFIRMACION','Confirmá explícitamente la fijación.');
  return this.reservas().conReservaManualAtomica(idReserva,async contexto=>{
   const reserva=await contexto.obtenerPorId(idReserva);validarReservaMonetaria(reserva);
   await this.revalidar(contexto,actor,['reservas.modificar','reservas.importes']);
   const repo=this.repository({conexion:contexto.conexion});await repo.comprobarModelo(idEmpresa);
   const acuerdo=await repo.obtener(idEmpresa,idReserva);
   if(!acuerdo||acuerdo.fijadoEn||acuerdo.versionRegistro!==version)throw new ErrorSeguridad(409,'ACUERDO_CONFLICTO','El acuerdo cambió o ya está fijado. Recargá los datos.');
   let cotizacion;
   if(acuerdo.fuenteReferencia==='BCRA')cotizacion=this.cotizaciones().vigente(body.cotizacionId);
   else if(acuerdo.fuenteReferencia==='MANUAL'){
    if(body.confirmarManual!==true)throw new ErrorSeguridad(400,'ACUERDO_CONFIRMACION','Confirmá nuevamente la advertencia de la cotización manual.');
    const monedas=new MonedasRepository({request:async()=>contexto.conexion.request()});await monedas.comprobarModelo(idEmpresa);cotizacion=await monedas.configuracion(idEmpresa);
   }
   if(!cotizacion||cotizacion.fuente!==acuerdo.fuenteReferencia||cotizacion.tipo!==acuerdo.tipoReferencia)throw new ErrorSeguridad(409,'ACUERDO_FUENTE','La fuente no coincide con el acuerdo. Revisá la configuración antes de fijar.');
   const snapshot=fijarCheckin({canal:reserva.canal,moneda:acuerdo.moneda,importe:acuerdo.importe,pagoEquivalenteARS:acuerdo.pagoEquivalenteARS,
    fechaIngreso:reserva.fechaIngreso,cotizacion,aceptarUltimaOficial:body.aceptarUltimaOficial,ahora:this.reloj()});
   const resultado=presentarAcuerdo(await repo.fijar(idEmpresa,idReserva,snapshot,actor.idUsuario,version),reserva);
   await this.historial(contexto,idReserva,'Cotización del check-in fijada','COTIZACION_CHECKIN_FIJADA',acuerdo,resultado);
   return resultado;
  });
 }
 async historial(contexto,idReserva,titulo,motivoMonetario,anterior,actual){
  const evento=await this.eventos().crearEvento({idReserva,tipo:'RESERVA_MODIFICADA',titulo,descripcion:'Confirmación explícita del acuerdo monetario. No registra pagos ni modifica el importe original por movimientos del dólar.',origen:'Manual',datosJson:{motivoMonetario,anterior,actual}},contexto.conexion);
  if(!evento||evento.idReserva!==idReserva||evento.tipo!=='RESERVA_MODIFICADA')throw new ErrorSeguridad(500,'MONEDAS_HISTORIAL','No se pudo confirmar el historial monetario.');
 }
}
module.exports=new AcuerdoMonetarioService();module.exports.AcuerdoMonetarioService=AcuerdoMonetarioService;
