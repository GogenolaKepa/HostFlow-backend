-- NO EJECUTADO. Solo tras autorizacion de pruebas DML locales con impersonacion.
-- No contiene DCL. No repite DDL, GRANT ni las 25 pruebas del esquema.
DECLARE @ProbarPermisos bit=0;
IF ISNULL(@ProbarPermisos,0)<>1 THROW 52007,'Prueba local no autorizada.',1;
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


DECLARE @Principal int=DATABASE_PRINCIPAL_ID(N'HF_Notificaciones_PruebaV2');
IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE principal_id=@Principal AND type='S' AND authentication_type=0)
 OR (SELECT COUNT(*) FROM sys.extended_properties WHERE class IN(3,4) AND minor_id=0 AND name=N'HostFlowPermisosPrueba'
 AND ((class=3 AND major_id=SCHEMA_ID(N'HF_Notificaciones_PermisosV2')) OR (class=4 AND major_id=@Principal))
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-notifications-permissions-v1'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'hostflow-notifications-permissions-v1'))<>2
 OR NOT EXISTS(SELECT 1 FROM sys.schemas WHERE schema_id=SCHEMA_ID(N'HF_Notificaciones_PermisosV2') AND principal_id=DATABASE_PRINCIPAL_ID(N'dbo'))
 OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=@Principal)
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=@Principal)
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id IN(@Principal,DATABASE_PRINCIPAL_ID(N'public')))
 OR (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0 AND schema_id=SCHEMA_ID(N'HF_Notificaciones_PermisosV2'))<>6
 THROW 52004,'Perfil ficticio, propiedad o marcas no acreditados.',1;
-- No aceptar herencia inesperada por public (incluida impersonacion de usuarios).
-- Se toleran solo los derechos public normales de metadatos de base/sistema.
IF EXISTS(SELECT 1 FROM sys.database_permissions WHERE grantee_principal_id=DATABASE_PRINCIPAL_ID(N'public') AND state IN('G','W')
 AND (state='W' OR (class=0 AND permission_name NOT IN(N'CONNECT',N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION',N'VIEW ANY COLUMN MASTER KEY DEFINITION'))
 OR (class=1 AND ISNULL(OBJECT_SCHEMA_NAME(major_id),N'') NOT IN(N'sys',N'INFORMATION_SCHEMA')) OR class NOT IN(0,1)))
 THROW 52019,'Herencia public inesperada: revisar sin modificar permisos.',1;
DECLARE @Diferencias int;
;WITH Esperadas(Tabla,Columna,Permiso) AS (SELECT * FROM (VALUES (N'PreferenciasNotificacionUsuario',N'',N'SELECT'),
(N'PreferenciasNotificacionUsuario',N'',N'INSERT'),
(N'PreferenciasNotificacionUsuario',N'Habilitada',N'UPDATE'),
(N'PreferenciasNotificacionUsuario',N'FechaActualizacion',N'UPDATE'),
(N'Notificaciones',N'',N'SELECT'),
(N'NotificacionDestinatarios',N'',N'SELECT'),
(N'NotificacionDestinatarios',N'FechaLectura',N'UPDATE')) v(Tabla,Columna,Permiso)),
 Actuales AS (SELECT p.*,OBJECT_SCHEMA_NAME(p.major_id) AS Esquema,OBJECT_NAME(p.major_id) AS Tabla,
 CASE WHEN p.minor_id=0 THEN N'' ELSE COL_NAME(p.major_id,p.minor_id) END AS Columna
 FROM sys.database_permissions p WHERE grantee_principal_id=@Principal
 AND NOT (p.class=0 AND p.major_id=0 AND p.minor_id=0
  AND p.permission_name COLLATE Latin1_General_100_BIN2=N'CONNECT' AND p.state='G'))
SELECT @Diferencias=COUNT(*) FROM Esperadas e FULL JOIN Actuales a ON a.class=1
 AND a.Esquema COLLATE Latin1_General_100_BIN2=N'HF_Notificaciones_PermisosV2'
 AND a.Tabla COLLATE Latin1_General_100_BIN2=e.Tabla COLLATE Latin1_General_100_BIN2
 AND a.Columna COLLATE Latin1_General_100_BIN2=e.Columna COLLATE Latin1_General_100_BIN2
 AND a.permission_name COLLATE Latin1_General_100_BIN2=e.Permiso COLLATE Latin1_General_100_BIN2
WHERE e.Tabla IS NULL OR a.class IS NULL OR a.state<>'G';
IF @Diferencias<>0 THROW 52005,'Se requieren exactamente siete concesiones G sin delegacion.',1;
IF EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[Usuarios]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[Empresas]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[Notificaciones]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[NotificacionDestinatarios]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[PreferenciasNotificacionUsuario]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[PoliticasNotificacionEmpresa])
 THROW 52006,'Tablas de prueba no vacias: nunca limpiar ni sobrescribir.',1;

-- Las tablas dbo originales deben seguir en el estado del fixture conocido.
IF (SELECT COUNT(*) FROM dbo.Usuarios)<>2 OR EXISTS(SELECT 1 FROM dbo.Usuarios WHERE IdUsuario NOT IN(1,2))
 OR (SELECT COUNT(*) FROM dbo.Empresas)<>2 OR EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa NOT IN(1,2))
 OR EXISTS(SELECT 1 FROM dbo.[Notificaciones]) OR EXISTS(SELECT 1 FROM dbo.[NotificacionDestinatarios]) OR EXISTS(SELECT 1 FROM dbo.[PreferenciasNotificacionUsuario]) OR EXISTS(SELECT 1 FROM dbo.[PoliticasNotificacionEmpresa])
 THROW 52008,'Fixture original diferente: no adoptar ni limpiar.',1;
