-- PROPUESTA de inspección, NO EJECUTADA. Nunca se carga desde la aplicación.
-- Solo metadatos; no devuelve filas operativas, SID, credenciales o definiciones.
-- Autorizar por separado la lectura administrativa antes de completar la copia.
DECLARE @AutorizarLectura bit = 0;
DECLARE @ServidorEsperado sysname = NULL;
IF @AutorizarLectura <> 1 OR @ServidorEsperado IS NULL
 THROW 52000, 'Inspeccion bloqueada: falta autorizacion y destino exacto.', 1;
IF ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0) <> 5
 OR DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'HostFlow'
 OR DATALENGTH(DB_NAME()) <> DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2 <> @ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0) <> DATALENGTH(@ServidorEsperado)
 THROW 52001, 'Destino Azure HostFlow no acreditado.', 1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0) <> 1
 THROW 52002, 'Se requiere visibilidad administrativa del esquema.', 1;

SELECT SERVERPROPERTY('ServerName') AS Servidor, DB_NAME() AS Base,
 SERVERPROPERTY('EngineEdition') AS Motor, DATABASEPROPERTYEX(DB_NAME(),'Collation') AS Collation;

SELECT s.name AS Esquema,t.name AS Tabla,c.name AS Columna,ty.name AS Tipo,
 c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.collation_name
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
 JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE s.name=N'dbo' AND t.name IN(N'Reservas',N'ReservaEventos',N'Huespedes',N'Propiedades',
 N'TareasLimpieza',N'Alertas',N'PropiedadCanales',N'PropiedadImagenes',N'PropiedadImagenCanales')
ORDER BY t.name,c.column_id;

SELECT s.name AS Esquema,t.name AS Tabla,i.name AS Indice,i.is_unique,i.is_primary_key,
 i.has_filter,i.filter_definition,c.name AS Columna,ic.key_ordinal,ic.is_included_column
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
 JOIN sys.indexes i ON i.object_id=t.object_id
 JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE s.name=N'dbo' AND t.name IN(N'Reservas',N'ReservaEventos',N'Huespedes',N'TareasLimpieza',N'Alertas')
ORDER BY t.name,i.index_id,ic.index_column_id;

SELECT OBJECT_SCHEMA_NAME(f.parent_object_id) AS Esquema,OBJECT_NAME(f.parent_object_id) AS Tabla,
 f.name AS ClaveForanea,COL_NAME(fc.parent_object_id,fc.parent_column_id) AS Columna,
 OBJECT_SCHEMA_NAME(f.referenced_object_id) AS EsquemaReferenciado,
 OBJECT_NAME(f.referenced_object_id) AS TablaReferenciada,
 COL_NAME(fc.referenced_object_id,fc.referenced_column_id) AS ColumnaReferenciada,
 f.delete_referential_action_desc,f.update_referential_action_desc,f.is_disabled,f.is_not_trusted
FROM sys.foreign_keys f JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id
ORDER BY Esquema,Tabla,ClaveForanea,fc.constraint_column_id;

SELECT OBJECT_SCHEMA_NAME(parent_id) AS Esquema,OBJECT_NAME(parent_id) AS Tabla,
 name AS TriggerNombre,is_disabled,is_instead_of_trigger
FROM sys.triggers WHERE parent_class=1 AND is_ms_shipped=0;

SELECT name AS PoliticaSeguridad,is_enabled FROM sys.security_policies;
SELECT r.name AS Rol,IS_ROLEMEMBER(r.name,N'hostflow_app') AS Miembro
FROM sys.database_principals r WHERE r.name IN(N'db_datareader',N'db_datawriter');
