-- NO EJECUTADO. Requiere autorizacion local de ESQUEMA, USER SIN LOGIN y siete GRANT.
-- No crea una base, no toca dbo, no concede derechos a hostflow_app.
DECLARE @PrepararPerfil bit=0;
IF ISNULL(@PrepararPerfil,0)<>1 THROW 52002,'Preparacion local no autorizada.',1;
-- FRAGMENTO SOLO PARA COPIAS LOCALES. No ejecuta ni aprovisiona por si mismo.
-- Identidad documentada anteriormente; debe reconfirmarse ANTES de autorizar.
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow_Test_Notificaciones_V2'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow_Test_Notificaciones_V2')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>N'PC-Escritorio'
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(N'PC-Escritorio')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')),N'') COLLATE Latin1_General_100_BIN2<>N'PC-Escritorio'
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>3
 OR ISNULL(CONVERT(int,SERVERPROPERTY('ProductMajorVersion')),0)<>17
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')),N'')<>N'Shared memory'
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('auth_scheme')),N'') NOT IN(N'NTLM',N'KERBEROS')
 OR ISNULL(CONVERT(nvarchar(128),DATABASEPROPERTYEX(DB_NAME(),'Collation')),N'') COLLATE Latin1_General_100_BIN2<>N'SQL_Latin1_General_CP1_CI_AS'
 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 THROW 51940,'Destino local aislado no acreditado; no adaptar automaticamente.',1;
IF ISNULL(IS_SRVROLEMEMBER(N'sysadmin'),0)<>1
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'HostFlowTestIsolation'
 AND CONVERT(nvarchar(128),value) COLLATE Latin1_General_100_BIN2=N'hostflow-notifications-disposable-v2'
 AND DATALENGTH(CONVERT(nvarchar(128),value))=DATALENGTH(N'hostflow-notifications-disposable-v2'))
 THROW 51941,'Requiere administrador local y marca de base descartable.',1;

-- Los seis objetos dbo existentes solo se inspeccionan, nunca reciben DML.
IF (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0 AND SCHEMA_NAME(schema_id)=N'dbo')<>6
 OR EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0 AND
 (SCHEMA_NAME(schema_id) NOT IN(N'dbo',N'HF_Notificaciones_PermisosV2') OR name NOT IN(N'Usuarios',N'Empresas',N'Notificaciones',N'NotificacionDestinatarios',N'PreferenciasNotificacionUsuario',N'PoliticasNotificacionEmpresa')))
 OR EXISTS(SELECT 1 FROM sys.synonyms)
 OR EXISTS(SELECT 1 FROM sys.objects WHERE is_ms_shipped=0 AND type IN('V','P','PC','FN','IF','TF','FS','FT','TR','TA','SQ'))
 THROW 52000,'Inventario local ajeno al fixture: detenerse sin limpiar.',1;
