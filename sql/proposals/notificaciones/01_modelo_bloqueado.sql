/* PROPUESTA v2, sustituye SOLO el borrador v1 nunca ejecutado.
   Copia v1 preservada en revision/consolidacion-notificaciones/snapshot-inicial.
   DISEÑO PARA REVISIÓN. NO EJECUTADO. No instala productores ni crea avisos.
   No alterar Usuarios/Empresas/Alertas/Reservas ni suponer multiempresa real.
   Requiere inventario administrativo completo para descartar equivalentes.
   Mantener originales bloqueados, ejecutar una copia solo tras aprobación DDL. */
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0;
DECLARE @ServidorEsperado sysname=NULL;
DECLARE @CollationEsperada sysname=NULL; -- Confirmar mediante 00; no cambiar la base.
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51860,'Propuesta de notificaciones bloqueada.',1;
IF @ServidorEsperado IS NULL OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 THROW 51861,'Destino Azure no acreditado.',1;
IF @CollationEsperada IS NULL
 OR CONVERT(nvarchar(128),DATABASEPROPERTYEX(DB_NAME(),'Collation')) COLLATE Latin1_General_100_BIN2<>@CollationEsperada COLLATE Latin1_General_100_BIN2
 OR DATALENGTH(CONVERT(nvarchar(128),DATABASEPROPERTYEX(DB_NAME(),'Collation')))<>DATALENGTH(@CollationEsperada)
 THROW 51867,'Collation no acreditada contra la inspeccion administrativa.',1;
IF @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0 THROW 51862,'Requiere sesion administrativa dedicada en autocommit.',1;
IF USER_NAME() COLLATE Latin1_General_100_BIN2=N'hostflow_app'
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL'),0)<>1
 THROW 51866,'Usar una identidad administrativa existente distinta del backend.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE'),0)<>1
 OR ISNULL(HAS_PERMS_BY_NAME(N'dbo','SCHEMA','ALTER'),0)<>1
 OR ISNULL(HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','REFERENCES'),0)<>1
 OR ISNULL(HAS_PERMS_BY_NAME(N'dbo.Empresas','OBJECT','REFERENCES'),0)<>1
 THROW 51863,'Faltan capacidades de la sesion administrativa; no elevar el backend.',1;
IF OBJECT_ID(N'dbo.Notificaciones') IS NOT NULL OR OBJECT_ID(N'dbo.NotificacionDestinatarios') IS NOT NULL
 OR OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario') IS NOT NULL OR OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa') IS NOT NULL
 THROW 51864,'Objetos preexistentes: no repetir ni reemplazar.',1;