DECLARE @IdentEvento numeric(38,0)=IDENT_CURRENT(N'dbo.Notificaciones'),
 @IdentEntrega numeric(38,0)=IDENT_CURRENT(N'dbo.NotificacionDestinatarios');
DECLARE @Marcas TABLE(Clase int,Objeto int,Menor int,Nombre sysname,Valor nvarchar(4000));
INSERT @Marcas SELECT class,major_id,minor_id,name,CONVERT(nvarchar(4000),value)
 FROM sys.extended_properties WHERE class=0 OR (class=1 AND major_id IN(OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Empresas'),OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa')));
DECLARE @Columnas TABLE(Objeto nvarchar(260),Columna sysname,Actualizar bit,Leer bit);
INSERT @Columnas SELECT QUOTENAME(SCHEMA_NAME(t.schema_id))+N'.'+QUOTENAME(t.name),c.name,
 CASE WHEN SCHEMA_NAME(t.schema_id)=N'HF_Notificaciones_PermisosV2' AND ((t.name=N'PreferenciasNotificacionUsuario' AND c.name IN(N'Habilitada',N'FechaActualizacion'))
 OR (t.name=N'NotificacionDestinatarios' AND c.name=N'FechaLectura')) THEN 1 ELSE 0 END,
 CASE WHEN SCHEMA_NAME(t.schema_id)=N'HF_Notificaciones_PermisosV2' AND t.name IN(N'PreferenciasNotificacionUsuario',N'Notificaciones',N'NotificacionDestinatarios') THEN 1 ELSE 0 END
 FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id WHERE t.is_ms_shipped=0;
