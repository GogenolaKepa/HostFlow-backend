const sql=require('mssql');
const {ErrorSeguridad,RECURSO_BLOQUEO,esUsuarioHabilitado,sesionInvalida}=require('../security/seguridadUsuarios');
const UsuarioRepository=require('./UsuarioRepository');
const {tienePermiso}=require('../config/permisos');
const MODELO='hostflow-monedas-v2';
const COLUMNAS=`IdReserva AS idReserva,IdEmpresa AS idEmpresa,Moneda AS moneda,CONVERT(varchar(40),Importe) AS importe,
 PagoEquivalenteARS AS pagoEquivalenteARS,FuenteReferencia AS fuenteReferencia,TipoReferencia AS tipoReferencia,
 FuenteAplicada AS fuenteAplicada,TipoAplicado AS tipoAplicado,CONVERT(varchar(40),ValorAplicado) AS valorAplicado,
 CONVERT(char(10),FechaEfectiva,23) AS fechaEfectiva,CONVERT(char(10),FechaCheckinFijada,23) AS fechaCheckinFijada,FijadoEn AS fijadoEn,CONVERT(varchar(40),EquivalenteARS) AS equivalenteARS,
 IdUsuarioFijacion AS idUsuarioFijacion,IdUsuarioAcuerdo AS idAutor,FechaAcuerdo AS fechaAcuerdo,
 IdUsuarioActualizacion AS idAutorActualizacion,FechaActualizacion AS fechaActualizacion,VersionRegistro AS versionRegistro`;
