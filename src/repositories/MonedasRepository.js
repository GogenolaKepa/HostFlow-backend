const sql=require('mssql');
const UsuarioRepository=require('./UsuarioRepository');
const {ErrorSeguridad,RECURSO_BLOQUEO,esUsuarioHabilitado,sesionInvalida}=require('../security/seguridadUsuarios');
const MODELO='hostflow-monedas-v2';
const revision=row=>row?{...row,versionRegistro:Buffer.isBuffer(row.versionRegistro)?row.versionRegistro.toString('hex'):row.versionRegistro}:null;
class MonedasRepository {
 constructor({getPool,request,driver=sql,conexion=null}={}) {this.driver=driver;this.getPool=getPool||(()=>require('../config/database').poolPromise);this.request=request|| (async()=>new this.driver.Request(await this.getPool()));Object.defineProperty(this,'conexion',{value:conexion});}
 async comprobarModelo(idEmpresa) {
  const req=await this.request();req.input('empresa',this.driver.Int,idEmpresa).input('modelo',this.driver.NVarChar(100),MODELO);
  const {recordset}=await req.query(`SELECT COUNT(*) AS cantidad FROM sys.extended_properties
    WHERE class=1 AND minor_id=0 AND name=N'HostFlowMonedasModelo'
    AND major_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'))
    AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=@modelo
    AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(@modelo)
    AND EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa=@empresa AND Activo=1);`);
  if(recordset?.[0]?.cantidad!==2)throw new ErrorSeguridad(503,'MONEDAS_MODELO_PENDIENTE','El modelo de monedas o la empresa no están preparados.');
 }
 async configuracion(idEmpresa) {
  const req=await this.request();req.input('empresa',this.driver.Int,idEmpresa);
  const {recordset}=await req.query(`SELECT Fuente AS fuente,Tipo AS tipo,CONVERT(varchar(40),Valor) AS valor,
   CONVERT(char(10),FechaCotizacion,23) AS fecha,HoraPublicacion AS horaPublicacion,ConsultadaEn AS consultadaEn,
   IdUsuarioActualizacion AS idAutor,FechaActualizacion AS actualizadaEn,VersionRegistro AS versionRegistro
   FROM dbo.ConfiguracionMonetaria WHERE IdEmpresa=@empresa;`);
  return revision(recordset[0]);
 }
 async tarifas(idEmpresa) {
  const req=await this.request();req.input('empresa',this.driver.Int,idEmpresa);
  const {recordset}=await req.query(`SELECT t.IdPropiedad AS idPropiedad,p.Nombre AS nombre,t.Moneda AS moneda,
   CONVERT(varchar(40),t.PrecioBase) AS precio,t.ReferenciaFuente AS referenciaFuente,t.ReferenciaTipo AS referenciaTipo,
   CONVERT(varchar(40),t.ReferenciaValor) AS referenciaValor,CONVERT(char(10),t.ReferenciaFecha,23) AS referenciaFecha,
   t.VersionRegistro AS versionRegistro FROM dbo.TarifasPropiedad t
   JOIN dbo.Propiedades p ON p.IdPropiedad=t.IdPropiedad WHERE t.IdEmpresa=@empresa ORDER BY t.IdPropiedad;`);
  return recordset.map(row=>{const r=revision(row);return {idPropiedad:r.idPropiedad,nombre:r.nombre,moneda:r.moneda,precio:r.precio,versionRegistro:r.versionRegistro,
   referencia:r.referenciaFuente?{fuente:r.referenciaFuente,tipo:r.referenciaTipo,valor:r.referenciaValor,fecha:r.referenciaFecha}:null};});
 }
 async guardarConfiguracion(idEmpresa,dato,version,actor) {
  const req=await this.request();
  req.input('empresa',this.driver.Int,idEmpresa).input('fuente',this.driver.VarChar(10),dato.fuente).input('tipo',this.driver.VarChar(40),dato.tipo)
   .input('valor',this.driver.VarChar(40),dato.valor).input('fecha',this.driver.Char(10),dato.fecha)
   .input('consulta',this.driver.DateTime2(0),dato.consultadaEn?new Date(dato.consultadaEn):null)
   .input('actor',this.driver.Int,actor).input('revision',this.driver.Binary(8),version?Buffer.from(version,'hex'):null);
  const {recordset}=await req.query(`IF @revision IS NULL
    INSERT INTO dbo.ConfiguracionMonetaria(IdEmpresa,Fuente,Tipo,Valor,FechaCotizacion,ConsultadaEn,IdUsuarioActualizacion)
    OUTPUT INSERTED.VersionRegistro AS versionRegistro
    SELECT @empresa,@fuente,@tipo,CONVERT(decimal(18,8),@valor),CONVERT(date,@fecha),@consulta,@actor
    WHERE NOT EXISTS(SELECT 1 FROM dbo.ConfiguracionMonetaria WHERE IdEmpresa=@empresa);
   ELSE UPDATE dbo.ConfiguracionMonetaria SET Fuente=@fuente,Tipo=@tipo,Valor=CONVERT(decimal(18,8),@valor),FechaCotizacion=CONVERT(date,@fecha),
    HoraPublicacion=NULL,ConsultadaEn=@consulta,IdUsuarioActualizacion=@actor,FechaActualizacion=SYSUTCDATETIME()
    OUTPUT INSERTED.VersionRegistro AS versionRegistro WHERE IdEmpresa=@empresa AND VersionRegistro=@revision;`);
  if(recordset?.length!==1)throw new ErrorSeguridad(409,'MONEDAS_CONFLICTO','Otra sesión cambió la cotización. Recargá los datos.');
  const resultado=await this.configuracion(idEmpresa);
  if(!resultado||resultado.versionRegistro!==revision(recordset[0]).versionRegistro)throw new ErrorSeguridad(500,'MONEDAS_LECTURA_FINAL','No se pudo comprobar la lectura final del guardado.');
  return resultado;
 }
 async guardarTarifa(idEmpresa,id,dato,version,actor,referencia) {
  const req=await this.request();req.input('empresa',this.driver.Int,idEmpresa).input('propiedad',this.driver.Int,id)
   .input('moneda',this.driver.Char(3),dato.moneda).input('precio',this.driver.VarChar(40),dato.precio)
   .input('revision',this.driver.Binary(8),version?Buffer.from(version,'hex'):null).input('actor',this.driver.Int,actor)
   .input('rf',this.driver.VarChar(10),referencia?.fuente||null).input('rt',this.driver.VarChar(40),referencia?.tipo||null)
   .input('rv',this.driver.VarChar(40),referencia?.valor||null).input('rd',this.driver.Char(10),referencia?.fecha||null);
  const {recordset}=await req.query(`IF @revision IS NULL
    INSERT INTO dbo.TarifasPropiedad(IdPropiedad,IdEmpresa,Moneda,PrecioBase,ReferenciaFuente,ReferenciaTipo,ReferenciaValor,ReferenciaFecha,IdUsuarioActualizacion)
    OUTPUT INSERTED.VersionRegistro AS versionRegistro
    SELECT @propiedad,@empresa,@moneda,CONVERT(decimal(18,2),@precio),@rf,@rt,CONVERT(decimal(18,8),@rv),CONVERT(date,@rd),@actor
    WHERE EXISTS(SELECT 1 FROM dbo.Propiedades WHERE IdPropiedad=@propiedad)
    AND NOT EXISTS(SELECT 1 FROM dbo.TarifasPropiedad WHERE IdPropiedad=@propiedad);
   ELSE UPDATE dbo.TarifasPropiedad SET Moneda=@moneda,PrecioBase=CONVERT(decimal(18,2),@precio),ReferenciaFuente=@rf,ReferenciaTipo=@rt,ReferenciaValor=CONVERT(decimal(18,8),@rv),
    ReferenciaFecha=CONVERT(date,@rd),IdUsuarioActualizacion=@actor,FechaActualizacion=SYSUTCDATETIME()
    OUTPUT INSERTED.VersionRegistro AS versionRegistro
    WHERE IdEmpresa=@empresa AND IdPropiedad=@propiedad AND VersionRegistro=@revision;`);
  if(recordset?.length!==1)throw new ErrorSeguridad(409,'MONEDAS_CONFLICTO','La tarifa cambió o la propiedad no está disponible. Recargá los datos.');
  const resultado=(await this.tarifas(idEmpresa)).find(t=>t.idPropiedad===id);
  if(!resultado||resultado.versionRegistro!==revision(recordset[0]).versionRegistro)throw new ErrorSeguridad(500,'MONEDAS_LECTURA_FINAL','No se pudo comprobar la lectura final del guardado.');
  return resultado;
 }
 async transaccion(actor,idEmpresa,operacion) {
  const tx=new this.driver.Transaction(await this.getPool());let iniciada=false,confirmando=false,revertida=false;
  tx.on?.('rollback',()=>{revertida=true;});
  try {
   await tx.begin(this.driver.ISOLATION_LEVEL.READ_COMMITTED);iniciada=true;
   const request=async()=>new this.driver.Request(tx);
   const lock=await request();lock.input('recurso',this.driver.NVarChar(255),RECURSO_BLOQUEO);
   const {recordset}=await lock.query(`DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@recurso,@LockMode='Exclusive',@LockOwner='Transaction',@DbPrincipal='public',@LockTimeout=10000; SELECT @r AS bloqueo;`);
   if(![0,1].includes(recordset?.[0]?.bloqueo))throw new ErrorSeguridad(409,'MONEDAS_OCUPADAS','Otra operación está en curso.');
   const usuario=await new UsuarioRepository({getPool:this.getPool,request,driver:this.driver}).obtener(actor.idUsuario);
   if(!esUsuarioHabilitado(usuario)||usuario.versionSesion!==actor.versionSesion)throw sesionInvalida();
   if(usuario.debeCambiarPassword||usuario.rol!=='Administrador')throw new ErrorSeguridad(403,'MONEDAS_SIN_PERMISO','No tiene permiso para guardar monedas.');
   const repo=new MonedasRepository({getPool:this.getPool,request,driver:this.driver,conexion:tx});await repo.comprobarModelo(idEmpresa);
   const resultado=await operacion(repo);confirmando=true;await tx.commit();return resultado;
  } catch(error) {
   let falloRollback=false;if(iniciada&&!revertida){try{await tx.rollback();}catch{falloRollback=true;}}
   if(confirmando||falloRollback)throw new ErrorSeguridad(500,'OPERACION_RESULTADO_INCIERTO','No se pudo confirmar el resultado del guardado. Recargá los datos antes de reintentar.');
   throw error;
  }
 }
}
module.exports={MonedasRepository,MODELO};