DECLARE @Original sysname=USER_NAME(),@Positivas int=0,@Negativas int=0,@Denegada bit;
SET XACT_ABORT OFF; SET ANSI_WARNINGS ON;
BEGIN TRY
 BEGIN TRANSACTION;
 -- Solo clones: todos los datos se crean dentro de esta transaccion reversible.
 INSERT [HF_Notificaciones_PermisosV2].Usuarios(IdUsuario) VALUES(1),(2);
 INSERT [HF_Notificaciones_PermisosV2].Empresas(IdEmpresa) VALUES(1),(2);
 INSERT [HF_Notificaciones_PermisosV2].Notificaciones(IdEmpresa,Tipo,ClaveEvento,ReferenciaTipo,Prioridad,FechaEvento)
 VALUES(1,N'RESERVA_NUEVA','permiso-evento','sistema',N'Informativa',SYSUTCDATETIME());
 INSERT [HF_Notificaciones_PermisosV2].NotificacionDestinatarios(IdNotificacion,IdUsuario,FechaRecepcion)
 SELECT IdNotificacion,1,DATEADD(day,-1,SYSUTCDATETIME()) FROM [HF_Notificaciones_PermisosV2].Notificaciones;
 INSERT [HF_Notificaciones_PermisosV2].PoliticasNotificacionEmpresa(IdEmpresa,Tipo,Habilitada,Obligatoria,IdUsuarioActualizacion)
 VALUES(1,N'RESERVA_NUEVA',1,0,1);
 EXECUTE AS USER=N'HF_Notificaciones_PruebaV2';
 IF USER_NAME() COLLATE Latin1_General_100_BIN2<>N'HF_Notificaciones_PruebaV2' THROW 52009,'Identidad restringida no activa.',1;
 IF ISNULL(IS_MEMBER(N'db_owner'),0)<>0 OR ISNULL(IS_MEMBER(N'db_datareader'),0)<>0 OR ISNULL(IS_MEMBER(N'db_datawriter'),0)<>0
  OR EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N'DATABASE') WHERE permission_name NOT IN
   (N'CONNECT',N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION',N'VIEW ANY COLUMN MASTER KEY DEFINITION'))
  THROW 52010,'Permisos administrativos o roles inesperados.',1;
 -- Universo de columnas capturado COMO ADMIN antes de impersonar: no depende
 -- de la visibilidad reducida de sys.columns de la identidad ficticia.
 IF EXISTS(SELECT 1 FROM @Columnas WHERE
  ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'UPDATE',Columna,N'COLUMN'),0)<>Actualizar
  OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'SELECT',Columna,N'COLUMN'),0)<>Leer)
  THROW 52011,'Permisos efectivos por columna diferentes del perfil.',1;
 IF EXISTS(SELECT 1 FROM (VALUES (N'dbo.Usuarios',0),(N'dbo.Empresas',0),(N'dbo.Notificaciones',0),(N'dbo.NotificacionDestinatarios',0),(N'dbo.PreferenciasNotificacionUsuario',0),(N'dbo.PoliticasNotificacionEmpresa',0),(N'HF_Notificaciones_PermisosV2.Usuarios',0),(N'HF_Notificaciones_PermisosV2.Empresas',0),(N'HF_Notificaciones_PermisosV2.Notificaciones',0),(N'HF_Notificaciones_PermisosV2.NotificacionDestinatarios',0),(N'HF_Notificaciones_PermisosV2.PreferenciasNotificacionUsuario',1),(N'HF_Notificaciones_PermisosV2.PoliticasNotificacionEmpresa',0)) p(Objeto,Insertar)
  WHERE ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'INSERT'),0)<>Insertar
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'DELETE'),0)<>0
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'CONTROL'),0)<>0
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'ALTER'),0)<>0
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'REFERENCES'),0)<>0
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'TAKE OWNERSHIP'),0)<>0)
  THROW 52012,'Exceso de permisos efectivos de objeto.',1;
 -- POSITIVA: SELECT preferencias
 EXEC(N'IF (SELECT COUNT(*) FROM [HF_Notificaciones_PermisosV2].PreferenciasNotificacionUsuario)<>0 THROW 52020,''Preferencias iniciales inesperadas.'',1;');
 SET @Positivas=@Positivas+1;
 -- POSITIVA: INSERT preferencia
 EXEC(N'INSERT [HF_Notificaciones_PermisosV2].PreferenciasNotificacionUsuario(IdUsuario,Tipo,Habilitada) VALUES(1,N''RESERVA_NUEVA'',1); IF @@ROWCOUNT<>1 THROW 52021,''INSERT no afecto una fila.'',1;');
 SET @Positivas=@Positivas+1;
 -- POSITIVA: UPDATE Habilitada
 EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].PreferenciasNotificacionUsuario SET Habilitada=0 WHERE IdUsuario=1 AND Tipo=N''RESERVA_NUEVA''; IF @@ROWCOUNT<>1 THROW 52022,''UPDATE Habilitada no afecto una fila.'',1;');
 SET @Positivas=@Positivas+1;
 -- POSITIVA: UPDATE FechaActualizacion
 EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].PreferenciasNotificacionUsuario SET FechaActualizacion=SYSUTCDATETIME() WHERE IdUsuario=1 AND Tipo=N''RESERVA_NUEVA''; IF @@ROWCOUNT<>1 THROW 52023,''UPDATE fecha no afecto una fila.'',1;');
 SET @Positivas=@Positivas+1;
 -- POSITIVA: UPDATE combinado y OUTPUT rowversion
 EXEC(N'DECLARE @Rev binary(8); DECLARE @Nueva TABLE(Revision binary(8)); SELECT @Rev=VersionRegistro FROM [HF_Notificaciones_PermisosV2].PreferenciasNotificacionUsuario WHERE IdUsuario=1 AND Tipo=N''RESERVA_NUEVA''; UPDATE [HF_Notificaciones_PermisosV2].PreferenciasNotificacionUsuario SET Habilitada=1,FechaActualizacion=SYSUTCDATETIME() OUTPUT INSERTED.VersionRegistro INTO @Nueva WHERE IdUsuario=1 AND Tipo=N''RESERVA_NUEVA'' AND VersionRegistro=@Rev; IF (SELECT COUNT(*) FROM @Nueva)<>1 THROW 52024,''UPDATE parametrizable con OUTPUT no autorizado.'',1;');
 SET @Positivas=@Positivas+1;
 -- POSITIVA: SELECT evento
 EXEC(N'IF (SELECT COUNT(*) FROM [HF_Notificaciones_PermisosV2].Notificaciones)<>1 THROW 52025,''Evento ficticio ausente.'',1;');
 SET @Positivas=@Positivas+1;
 -- POSITIVA: SELECT destinatario
 EXEC(N'IF (SELECT COUNT(*) FROM [HF_Notificaciones_PermisosV2].NotificacionDestinatarios)<>1 THROW 52026,''Entrega ficticia ausente.'',1;');
 SET @Positivas=@Positivas+1;
 -- POSITIVA: UPDATE lectura con JOIN/revision
 EXEC(N'DECLARE @Rev binary(8); SELECT @Rev=VersionRegistro FROM [HF_Notificaciones_PermisosV2].NotificacionDestinatarios WHERE IdUsuario=1; UPDATE d SET FechaLectura=SYSUTCDATETIME() FROM [HF_Notificaciones_PermisosV2].NotificacionDestinatarios d JOIN [HF_Notificaciones_PermisosV2].Notificaciones n ON n.IdNotificacion=d.IdNotificacion WHERE d.IdUsuario=1 AND n.IdEmpresa=1 AND d.FechaLectura IS NULL AND d.VersionRegistro=@Rev; IF @@ROWCOUNT<>1 THROW 52027,''UPDATE de lectura no afecto una fila.'',1;');
 SET @Positivas=@Positivas+1;
 -- NEGATIVA: UPDATE IdUsuario preferencia
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].PreferenciasNotificacionUsuario SET IdUsuario=2 WHERE IdUsuario=1;');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: UPDATE Tipo preferencia
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].PreferenciasNotificacionUsuario SET Tipo=N''RESERVA_CANCELADA'' WHERE IdUsuario=1;');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: UPDATE mixto permitido y prohibido
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].PreferenciasNotificacionUsuario SET Habilitada=0,IdUsuario=2 WHERE IdUsuario=1;');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: UPDATE FechaRecepcion
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].NotificacionDestinatarios SET FechaRecepcion=''2026-01-01'' WHERE IdUsuario=1;');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: UPDATE IdUsuario destinatario
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].NotificacionDestinatarios SET IdUsuario=2 WHERE IdUsuario=1;');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: UPDATE IdNotificacion destinatario
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].NotificacionDestinatarios SET IdNotificacion=IdNotificacion WHERE IdUsuario=1;');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: INSERT evento
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'INSERT [HF_Notificaciones_PermisosV2].Notificaciones(IdEmpresa,Tipo,ClaveEvento,ReferenciaTipo,Prioridad,FechaEvento) VALUES(1,N''RESERVA_NUEVA'',''prohibido'',''sistema'',N''Alta'',SYSUTCDATETIME());');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: INSERT destinatario
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'INSERT [HF_Notificaciones_PermisosV2].NotificacionDestinatarios(IdNotificacion,IdUsuario) SELECT IdNotificacion,2 FROM [HF_Notificaciones_PermisosV2].Notificaciones;');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: UPDATE evento
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].Notificaciones SET Prioridad=N''Media'';');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: SELECT politicas
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'SELECT COUNT(*) FROM [HF_Notificaciones_PermisosV2].PoliticasNotificacionEmpresa;');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: INSERT politica
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'INSERT [HF_Notificaciones_PermisosV2].PoliticasNotificacionEmpresa(IdEmpresa,Tipo,Habilitada,Obligatoria,IdUsuarioActualizacion) VALUES(1,N''RESERVA_CANCELADA'',1,0,1);');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: UPDATE politica
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'UPDATE [HF_Notificaciones_PermisosV2].PoliticasNotificacionEmpresa SET Habilitada=0;');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: DELETE Usuarios
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'DELETE FROM [HF_Notificaciones_PermisosV2].[Usuarios];');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: DELETE Empresas
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'DELETE FROM [HF_Notificaciones_PermisosV2].[Empresas];');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: DELETE Notificaciones
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'DELETE FROM [HF_Notificaciones_PermisosV2].[Notificaciones];');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: DELETE NotificacionDestinatarios
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'DELETE FROM [HF_Notificaciones_PermisosV2].[NotificacionDestinatarios];');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: DELETE PreferenciasNotificacionUsuario
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'DELETE FROM [HF_Notificaciones_PermisosV2].[PreferenciasNotificacionUsuario];');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 -- NEGATIVA: DELETE PoliticasNotificacionEmpresa
 SET @Denegada=0;
 BEGIN TRY
  EXEC(N'DELETE FROM [HF_Notificaciones_PermisosV2].[PoliticasNotificacionEmpresa];');
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;

 REVERT;
 IF USER_NAME()<>@Original THROW 52014,'No se restauro identidad administrativa.',1;
 ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
 IF USER_NAME() COLLATE Latin1_General_100_BIN2=N'HF_Notificaciones_PruebaV2' REVERT;
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
IF EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[Usuarios]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[Empresas]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[Notificaciones]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[NotificacionDestinatarios]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[PreferenciasNotificacionUsuario]) OR EXISTS(SELECT 1 FROM [HF_Notificaciones_PermisosV2].[PoliticasNotificacionEmpresa]) THROW 52015,'Persistieron datos de prueba: detenerse sin limpiar.',1;
IF (SELECT COUNT(*) FROM dbo.Usuarios)<>2 OR EXISTS(SELECT 1 FROM dbo.Usuarios WHERE IdUsuario NOT IN(1,2))
 OR (SELECT COUNT(*) FROM dbo.Empresas)<>2 OR EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa NOT IN(1,2))
 OR EXISTS(SELECT 1 FROM dbo.[Notificaciones]) OR EXISTS(SELECT 1 FROM dbo.[NotificacionDestinatarios]) OR EXISTS(SELECT 1 FROM dbo.[PreferenciasNotificacionUsuario]) OR EXISTS(SELECT 1 FROM dbo.[PoliticasNotificacionEmpresa])
 THROW 52018,'Filas originales distintas: revisar interferencia externa.',1;