IF (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0 AND name=N'HostFlowFixture'
 AND major_id IN(OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Empresas'))
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'notifications-v2-parent'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'notifications-v2-parent'))<>2
 OR (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0 AND name=N'HostFlowNotificacionesModelo'
 AND major_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'))
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-notificaciones-v2'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'hostflow-notificaciones-v2'))<>4
 THROW 52001,'Marcas originales de aislamiento/modelo no acreditadas.',1;

IF SCHEMA_ID(N'HF_Notificaciones_PermisosV2') IS NOT NULL OR DATABASE_PRINCIPAL_ID(N'HF_Notificaciones_PruebaV2') IS NOT NULL
 THROW 52003,'Esquema/identidad preexistentes: no adoptar ni reemplazar.',1;
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 EXEC(N'CREATE SCHEMA [HF_Notificaciones_PermisosV2] AUTHORIZATION [dbo];');
 CREATE USER [HF_Notificaciones_PruebaV2] WITHOUT LOGIN WITH DEFAULT_SCHEMA=[HF_Notificaciones_PermisosV2];
 CREATE TABLE [HF_Notificaciones_PermisosV2].Usuarios(IdUsuario int NOT NULL PRIMARY KEY);
 CREATE TABLE [HF_Notificaciones_PermisosV2].Empresas(IdEmpresa int NOT NULL PRIMARY KEY);
 CREATE TABLE HF_Notificaciones_PermisosV2.Notificaciones (
  IdNotificacion bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notificaciones PRIMARY KEY,
  IdEmpresa int NOT NULL,
  Tipo nvarchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
  ClaveEvento varchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  ReferenciaTipo varchar(20) COLLATE Latin1_General_100_BIN2 NOT NULL,
  ReferenciaId bigint NULL,
  Prioridad nvarchar(16) COLLATE Latin1_General_100_BIN2 NOT NULL,
  FechaEvento datetime2(3) NOT NULL,
  FechaCreacion datetime2(3) NOT NULL CONSTRAINT DF_Notificaciones_Creacion DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Notificaciones_Empresa FOREIGN KEY(IdEmpresa) REFERENCES HF_Notificaciones_PermisosV2.Empresas(IdEmpresa),
  CONSTRAINT UQ_Notificaciones_Evento UNIQUE(IdEmpresa,ClaveEvento),
  CONSTRAINT CK_Notificaciones_Tipo CHECK(Tipo IN(N'RESERVA_NUEVA',N'RESERVA_CANCELADA',N'RESERVA_MODIFICADA',N'LIMPIEZA_PENDIENTE',N'LIMPIEZA_PROXIMA',N'CONFLICTO_DISPONIBILIDAD',N'ALERTA_CRITICA',N'SISTEMA_INFORMATIVO') AND DATALENGTH(Tipo)=DATALENGTH(RTRIM(Tipo))),
  CONSTRAINT CK_Notificaciones_Clave CHECK(LEN(ClaveEvento)>0 AND DATALENGTH(ClaveEvento)=DATALENGTH(LTRIM(RTRIM(ClaveEvento)))),
  CONSTRAINT CK_Notificaciones_Referencia CHECK(((ReferenciaTipo='sistema' AND ReferenciaId IS NULL)
   OR (ReferenciaTipo IN('reserva','limpieza','alerta') AND ReferenciaId IS NOT NULL AND ReferenciaId>0))
   AND DATALENGTH(ReferenciaTipo)=DATALENGTH(RTRIM(ReferenciaTipo))),
  CONSTRAINT CK_Notificaciones_Prioridad CHECK(Prioridad COLLATE Latin1_General_100_BIN2 IN(N'Critica',N'Alta',N'Media',N'Informativa') AND DATALENGTH(Prioridad)=DATALENGTH(RTRIM(Prioridad)))
 );
 CREATE INDEX IX_Notificaciones_EmpresaFecha ON HF_Notificaciones_PermisosV2.Notificaciones(IdEmpresa,FechaEvento DESC,IdNotificacion DESC);
 CREATE TABLE HF_Notificaciones_PermisosV2.NotificacionDestinatarios (
  IdEntrega bigint IDENTITY(1,1) NOT NULL CONSTRAINT UQ_NotificacionDestinatarios_Entrega UNIQUE,
  IdNotificacion bigint NOT NULL,IdUsuario int NOT NULL,
  FechaRecepcion datetime2(3) NOT NULL CONSTRAINT DF_NotificacionDestinatarios_Recepcion DEFAULT SYSUTCDATETIME(),
  FechaLectura datetime2(3) NULL,VersionRegistro rowversion NOT NULL,
  CONSTRAINT PK_NotificacionDestinatarios PRIMARY KEY(IdNotificacion,IdUsuario),
  CONSTRAINT FK_NotificacionDestinatarios_Notificacion FOREIGN KEY(IdNotificacion) REFERENCES HF_Notificaciones_PermisosV2.Notificaciones(IdNotificacion),
  CONSTRAINT FK_NotificacionDestinatarios_Usuario FOREIGN KEY(IdUsuario) REFERENCES HF_Notificaciones_PermisosV2.Usuarios(IdUsuario),
  CONSTRAINT CK_NotificacionDestinatarios_Lectura CHECK(FechaLectura IS NULL OR FechaLectura>=FechaRecepcion)
 );
 CREATE INDEX IX_NotificacionDestinatarios_Bandeja ON HF_Notificaciones_PermisosV2.NotificacionDestinatarios(IdUsuario,IdEntrega DESC) INCLUDE(IdNotificacion,FechaRecepcion,FechaLectura,VersionRegistro);
 CREATE INDEX IX_NotificacionDestinatarios_NoLeidas ON HF_Notificaciones_PermisosV2.NotificacionDestinatarios(IdUsuario,IdEntrega DESC) INCLUDE(IdNotificacion) WHERE FechaLectura IS NULL;
 CREATE TABLE HF_Notificaciones_PermisosV2.PreferenciasNotificacionUsuario (
  IdUsuario int NOT NULL,Tipo nvarchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,Habilitada bit NOT NULL,
  FechaActualizacion datetime2(3) NOT NULL CONSTRAINT DF_PreferenciasNotificacionUsuario_Actualizacion DEFAULT SYSUTCDATETIME(),
  VersionRegistro rowversion NOT NULL,
  CONSTRAINT PK_PreferenciasNotificacionUsuario PRIMARY KEY(IdUsuario,Tipo),
  CONSTRAINT FK_PreferenciasNotificacionUsuario_Usuario FOREIGN KEY(IdUsuario) REFERENCES HF_Notificaciones_PermisosV2.Usuarios(IdUsuario),
  CONSTRAINT CK_PreferenciasNotificacionUsuario_Tipo CHECK(Tipo IN(N'RESERVA_NUEVA',N'RESERVA_CANCELADA',N'RESERVA_MODIFICADA',N'LIMPIEZA_PENDIENTE',N'LIMPIEZA_PROXIMA',N'CONFLICTO_DISPONIBILIDAD',N'ALERTA_CRITICA',N'SISTEMA_INFORMATIVO') AND DATALENGTH(Tipo)=DATALENGTH(RTRIM(Tipo)))
 );
 CREATE TABLE HF_Notificaciones_PermisosV2.PoliticasNotificacionEmpresa (
  IdEmpresa int NOT NULL,Tipo nvarchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,Habilitada bit NOT NULL,
  Obligatoria bit NOT NULL, -- Sin defecto ni filas: decidir por tipo antes de aprovisionar políticas.
  RetencionDias smallint NULL,IdUsuarioActualizacion int NOT NULL,
  FechaActualizacion datetime2(3) NOT NULL CONSTRAINT DF_PoliticasNotificacionEmpresa_Actualizacion DEFAULT SYSUTCDATETIME(),
  VersionRegistro rowversion NOT NULL,
  CONSTRAINT PK_PoliticasNotificacionEmpresa PRIMARY KEY(IdEmpresa,Tipo),
  CONSTRAINT FK_PoliticasNotificacionEmpresa_Empresa FOREIGN KEY(IdEmpresa) REFERENCES HF_Notificaciones_PermisosV2.Empresas(IdEmpresa),
  CONSTRAINT FK_PoliticasNotificacionEmpresa_Usuario FOREIGN KEY(IdUsuarioActualizacion) REFERENCES HF_Notificaciones_PermisosV2.Usuarios(IdUsuario),
  CONSTRAINT CK_PoliticasNotificacionEmpresa_Tipo CHECK(Tipo IN(N'RESERVA_NUEVA',N'RESERVA_CANCELADA',N'RESERVA_MODIFICADA',N'LIMPIEZA_PENDIENTE',N'LIMPIEZA_PROXIMA',N'CONFLICTO_DISPONIBILIDAD',N'ALERTA_CRITICA',N'SISTEMA_INFORMATIVO') AND DATALENGTH(Tipo)=DATALENGTH(RTRIM(Tipo))),
  CONSTRAINT CK_PoliticasNotificacionEmpresa_Retencion CHECK(RetencionDias IS NULL OR RetencionDias BETWEEN 1 AND 3650),
  CONSTRAINT CK_PoliticasNotificacionEmpresa_Obligatoria CHECK(Obligatoria=0 OR Habilitada=1)
 );
 EXEC sys.sp_addextendedproperty @name=N'HostFlowNotificacionesModelo',@value=N'hostflow-notificaciones-v2',@level0type=N'SCHEMA',@level0name=N'HF_Notificaciones_PermisosV2',@level1type=N'TABLE',@level1name=N'Notificaciones';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowNotificacionesModelo',@value=N'hostflow-notificaciones-v2',@level0type=N'SCHEMA',@level0name=N'HF_Notificaciones_PermisosV2',@level1type=N'TABLE',@level1name=N'NotificacionDestinatarios';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowNotificacionesModelo',@value=N'hostflow-notificaciones-v2',@level0type=N'SCHEMA',@level0name=N'HF_Notificaciones_PermisosV2',@level1type=N'TABLE',@level1name=N'PreferenciasNotificacionUsuario';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowNotificacionesModelo',@value=N'hostflow-notificaciones-v2',@level0type=N'SCHEMA',@level0name=N'HF_Notificaciones_PermisosV2',@level1type=N'TABLE',@level1name=N'PoliticasNotificacionEmpresa';

 EXEC sys.sp_addextendedproperty @name=N'HostFlowPermisosPrueba',@value=N'hostflow-notifications-permissions-v1',@level0type=N'SCHEMA',@level0name=N'HF_Notificaciones_PermisosV2';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowPermisosPrueba',@value=N'hostflow-notifications-permissions-v1',@level0type=N'USER',@level0name=N'HF_Notificaciones_PruebaV2';
GRANT SELECT ON OBJECT::[HF_Notificaciones_PermisosV2].[PreferenciasNotificacionUsuario] TO [HF_Notificaciones_PruebaV2];
GRANT INSERT ON OBJECT::[HF_Notificaciones_PermisosV2].[PreferenciasNotificacionUsuario] TO [HF_Notificaciones_PruebaV2];
GRANT UPDATE ON OBJECT::[HF_Notificaciones_PermisosV2].[PreferenciasNotificacionUsuario] ([Habilitada]) TO [HF_Notificaciones_PruebaV2];
GRANT UPDATE ON OBJECT::[HF_Notificaciones_PermisosV2].[PreferenciasNotificacionUsuario] ([FechaActualizacion]) TO [HF_Notificaciones_PruebaV2];
GRANT SELECT ON OBJECT::[HF_Notificaciones_PermisosV2].[Notificaciones] TO [HF_Notificaciones_PruebaV2];
GRANT SELECT ON OBJECT::[HF_Notificaciones_PermisosV2].[NotificacionDestinatarios] TO [HF_Notificaciones_PruebaV2];
GRANT UPDATE ON OBJECT::[HF_Notificaciones_PermisosV2].[NotificacionDestinatarios] ([FechaLectura]) TO [HF_Notificaciones_PruebaV2];
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
SELECT N'Perfil ficticio sin login preparado; seis tablas propias vacias. No ejecutar nuevamente.' AS Resultado;