-- Las FK requieren claves reales, no basta que exista una columna int.
IF EXISTS (
 SELECT 1 FROM (VALUES(N'Usuarios',N'IdUsuario'),(N'Empresas',N'IdEmpresa')) p(Tabla,Columna)
 WHERE NOT EXISTS (
  SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
  JOIN sys.columns c ON c.object_id=t.object_id
  WHERE s.name=N'dbo' AND t.name=p.Tabla AND t.is_ms_shipped=0
   AND c.name=p.Columna AND c.system_type_id=56 AND c.user_type_id=56 AND c.max_length=4
   AND c.is_nullable=0 AND c.is_computed=0 AND c.generated_always_type=0 AND c.encryption_type IS NULL
   AND EXISTS (SELECT 1 FROM sys.indexes i JOIN sys.index_columns ic
    ON ic.object_id=i.object_id AND ic.index_id=i.index_id
    WHERE i.object_id=t.object_id AND i.is_unique=1 AND i.is_disabled=0
     AND i.is_hypothetical=0 AND i.has_filter=0 AND ic.column_id=c.column_id AND ic.key_ordinal=1
     AND (SELECT COUNT(*) FROM sys.index_columns k WHERE k.object_id=i.object_id AND k.index_id=i.index_id AND k.key_ordinal>0)=1)
 ))
 THROW 51865,'Revisar claves de Usuarios/Empresas antes de crear relaciones.',1;
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 CREATE TABLE dbo.Notificaciones (
  IdNotificacion bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notificaciones PRIMARY KEY,
  IdEmpresa int NOT NULL,
  Tipo nvarchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
  ClaveEvento varchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  ReferenciaTipo varchar(20) COLLATE Latin1_General_100_BIN2 NOT NULL,
  ReferenciaId bigint NULL,
  Prioridad nvarchar(16) COLLATE Latin1_General_100_BIN2 NOT NULL,
  FechaEvento datetime2(3) NOT NULL,
  FechaCreacion datetime2(3) NOT NULL CONSTRAINT DF_Notificaciones_Creacion DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Notificaciones_Empresa FOREIGN KEY(IdEmpresa) REFERENCES dbo.Empresas(IdEmpresa),
  CONSTRAINT UQ_Notificaciones_Evento UNIQUE(IdEmpresa,ClaveEvento),
  CONSTRAINT CK_Notificaciones_Tipo CHECK(Tipo IN(N'RESERVA_NUEVA',N'RESERVA_CANCELADA',N'RESERVA_MODIFICADA',N'LIMPIEZA_PENDIENTE',N'LIMPIEZA_PROXIMA',N'CONFLICTO_DISPONIBILIDAD',N'ALERTA_CRITICA',N'SISTEMA_INFORMATIVO') AND DATALENGTH(Tipo)=DATALENGTH(RTRIM(Tipo))),
  CONSTRAINT CK_Notificaciones_Clave CHECK(LEN(ClaveEvento)>0 AND DATALENGTH(ClaveEvento)=DATALENGTH(LTRIM(RTRIM(ClaveEvento)))),
  CONSTRAINT CK_Notificaciones_Referencia CHECK(((ReferenciaTipo='sistema' AND ReferenciaId IS NULL)
   OR (ReferenciaTipo IN('reserva','limpieza','alerta') AND ReferenciaId IS NOT NULL AND ReferenciaId>0))
   AND DATALENGTH(ReferenciaTipo)=DATALENGTH(RTRIM(ReferenciaTipo))),
  CONSTRAINT CK_Notificaciones_Prioridad CHECK(Prioridad COLLATE Latin1_General_100_BIN2 IN(N'Critica',N'Alta',N'Media',N'Informativa') AND DATALENGTH(Prioridad)=DATALENGTH(RTRIM(Prioridad)))
 );
 CREATE INDEX IX_Notificaciones_EmpresaFecha ON dbo.Notificaciones(IdEmpresa,FechaEvento DESC,IdNotificacion DESC);
 CREATE TABLE dbo.NotificacionDestinatarios (
  IdEntrega bigint IDENTITY(1,1) NOT NULL CONSTRAINT UQ_NotificacionDestinatarios_Entrega UNIQUE,
  IdNotificacion bigint NOT NULL,IdUsuario int NOT NULL,
  FechaRecepcion datetime2(3) NOT NULL CONSTRAINT DF_NotificacionDestinatarios_Recepcion DEFAULT SYSUTCDATETIME(),
  FechaLectura datetime2(3) NULL,VersionRegistro rowversion NOT NULL,
  CONSTRAINT PK_NotificacionDestinatarios PRIMARY KEY(IdNotificacion,IdUsuario),
  CONSTRAINT FK_NotificacionDestinatarios_Notificacion FOREIGN KEY(IdNotificacion) REFERENCES dbo.Notificaciones(IdNotificacion),
  CONSTRAINT FK_NotificacionDestinatarios_Usuario FOREIGN KEY(IdUsuario) REFERENCES dbo.Usuarios(IdUsuario),
  CONSTRAINT CK_NotificacionDestinatarios_Lectura CHECK(FechaLectura IS NULL OR FechaLectura>=FechaRecepcion)
 );
 CREATE INDEX IX_NotificacionDestinatarios_Bandeja ON dbo.NotificacionDestinatarios(IdUsuario,IdEntrega DESC) INCLUDE(IdNotificacion,FechaRecepcion,FechaLectura,VersionRegistro);
 CREATE INDEX IX_NotificacionDestinatarios_NoLeidas ON dbo.NotificacionDestinatarios(IdUsuario,IdEntrega DESC) INCLUDE(IdNotificacion) WHERE FechaLectura IS NULL;
 CREATE TABLE dbo.PreferenciasNotificacionUsuario (
  IdUsuario int NOT NULL,Tipo nvarchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,Habilitada bit NOT NULL,
  FechaActualizacion datetime2(3) NOT NULL CONSTRAINT DF_PreferenciasNotificacionUsuario_Actualizacion DEFAULT SYSUTCDATETIME(),
  VersionRegistro rowversion NOT NULL,
  CONSTRAINT PK_PreferenciasNotificacionUsuario PRIMARY KEY(IdUsuario,Tipo),
  CONSTRAINT FK_PreferenciasNotificacionUsuario_Usuario FOREIGN KEY(IdUsuario) REFERENCES dbo.Usuarios(IdUsuario),
  CONSTRAINT CK_PreferenciasNotificacionUsuario_Tipo CHECK(Tipo IN(N'RESERVA_NUEVA',N'RESERVA_CANCELADA',N'RESERVA_MODIFICADA',N'LIMPIEZA_PENDIENTE',N'LIMPIEZA_PROXIMA',N'CONFLICTO_DISPONIBILIDAD',N'ALERTA_CRITICA',N'SISTEMA_INFORMATIVO') AND DATALENGTH(Tipo)=DATALENGTH(RTRIM(Tipo)))
 );
 CREATE TABLE dbo.PoliticasNotificacionEmpresa (
  IdEmpresa int NOT NULL,Tipo nvarchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,Habilitada bit NOT NULL,
  Obligatoria bit NOT NULL, -- Sin defecto ni filas: decidir por tipo antes de aprovisionar políticas.
  RetencionDias smallint NULL,IdUsuarioActualizacion int NOT NULL,
  FechaActualizacion datetime2(3) NOT NULL CONSTRAINT DF_PoliticasNotificacionEmpresa_Actualizacion DEFAULT SYSUTCDATETIME(),
  VersionRegistro rowversion NOT NULL,
  CONSTRAINT PK_PoliticasNotificacionEmpresa PRIMARY KEY(IdEmpresa,Tipo),
  CONSTRAINT FK_PoliticasNotificacionEmpresa_Empresa FOREIGN KEY(IdEmpresa) REFERENCES dbo.Empresas(IdEmpresa),
  CONSTRAINT FK_PoliticasNotificacionEmpresa_Usuario FOREIGN KEY(IdUsuarioActualizacion) REFERENCES dbo.Usuarios(IdUsuario),
  CONSTRAINT CK_PoliticasNotificacionEmpresa_Tipo CHECK(Tipo IN(N'RESERVA_NUEVA',N'RESERVA_CANCELADA',N'RESERVA_MODIFICADA',N'LIMPIEZA_PENDIENTE',N'LIMPIEZA_PROXIMA',N'CONFLICTO_DISPONIBILIDAD',N'ALERTA_CRITICA',N'SISTEMA_INFORMATIVO') AND DATALENGTH(Tipo)=DATALENGTH(RTRIM(Tipo))),
  CONSTRAINT CK_PoliticasNotificacionEmpresa_Retencion CHECK(RetencionDias IS NULL OR RetencionDias BETWEEN 1 AND 3650),
  CONSTRAINT CK_PoliticasNotificacionEmpresa_Obligatoria CHECK(Obligatoria=0 OR Habilitada=1)
 );
 EXEC sys.sp_addextendedproperty @name=N'HostFlowNotificacionesModelo',@value=N'hostflow-notificaciones-v2',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'Notificaciones';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowNotificacionesModelo',@value=N'hostflow-notificaciones-v2',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'NotificacionDestinatarios';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowNotificacionesModelo',@value=N'hostflow-notificaciones-v2',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'PreferenciasNotificacionUsuario';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowNotificacionesModelo',@value=N'hostflow-notificaciones-v2',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'PoliticasNotificacionEmpresa';
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