IF ISNULL(IDENT_CURRENT(N'dbo.Notificaciones'),-1)<>ISNULL(@IdentEvento,-1)
 OR ISNULL(IDENT_CURRENT(N'dbo.NotificacionDestinatarios'),-1)<>ISNULL(@IdentEntrega,-1)
 THROW 52016,'Identity original cambio: revisar interferencia externa.',1;
IF EXISTS(SELECT Clase,Objeto,Menor,Nombre,Valor FROM @Marcas EXCEPT
 SELECT class,major_id,minor_id,name,CONVERT(nvarchar(4000),value) FROM sys.extended_properties WHERE class=0 OR (class=1 AND major_id IN(OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Empresas'),OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'))))
 OR EXISTS(SELECT class,major_id,minor_id,name,CONVERT(nvarchar(4000),value) FROM sys.extended_properties WHERE class=0 OR (class=1 AND major_id IN(OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Empresas'),OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa')))
 EXCEPT SELECT Clase,Objeto,Menor,Nombre,Valor FROM @Marcas)
 THROW 52017,'Marcas originales distintas: detenerse sin corregirlas.',1;
SELECT @Positivas AS PositivasAprobadas,8 AS PositivasEsperadas,@Negativas AS NegativasAprobadas,18 AS NegativasEsperadas,
 N'Rollback completo; dbo sin DML. Revisar perfil y resultados antes de autorizar Azure.' AS Resultado;
-- El @@DBTS global y los identity de los CLONES pueden avanzar. No cambia el
-- contenido, identity ni marcas de las seis tablas dbo preexistentes.
-- No elimina esquema, usuario ni tablas: limpieza futura requiere otra autorizacion.
