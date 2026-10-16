-- POSTERIOR A MIGRACION AUTORIZADA. No ejecutar hoy ni contra tablas ausentes.
-- No devuelve preferencias personales, destinatarios, cuentas o cuerpos de avisos.
DECLARE @ServidorEsperado sysname=NULL;
IF @ServidorEsperado IS NULL OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 THROW 51880,'Destino de verificacion no acreditado.',1;
IF OBJECT_ID(N'dbo.Notificaciones',N'U') IS NULL OR OBJECT_ID(N'dbo.NotificacionDestinatarios',N'U') IS NULL
 OR OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario',N'U') IS NULL OR OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa',N'U') IS NULL
 THROW 51881,'Faltan tablas propuestas: no migrar desde la verificacion.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1
 THROW 51885,'Se requiere inventario administrativo completo.',1;
SELECT SERVERPROPERTY('ServerName') AS Servidor,DB_NAME() AS Base,SERVERPROPERTY('EngineEdition') AS Motor;
SELECT OBJECT_NAME(c.object_id) AS Tabla,c.name,TYPE_NAME(c.user_type_id) AS Tipo,c.max_length,c.is_nullable,c.is_identity,c.scale,c.collation_name
 FROM sys.columns c WHERE c.object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'));
SELECT OBJECT_NAME(f.parent_object_id) AS Tabla,f.name,COL_NAME(fc.parent_object_id,fc.parent_column_id) AS Columna,
 OBJECT_SCHEMA_NAME(f.referenced_object_id) AS EsquemaReferenciado,OBJECT_NAME(f.referenced_object_id) AS TablaReferenciada,
 COL_NAME(fc.referenced_object_id,fc.referenced_column_id) AS ColumnaReferenciada,
 f.is_disabled,f.is_not_trusted,f.delete_referential_action_desc,f.update_referential_action_desc
 FROM sys.foreign_keys f JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id
 WHERE f.parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'));
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,definition,is_disabled,is_not_trusted FROM sys.check_constraints
 WHERE parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'));
SELECT OBJECT_NAME(object_id) AS Tabla,name,is_unique,is_primary_key FROM sys.indexes
 WHERE object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'));
SELECT OBJECT_NAME(major_id) AS Tabla,CONVERT(nvarchar(100),value) AS Modelo FROM sys.extended_properties
 WHERE class=1 AND minor_id=0 AND name=N'HostFlowNotificacionesModelo';
-- Permisos del backend: usar 06; los efectivos de esta sesion administrativa NO los acreditan.
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,definition FROM sys.default_constraints
 WHERE parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'));
SELECT OBJECT_NAME(i.object_id) AS Tabla,i.name,c.name AS Columna,ic.key_ordinal,ic.is_descending_key,ic.is_included_column,i.filter_definition
 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
 WHERE i.object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'));