const revision=r=>r?{...r,versionRegistro:Buffer.isBuffer(r.versionRegistro)?r.versionRegistro.toString('hex'):r.versionRegistro}:null;
class AcuerdoMonetarioRepository {
 constructor({conexion=null,getPool,driver=sql}={}){
  if(conexion&&typeof conexion.request!=='function')throw new TypeError('Contexto monetario inválido.');
  this.conexion=conexion;this.getPool=getPool||(()=>require('../config/database').poolPromise);this.driver=driver;
 }
 async request(){return (this.conexion||await this.getPool()).request();}
 exigirContexto(){if(!this.conexion)throw new TypeError('La escritura de acuerdos requiere la transacción de Reservas.');}
 async revalidarAutor(actor,permisos){
  this.exigirContexto();
  const {recordset}=await (await this.request()).input('recurso',this.driver.NVarChar(255),RECURSO_BLOQUEO)
   .query(`DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@recurso,@LockMode='Exclusive',@LockOwner='Transaction',@DbPrincipal='public',@LockTimeout=10000; SELECT @r AS bloqueo;`);
  if(![0,1].includes(recordset?.[0]?.bloqueo))throw new ErrorSeguridad(409,'ACUERDO_OCUPADO','Otra operación está en curso. Recargá los datos.');
  const usuario=await new UsuarioRepository({request:()=>this.request(),driver:this.driver}).obtener(actor.idUsuario);
  if(!esUsuarioHabilitado(usuario)||usuario.versionSesion!==actor.versionSesion)throw sesionInvalida();
  if(usuario.debeCambiarPassword||permisos.some(p=>!tienePermiso(usuario,p)))throw new ErrorSeguridad(403,'ACUERDO_PERMISO','No tiene permiso para confirmar este acuerdo.');
 }
 async comprobarModelo(idEmpresa){
  const req=await this.request();req.input('empresa',this.driver.Int,idEmpresa).input('modelo',this.driver.NVarChar(100),MODELO);
  const {recordset}=await req.query(`SELECT COUNT(*) AS cantidad FROM sys.extended_properties
   WHERE class=1 AND minor_id=0 AND name=N'HostFlowMonedasModelo' AND major_id=OBJECT_ID(N'dbo.AcuerdosMonetariosReserva')
   AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=@modelo AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(@modelo)
   AND EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa=@empresa AND Activo=1);`);
  if(recordset?.[0]?.cantidad!==1)throw new ErrorSeguridad(503,'MONEDAS_MODELO_PENDIENTE','El modelo de acuerdos o la empresa no están preparados.');
 }
 async obtener(idEmpresa,idReserva){
  const req=await this.request();req.input('empresa',this.driver.Int,idEmpresa).input('reserva',this.driver.Int,idReserva);
  const {recordset}=await req.query(`SELECT ${COLUMNAS}
   FROM dbo.AcuerdosMonetariosReserva WHERE IdEmpresa=@empresa AND IdReserva=@reserva;`);
  return revision(recordset?.[0]);
 }
 async listar(idEmpresa){
  const req=await this.request();req.input('empresa',this.driver.Int,idEmpresa);
  const {recordset}=await req.query(`SELECT ${COLUMNAS} FROM dbo.AcuerdosMonetariosReserva WHERE IdEmpresa=@empresa ORDER BY IdReserva;`);
  return recordset.map(revision);
 }
 async resumen(idEmpresa,filtros){
  const req=await this.request();req.input('empresa',this.driver.Int,idEmpresa)
   .input('desde',this.driver.Char(10),filtros.fechaDesde).input('hasta',this.driver.Char(10),filtros.fechaHasta)
   .input('propiedad',this.driver.Int,filtros.idPropiedad).input('canal',this.driver.NVarChar(30),filtros.canal)
   .input('estado',this.driver.NVarChar(30),filtros.estado);
  const {recordset}=await req.query(`SELECT a.Moneda AS moneda,CONVERT(varchar(60),SUM(a.Importe)) AS importe,CONVERT(varchar(30),COUNT_BIG(*)) AS cantidad
   FROM dbo.Reservas r JOIN dbo.CanalesReserva c ON c.IdCanalReserva=r.IdCanalReserva JOIN dbo.EstadosReserva e ON e.IdEstadoReserva=r.IdEstadoReserva
   LEFT JOIN dbo.AcuerdosMonetariosReserva a ON a.IdReserva=r.IdReserva AND a.IdEmpresa=@empresa
   WHERE CONVERT(date,r.FechaIngreso)>=CONVERT(date,@desde) AND CONVERT(date,r.FechaIngreso)<=CONVERT(date,@hasta)
   AND e.Nombre NOT IN(N'Cancelada',N'No show') AND (@propiedad IS NULL OR r.IdPropiedad=@propiedad)
   AND (@canal IS NULL OR c.Nombre=@canal) AND (@estado IS NULL OR e.Nombre=@estado)
   GROUP BY a.Moneda;`);
  return recordset;
 }
 async guardar(idEmpresa,idReserva,dato,actor,version=null){
  this.exigirContexto();const req=await this.request();
  req.input('empresa',this.driver.Int,idEmpresa).input('reserva',this.driver.Int,idReserva).input('moneda',this.driver.Char(3),dato.moneda)
   .input('importe',this.driver.VarChar(40),dato.importe).input('pagoARS',this.driver.Bit,dato.pagoEquivalenteARS)
   .input('fuente',this.driver.VarChar(10),dato.fuenteReferencia).input('tipo',this.driver.VarChar(40),dato.tipoReferencia)
   .input('actor',this.driver.Int,actor).input('revision',this.driver.Binary(8),version?Buffer.from(version,'hex'):null);
  const {recordset}=await req.query(`IF @revision IS NULL
   INSERT INTO dbo.AcuerdosMonetariosReserva(IdReserva,IdEmpresa,Moneda,Importe,PagoEquivalenteARS,FuenteReferencia,TipoReferencia,IdUsuarioAcuerdo,IdUsuarioActualizacion)
   OUTPUT INSERTED.VersionRegistro AS versionRegistro
   SELECT @reserva,@empresa,@moneda,CONVERT(decimal(18,2),@importe),@pagoARS,@fuente,@tipo,@actor,@actor
   WHERE NOT EXISTS(SELECT 1 FROM dbo.AcuerdosMonetariosReserva WHERE IdReserva=@reserva);
   ELSE UPDATE dbo.AcuerdosMonetariosReserva SET Moneda=@moneda,Importe=CONVERT(decimal(18,2),@importe),PagoEquivalenteARS=@pagoARS,
    FuenteReferencia=@fuente,TipoReferencia=@tipo,IdUsuarioActualizacion=@actor,FechaActualizacion=SYSUTCDATETIME()
   OUTPUT INSERTED.VersionRegistro AS versionRegistro WHERE IdReserva=@reserva AND IdEmpresa=@empresa AND VersionRegistro=@revision AND FijadoEn IS NULL;`);
  return this.leerResultado(idEmpresa,idReserva,recordset);
 }
 async fijar(idEmpresa,idReserva,snapshot,actor,version){
  this.exigirContexto();const req=await this.request();
  req.input('empresa',this.driver.Int,idEmpresa).input('reserva',this.driver.Int,idReserva)
   .input('fuente',this.driver.VarChar(10),snapshot.fuente).input('tipo',this.driver.VarChar(40),snapshot.tipo)
   .input('valor',this.driver.VarChar(40),snapshot.valor).input('fecha',this.driver.Char(10),snapshot.fechaEfectiva)
   .input('checkin',this.driver.Char(10),snapshot.fechaCheckin)
   .input('fijado',this.driver.DateTime2(0),new Date(snapshot.fijadoEn)).input('equivalente',this.driver.VarChar(40),snapshot.equivalenteARS)
   .input('actor',this.driver.Int,actor).input('revision',this.driver.Binary(8),Buffer.from(version,'hex'));
  const {recordset}=await req.query(`UPDATE dbo.AcuerdosMonetariosReserva SET FuenteAplicada=@fuente,TipoAplicado=@tipo,ValorAplicado=CONVERT(decimal(18,8),@valor),
   FechaEfectiva=CONVERT(date,@fecha),FechaCheckinFijada=CONVERT(date,@checkin),FijadoEn=@fijado,EquivalenteARS=CONVERT(decimal(18,2),@equivalente),IdUsuarioFijacion=@actor,
   IdUsuarioActualizacion=@actor,FechaActualizacion=SYSUTCDATETIME()
   OUTPUT INSERTED.VersionRegistro AS versionRegistro
   WHERE IdReserva=@reserva AND IdEmpresa=@empresa AND VersionRegistro=@revision AND FijadoEn IS NULL AND PagoEquivalenteARS=1;`);
  return this.leerResultado(idEmpresa,idReserva,recordset);
 }
 async leerResultado(empresa,reserva,filas){
  if(filas?.length!==1)throw new ErrorSeguridad(409,'ACUERDO_CONFLICTO','El acuerdo cambió o su cotización ya está fijada. Recargá los datos.');
  const resultado=await this.obtener(empresa,reserva);
  if(!resultado||resultado.versionRegistro!==revision(filas[0]).versionRegistro)throw new ErrorSeguridad(500,'MONEDAS_LECTURA_FINAL','No se pudo comprobar el acuerdo antes de confirmar.');
  return resultado;
 }
}
module.exports={AcuerdoMonetarioRepository,MODELO};
