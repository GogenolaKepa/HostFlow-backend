const sql = require('mssql');
const UsuarioRepository = require('./UsuarioRepository');
const { LONGITUD_PRIORIDAD } = require('../config/notificaciones');
const { ErrorSeguridad, RECURSO_BLOQUEO } = require('../security/seguridadUsuarios');

class NotificacionRepository {
  constructor({ getPool, request, driver = sql } = {}) {
    this.driver = driver;
    this.getPool = getPool || (() => require('../config/database').poolPromise);
    this.request = request || (async () => new this.driver.Request(await this.getPool()));
    this.usuarios = new UsuarioRepository({ getPool: this.getPool, request: this.request, driver });
  }
  async avisos({ pagina, limite, categoria, prioridad }) {
    const req = await this.request();
    req.input('Categoria', this.driver.NVarChar(20), categoria);
    req.input('Prioridad', this.driver.NVarChar(LONGITUD_PRIORIDAD), prioridad);
    req.input('Offset', this.driver.Int, (pagina - 1) * limite);req.input('Limite', this.driver.Int, limite);
    // Solo columnas estructuradas: no seleccionar Titulo, Mensaje, DatosJson,
    // contactos, nombres de huéspedes o importes de alertas de origen.
    const base = `Estado COLLATE Latin1_General_100_BIN2 IN(N'Nueva',N'Leida')
      AND Tipo COLLATE Latin1_General_100_BIN2 IN(N'CHECKIN_PROXIMO',N'CONFLICTO_RESERVAS',N'INCIDENCIA_ABIERTA',N'SINCRONIZACION_ERROR')`;
    const filtros = `(@Categoria=N'todas' OR (@Categoria=N'reservas' AND Tipo IN(N'CHECKIN_PROXIMO',N'CONFLICTO_RESERVAS'))
        OR (@Categoria=N'alertas' AND Tipo IN(N'INCIDENCIA_ABIERTA',N'SINCRONIZACION_ERROR')))
      AND (@Prioridad=N'todas' OR Severidad COLLATE Latin1_General_100_BIN2=@Prioridad COLLATE Latin1_General_100_BIN2
        OR (@Prioridad=N'NoDefinida' AND (Severidad IS NULL OR Severidad COLLATE Latin1_General_100_BIN2 NOT IN(N'Critica',N'Alta',N'Media',N'Informativa'))))`;
    const result = await req.query(`SELECT COUNT(CASE WHEN ${filtros} THEN 1 END) AS total,COUNT(*) AS totalSinFiltros
      FROM dbo.Alertas WHERE ${base};
      SELECT IdAlerta AS idAlerta,Tipo AS tipo,Severidad AS prioridad,FechaAlerta AS fecha
      FROM dbo.Alertas WHERE ${base} AND ${filtros}
      ORDER BY FechaAlerta DESC,IdAlerta DESC OFFSET @Offset ROWS FETCH NEXT @Limite ROWS ONLY;`);
    return { total: result.recordsets[0][0].total, totalSinFiltros: result.recordsets[0][0].totalSinFiltros, filas: result.recordsets[1] };
  }
  async comprobarModelo(idEmpresa,personal=false) {
    const req=await this.request();req.input('Empresa',this.driver.Int,idEmpresa);
    const {recordset}=await req.query(`SELECT
      (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0
       AND major_id IN(OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario',N'U')${personal?",OBJECT_ID(N'dbo.Notificaciones',N'U'),OBJECT_ID(N'dbo.NotificacionDestinatarios',N'U')":''})
       AND name=N'HostFlowNotificacionesModelo'
       AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-notificaciones-v2'
       AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'hostflow-notificaciones-v2')) AS modelo,
      (SELECT COUNT(*) FROM dbo.Empresas WHERE IdEmpresa=@Empresa AND Activo=1) AS empresa;`);
    if(recordset?.[0]?.modelo!==(personal?3:1)||recordset[0].empresa!==1) throw new ErrorSeguridad(503,'NOTIFICACIONES_MODELO_PENDIENTE','El modelo de notificaciones no está preparado.');
  }
  async requestPersonal(idUsuario,idEmpresa,tipos){
    const req=await this.request();req.input('Usuario',this.driver.Int,idUsuario);req.input('Empresa',this.driver.Int,idEmpresa);
    const permitidos=tipos.map((tipo,i)=>{req.input(`TipoPermitido${i}`,this.driver.NVarChar(40),tipo);return `@TipoPermitido${i}`;});
    return {req,alcance:`d.IdUsuario=@Usuario AND n.IdEmpresa=@Empresa AND n.Tipo IN(${permitidos.length?permitidos.join(','):"N''"})`};
  }
  async listarPersonales(idUsuario,idEmpresa,filtros,tipos){
    const {req,alcance}=await this.requestPersonal(idUsuario,idEmpresa,tipos);
    req.input('Hasta',this.driver.BigInt,filtros.cursor?.hasta??null);req.input('Antes',this.driver.BigInt,filtros.cursor?.antes??null);
    req.input('Limite',this.driver.Int,filtros.limite+1);req.input('Tipo',this.driver.NVarChar(40),filtros.tipo);req.input('Prioridad',this.driver.NVarChar(LONGITUD_PRIORIDAD),filtros.prioridad);req.input('Estado',this.driver.NVarChar(20),filtros.estado);
    const {recordsets}=await req.query(`DECLARE @Corte bigint=COALESCE(@Hasta,(SELECT MAX(d.IdEntrega) FROM dbo.NotificacionDestinatarios d JOIN dbo.Notificaciones n ON n.IdNotificacion=d.IdNotificacion WHERE ${alcance}));
      SELECT CONVERT(varchar(20),@Corte) AS hasta;
      SELECT TOP(@Limite) CONVERT(varchar(20),d.IdEntrega) AS idEntrega,CONVERT(varchar(20),n.IdNotificacion) AS idNotificacion,
        n.Tipo AS tipo,n.Prioridad AS prioridad,n.FechaEvento AS fecha,d.FechaLectura AS fechaLectura,d.VersionRegistro AS versionRegistro
      FROM dbo.NotificacionDestinatarios d JOIN dbo.Notificaciones n ON n.IdNotificacion=d.IdNotificacion
      WHERE ${alcance} AND d.IdEntrega<=@Corte AND (@Antes IS NULL OR d.IdEntrega<@Antes)
        AND (@Tipo=N'todas' OR n.Tipo=@Tipo) AND (@Prioridad=N'todas' OR n.Prioridad=@Prioridad)
        AND (@Estado=N'todas' OR (@Estado=N'noLeidas' AND d.FechaLectura IS NULL) OR (@Estado=N'leidas' AND d.FechaLectura IS NOT NULL))
      ORDER BY d.IdEntrega DESC;`);
    return {hasta:recordsets[0][0].hasta,filas:recordsets[1]};
  }
  async contarPersonales(idUsuario,idEmpresa,tipos){
    const {req,alcance}=await this.requestPersonal(idUsuario,idEmpresa,tipos);
    const {recordset}=await req.query(`SELECT COUNT(*) AS noLeidas FROM dbo.NotificacionDestinatarios d JOIN dbo.Notificaciones n ON n.IdNotificacion=d.IdNotificacion WHERE ${alcance} AND d.FechaLectura IS NULL;`);
    return recordset[0].noLeidas;
  }
  async marcarPersonalLeida(idUsuario,idEmpresa,id,revision,tipos){
    const {req,alcance}=await this.requestPersonal(idUsuario,idEmpresa,tipos);
    req.input('Notificacion',this.driver.BigInt,id);req.input('Revision',this.driver.Binary(8),Buffer.from(revision,'hex'));
    const {recordset}=await req.query(`UPDATE d SET FechaLectura=SYSUTCDATETIME()
      FROM dbo.NotificacionDestinatarios d JOIN dbo.Notificaciones n ON n.IdNotificacion=d.IdNotificacion
      WHERE ${alcance} AND n.IdNotificacion=@Notificacion AND d.FechaLectura IS NULL AND d.VersionRegistro=@Revision;
      SELECT CONVERT(varchar(20),d.IdEntrega) AS idEntrega,CONVERT(varchar(20),n.IdNotificacion) AS idNotificacion,
        n.Tipo AS tipo,n.Prioridad AS prioridad,n.FechaEvento AS fecha,d.FechaLectura AS fechaLectura,d.VersionRegistro AS versionRegistro
      FROM dbo.NotificacionDestinatarios d JOIN dbo.Notificaciones n ON n.IdNotificacion=d.IdNotificacion
      WHERE ${alcance} AND n.IdNotificacion=@Notificacion;`);
    const fila=recordset?.[0];if(!fila)throw new ErrorSeguridad(404,'NOTIFICACION_NO_DISPONIBLE','La notificación no está disponible.');
    if(fila.fechaLectura===null)throw new ErrorSeguridad(409,'NOTIFICACIONES_CONFLICTO','La notificación cambió. Recargá antes de marcarla.');
    return fila; // Ya leída: éxito idempotente, sin modificar fecha/revisión otra vez.
  }
  async preferencias(idUsuario) {
    const req=await this.request();req.input('Usuario',this.driver.Int,idUsuario);
    const {recordset}=await req.query(`SELECT Tipo AS tipo,Habilitada AS habilitada,VersionRegistro AS versionRegistro
      FROM dbo.PreferenciasNotificacionUsuario WHERE IdUsuario=@Usuario ORDER BY Tipo;`);
    return recordset;
  }
  async guardarPreferencias(idUsuario, preferencias) {
    for(const item of preferencias) {
      const req=await this.request();req.input('Usuario',this.driver.Int,idUsuario);req.input('Tipo',this.driver.NVarChar(40),item.tipo);
      req.input('Habilitada',this.driver.Bit,item.habilitada);
      req.input('Revision',this.driver.Binary(8),item.versionRegistro===null?null:Buffer.from(item.versionRegistro,'hex'));
      const {recordset}=await req.query(`IF @Revision IS NULL
        BEGIN
          IF EXISTS(SELECT 1 FROM dbo.PreferenciasNotificacionUsuario WITH(UPDLOCK,HOLDLOCK) WHERE IdUsuario=@Usuario AND Tipo=@Tipo)
            THROW 51801,'Preferencias modificadas concurrentemente.',1;
          INSERT INTO dbo.PreferenciasNotificacionUsuario(IdUsuario,Tipo,Habilitada) OUTPUT INSERTED.VersionRegistro AS revision
          VALUES(@Usuario,@Tipo,@Habilitada);
        END
        ELSE UPDATE dbo.PreferenciasNotificacionUsuario SET Habilitada=@Habilitada,FechaActualizacion=SYSUTCDATETIME()
          OUTPUT INSERTED.VersionRegistro AS revision WHERE IdUsuario=@Usuario AND Tipo=@Tipo AND VersionRegistro=@Revision;`);
      if(recordset?.length!==1)throw new ErrorSeguridad(409,'NOTIFICACIONES_CONFLICTO','Las preferencias cambiaron. Recargá antes de guardar.');
    }
    return this.preferencias(idUsuario);
  }
  async transaccion(operacion) {
    let tx, iniciada=false;
    try {
      tx=new this.driver.Transaction(await this.getPool());await tx.begin(this.driver.ISOLATION_LEVEL.READ_COMMITTED);iniciada=true;
      const request=async()=>new this.driver.Request(tx),req=await request();req.input('Recurso',this.driver.NVarChar(255),RECURSO_BLOQUEO);
      const {recordset}=await req.query(`DECLARE @Resultado int;EXEC @Resultado=sys.sp_getapplock
        @Resource=@Recurso,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000,@DbPrincipal='public';SELECT @Resultado AS resultado;`);
      if(![0,1].includes(recordset?.[0]?.resultado))throw new ErrorSeguridad(409,'OPERACION_CONCURRENTE','Otra operación está en curso. Reintentá.');
      const result=await operacion(new NotificacionRepository({getPool:this.getPool,request,driver:this.driver}));
      await tx.commit();iniciada=false;return result;
    } catch(error) {
      if(iniciada){try{await tx.rollback();}catch{/* Nunca registrar parámetros o errores del driver. */}}
      if(error instanceof ErrorSeguridad)throw error;
      if(error?.number===51801||error?.originalError?.info?.number===51801)throw new ErrorSeguridad(409,'NOTIFICACIONES_CONFLICTO','Las preferencias cambiaron. Recargá antes de guardar.');
      throw new ErrorSeguridad(503,'NOTIFICACIONES_NO_DISPONIBLES','No se pudieron guardar las preferencias.');
    }
  }
}
module.exports={NotificacionRepository};