-- Resumen independiente esperado del borrador v2: no sustituye revisar cada definición.
SELECT
 (SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'))) AS FKEsperadas6,
 (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'))) AS CHECKEsperados9;
IF (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0
 AND major_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'))
 AND name=N'HostFlowNotificacionesModelo' AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-notificaciones-v2'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'hostflow-notificaciones-v2'))<>4
 THROW 51882,'Modelo v2 no acreditado: no activar.',1;
IF EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa')) AND (is_disabled=1 OR is_not_trusted=1))
 OR EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa')) AND (is_disabled=1 OR is_not_trusted=1))
 THROW 51883,'Restricciones no confiables: detener activacion.',1;
-- Contrato fisico, en bytes para cadenas Unicode. -1 omite longitud variable
-- de datetime2; su precision temporal se verifica por scale=3.
DECLARE @Diferencias int;
;WITH Esperadas(Tabla,Columna,Tipo,Longitud,Nula,Identidad,Escala) AS (
 SELECT * FROM (VALUES
 (N'Notificaciones',N'IdNotificacion',127,8,0,1,0),(N'Notificaciones',N'IdEmpresa',56,4,0,0,0),
 (N'Notificaciones',N'Tipo',231,80,0,0,0),(N'Notificaciones',N'ClaveEvento',167,200,0,0,0),
 (N'Notificaciones',N'ReferenciaTipo',167,20,0,0,0),(N'Notificaciones',N'ReferenciaId',127,8,1,0,0),
 (N'Notificaciones',N'Prioridad',231,32,0,0,0),(N'Notificaciones',N'FechaEvento',42,-1,0,0,3),
 (N'Notificaciones',N'FechaCreacion',42,-1,0,0,3),
 (N'NotificacionDestinatarios',N'IdEntrega',127,8,0,1,0),(N'NotificacionDestinatarios',N'IdNotificacion',127,8,0,0,0),
 (N'NotificacionDestinatarios',N'IdUsuario',56,4,0,0,0),(N'NotificacionDestinatarios',N'FechaRecepcion',42,-1,0,0,3),
 (N'NotificacionDestinatarios',N'FechaLectura',42,-1,1,0,3),(N'NotificacionDestinatarios',N'VersionRegistro',189,8,0,0,0),
 (N'PreferenciasNotificacionUsuario',N'IdUsuario',56,4,0,0,0),(N'PreferenciasNotificacionUsuario',N'Tipo',231,80,0,0,0),
 (N'PreferenciasNotificacionUsuario',N'Habilitada',104,1,0,0,0),(N'PreferenciasNotificacionUsuario',N'FechaActualizacion',42,-1,0,0,3),
 (N'PreferenciasNotificacionUsuario',N'VersionRegistro',189,8,0,0,0),
 (N'PoliticasNotificacionEmpresa',N'IdEmpresa',56,4,0,0,0),(N'PoliticasNotificacionEmpresa',N'Tipo',231,80,0,0,0),
 (N'PoliticasNotificacionEmpresa',N'Habilitada',104,1,0,0,0),(N'PoliticasNotificacionEmpresa',N'Obligatoria',104,1,0,0,0),
 (N'PoliticasNotificacionEmpresa',N'RetencionDias',52,2,1,0,0),(N'PoliticasNotificacionEmpresa',N'IdUsuarioActualizacion',56,4,0,0,0),
 (N'PoliticasNotificacionEmpresa',N'FechaActualizacion',42,-1,0,0,3),(N'PoliticasNotificacionEmpresa',N'VersionRegistro',189,8,0,0,0)
 ) v(Tabla,Columna,Tipo,Longitud,Nula,Identidad,Escala)
), Actuales AS (
 SELECT OBJECT_NAME(c.object_id) AS Tabla,c.* FROM sys.columns c
 WHERE c.object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'))
)
SELECT @Diferencias=COUNT(*) FROM Esperadas e FULL JOIN Actuales c
 ON e.Tabla COLLATE Latin1_General_100_BIN2=c.Tabla COLLATE Latin1_General_100_BIN2
 AND e.Columna COLLATE Latin1_General_100_BIN2=c.name COLLATE Latin1_General_100_BIN2
WHERE e.Tabla IS NULL OR c.object_id IS NULL OR c.system_type_id<>e.Tipo OR c.user_type_id<>c.system_type_id
 OR (e.Longitud<>-1 AND c.max_length<>e.Longitud) OR c.is_nullable<>e.Nula OR c.is_identity<>e.Identidad OR c.scale<>e.Escala
 OR c.is_computed<>0 OR c.generated_always_type<>0 OR c.encryption_type IS NOT NULL
 OR (e.Tipo IN(167,231) AND ISNULL(c.collation_name,N'') COLLATE Latin1_General_100_BIN2<>N'Latin1_General_100_BIN2');
IF @Diferencias<>0 THROW 51884,'Contrato de columnas v2 incompatible: detener activacion.',1;
IF (SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa')))<>6
 OR (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa')))<>9
 OR (SELECT COUNT(*) FROM sys.default_constraints WHERE parent_object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa')))<>4
 OR (SELECT COUNT(*) FROM sys.indexes WHERE object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa')) AND is_primary_key=1)<>4
 OR (SELECT COUNT(*) FROM sys.indexes WHERE object_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa')) AND index_id>0 AND is_disabled=0 AND is_hypothetical=0)<>9
 THROW 51886,'Inventario de restricciones/indices distinto de v2.',1;
-- Los conteos no prueban equivalencia de definiciones: revisar tambien los
-- resultados anteriores contra 01 (orden de claves, filtros, defaults y CHECK).
SELECT N'Columnas y cantidades v2 compatibles; revisar definiciones y permisos por separado.' AS Resultado;
