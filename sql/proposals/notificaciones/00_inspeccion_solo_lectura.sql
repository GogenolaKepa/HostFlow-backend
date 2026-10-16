-- PROPUESTA NO EJECUTADA. Solo metadatos; no consulta filas o secretos.
-- Completar destino exacto en una copia tras autorización de lectura separada.
DECLARE @ServidorEsperado sysname=NULL;
IF @ServidorEsperado IS NULL OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 THROW 51850,'Destino Azure no acreditado: inspeccion bloqueada.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1
 THROW 51851,'Se requiere visibilidad administrativa completa, no elevar el backend.',1;
SELECT SERVERPROPERTY('ServerName') AS Servidor,DB_NAME() AS Base,SERVERPROPERTY('EngineEdition') AS Motor,
 DATABASEPROPERTYEX(DB_NAME(),'Collation') AS CollationBase,USER_NAME() AS Principal,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS ControlAdministrativo;
SELECT s.name AS Esquema,t.name AS Tabla,c.name AS Columna,ty.name AS Tipo,c.max_length,c.is_nullable,c.is_identity,
 c.system_type_id,c.user_type_id,c.is_computed,c.generated_always_type,c.encryption_type,c.collation_name,c.precision,c.scale
 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
 JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
 WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id;
SELECT OBJECT_SCHEMA_NAME(k.parent_object_id) AS Esquema,OBJECT_NAME(k.parent_object_id) AS Tabla,
 k.name,k.type_desc,i.is_unique FROM sys.key_constraints k JOIN sys.indexes i
 ON i.object_id=k.parent_object_id AND i.index_id=k.unique_index_id;
SELECT name,OBJECT_SCHEMA_NAME(parent_object_id) AS Esquema,OBJECT_NAME(parent_object_id) AS Tabla,
 OBJECT_NAME(referenced_object_id) AS Referenciada,is_disabled,is_not_trusted FROM sys.foreign_keys;
-- Claves referenciables: comprobar orden/composicion real, no solo el nombre PK.
SELECT OBJECT_SCHEMA_NAME(i.object_id) AS Esquema,OBJECT_NAME(i.object_id) AS Tabla,
 i.name AS Indice,i.is_unique,i.is_disabled,i.is_hypothetical,i.has_filter,i.filter_definition,
 c.name AS Columna,ic.key_ordinal,ic.is_included_column,ic.is_descending_key
 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
 WHERE i.object_id IN(OBJECT_ID(N'dbo.Usuarios',N'U'),OBJECT_ID(N'dbo.Empresas',N'U'))
 ORDER BY i.object_id,i.index_id,ic.index_column_id;
SELECT OBJECT_SCHEMA_NAME(f.parent_object_id) AS Esquema,OBJECT_NAME(f.parent_object_id) AS Tabla,
 f.name,COL_NAME(fc.parent_object_id,fc.parent_column_id) AS Columna,
 OBJECT_SCHEMA_NAME(fc.referenced_object_id) AS EsquemaReferenciado,
 OBJECT_NAME(fc.referenced_object_id) AS TablaReferenciada,COL_NAME(fc.referenced_object_id,fc.referenced_column_id) AS ColumnaReferenciada,
 f.delete_referential_action_desc,f.update_referential_action_desc
 FROM sys.foreign_keys f JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id
 WHERE f.parent_object_id IN(OBJECT_ID(N'dbo.Usuarios',N'U'),OBJECT_ID(N'dbo.Empresas',N'U'));
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,definition,is_disabled,is_not_trusted
 FROM sys.check_constraints WHERE parent_object_id IN(OBJECT_ID(N'dbo.Usuarios',N'U'),OBJECT_ID(N'dbo.Empresas',N'U'));
SELECT HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS CrearTabla,
 HAS_PERMS_BY_NAME(N'dbo','SCHEMA','ALTER') AS AlterarDbo,
 HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','REFERENCES') AS ReferenciarUsuarios,
 HAS_PERMS_BY_NAME(N'dbo.Empresas','OBJECT','REFERENCES') AS ReferenciarEmpresas;
-- Indicadores, nunca cuerpos privados de módulos ni filas de negocio.
SELECT OBJECT_SCHEMA_NAME(parent_id) AS Esquema,OBJECT_NAME(parent_id) AS Tabla,name,is_disabled
 FROM sys.triggers WHERE parent_class=1;
SELECT OBJECT_SCHEMA_NAME(object_id) AS Esquema,name,is_enabled FROM sys.security_policies;
