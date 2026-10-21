const {MonedasRepository}=require('../repositories/MonedasRepository');
const {CotizacionService,FUENTES}=require('./CotizacionService');
const {estadoMonedas,exigirMonedas}=require('../config/monedas');
const {validarCampos,ErrorSeguridad,validarRevision}=require('../security/seguridadUsuarios');
const {MONEDAS,decimal,unidades,cotizacionValida,fechaNegocio,alertaTarifa}=require('../domain/monedas');
const ADVERTENCIA_MANUAL='Esta cotización fue establecida manualmente por el administrador y puede diferir de los valores publicados por entidades financieras. HostFlow no verifica su exactitud. Se recomienda utilizar fuentes oficiales y revisar los importes antes de confirmar operaciones.';
class MonedasService {
 constructor({repository=new MonedasRepository(),cotizaciones=new CotizacionService(),contexto=exigirMonedas,estado=estadoMonedas,reloj=()=>new Date(),propiedades=()=>require('../repositories/PropiedadRepository')}={}) {this.repository=repository;this.cotizaciones=cotizaciones;this.contexto=contexto;this.estadoActual=estado;this.reloj=reloj;this.propiedades=propiedades;}
 estado(){return {...this.estadoActual(),fechaNegocio:fechaNegocio(this.reloj()),fuentes:FUENTES,advertenciaManual:ADVERTENCIA_MANUAL};}
 async configuracion(){const {idEmpresa}=this.contexto();await this.repository.comprobarModelo(idEmpresa);return this.repository.configuracion(idEmpresa);}
 async tarifas(){const {idEmpresa}=this.contexto();await this.repository.comprobarModelo(idEmpresa);return this.repository.tarifas(idEmpresa);}
 async guardar(actor,body){
  const {idEmpresa}=this.contexto(true);validarCampos(body,['fuente','valor','cotizacionId','confirmarManual','revision'],['fuente','revision']);
  const version=body.revision===null?null:validarRevision(body.revision);let dato;
  if(body.fuente==='MANUAL'){
   if(body.confirmarManual!==true)throw new ErrorSeguridad(400,'MONEDAS_CONFIRMACION','Confirmá explícitamente la cotización manual y su advertencia.');
   if(typeof body.valor!=='string'||unidades(body.valor,8)<=0n)throw new ErrorSeguridad(400,'VALIDACION','La cotización debe ser un decimal positivo escrito como texto.');
   dato={fuente:'MANUAL',tipo:'MANUAL',valor:decimal(unidades(body.valor,8),8),fecha:fechaNegocio(this.reloj()),consultadaEn:this.reloj().toISOString()};
  }else if(body.fuente==='BCRA')dato=this.cotizaciones.vigente(body.cotizacionId);
  else throw new ErrorSeguridad(400,'MONEDAS_FUENTE','La fuente no está disponible.');
  return this.repository.transaccion(actor,idEmpresa,repo=>repo.guardarConfiguracion(idEmpresa,dato,version,actor.idUsuario));
 }
 async guardarTarifa(actor,id,body){
  const {idEmpresa}=this.contexto(true);validarCampos(body,['moneda','precio','revision','confirmar']);
  if(body.confirmar!==true||!MONEDAS.includes(body.moneda)||typeof body.precio!=='string'||unidades(body.precio)<=0n)throw new ErrorSeguridad(400,'VALIDACION','Confirmá una moneda ARS/USD y un precio decimal positivo.');
  const version=body.revision===null?null:validarRevision(body.revision),dato={moneda:body.moneda,precio:decimal(unidades(body.precio))};
  return this.repository.transaccion(actor,idEmpresa,async repo=>{
   const config=await repo.configuracion(idEmpresa),ref=cotizacionValida(config,fechaNegocio(this.reloj()))?config:null;
   return repo.guardarTarifa(idEmpresa,id,dato,version,actor.idUsuario,ref);
  });
 }
 async crearPropiedad(actor,body){
  const {idEmpresa}=this.contexto(true);validarCampos(body,['propiedad','moneda','precio','confirmar']);
  validarCampos(body.propiedad,['nombre','tipo','direccion','ciudad','provincia','capacidadMaxima','estado'],['nombre','tipo','direccion','ciudad','provincia','capacidadMaxima']);
  if(body.confirmar!==true||!MONEDAS.includes(body.moneda)||typeof body.precio!=='string'||unidades(body.precio)<=0n)
   throw new ErrorSeguridad(400,'VALIDACION','Confirmá la moneda y el precio positivo de la propiedad.');
  const datos={...body.propiedad,precioBase:decimal(unidades(body.precio)),estado:body.propiedad.estado||'Activa'};
  for(const [campo,maximo]of Object.entries({nombre:100,tipo:50,direccion:200,ciudad:100,provincia:100})){
   if(typeof datos[campo]!=='string'||!datos[campo].trim()||datos[campo].trim().length>maximo)throw new ErrorSeguridad(400,'VALIDACION','Los datos de la propiedad están incompletos o exceden su longitud.');
   datos[campo]=datos[campo].trim();
  }
  if(!Number.isInteger(datos.capacidadMaxima)||datos.capacidadMaxima<1||datos.capacidadMaxima>2147483647)throw new ErrorSeguridad(400,'VALIDACION','La capacidad debe ser un entero positivo.');
  return this.repository.transaccion(actor,idEmpresa,async repo=>{
   if(!repo.conexion||typeof repo.conexion.request!=='function')throw new ErrorSeguridad(500,'MONEDAS_CONTEXTO','Falta el contexto transaccional de la propiedad.');
   const propiedades=this.propiedades(),estado=await propiedades.obtenerEstadoPorNombre(datos.estado,repo.conexion);
   if(!estado)throw new ErrorSeguridad(400,'VALIDACION','El estado de la propiedad no es válido.');
   const propiedad=await propiedades.crear(datos,estado.idEstadoPropiedad,repo.conexion);
   if(!Number.isInteger(propiedad?.idPropiedad)||propiedad.idPropiedad<1)throw new ErrorSeguridad(500,'MONEDAS_LECTURA_FINAL','No se pudo confirmar la propiedad.');
   const config=await repo.configuracion(idEmpresa),referencia=cotizacionValida(config,fechaNegocio(this.reloj()))?config:null;
   const tarifa=await repo.guardarTarifa(idEmpresa,propiedad.idPropiedad,{moneda:body.moneda,precio:datos.precioBase},null,actor.idUsuario,referencia);
   return {...propiedad,precioBase:tarifa.precio,monedaBase:tarifa.moneda,autoridadPrecio:'TARIFA_DECLARADA',tarifaMonetaria:tarifa};
  });
 }
 async alertas(){
  if(!this.estadoActual().activado)return {alertas:[],disponible:false,motivo:'Las referencias de tarifa requieren el modelo de monedas aprobado.'};
  const {idEmpresa}=this.contexto();await this.repository.comprobarModelo(idEmpresa);
  const config=await this.repository.configuracion(idEmpresa),tarifas=await this.repository.tarifas(idEmpresa);
  const alertas=tarifas.map(t=>alertaTarifa(t,config,fechaNegocio(this.reloj()))).filter(Boolean);
  return {alertas,disponible:true,motivo:config?'':'No hay cotización configurada. Las tarifas no se modifican.'};
 }
}
module.exports=new MonedasService();module.exports.MonedasService=MonedasService;module.exports.ADVERTENCIA_MANUAL=ADVERTENCIA_MANUAL;
