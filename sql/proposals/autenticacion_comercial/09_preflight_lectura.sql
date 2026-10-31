-- SOLO SELECT. Sin filas de Usuarios/Contactos, hashes, tokens o secretos.
-- El inspector ejecuta primero identidad y se detiene si no es Azure HostFlow.
-- IDENTIDAD
SELECT DB_NAME() AS Base,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS Servidor,
 CONVERT(int,SERVERPROPERTY('EngineEdition')) AS Motor,USER_NAME() AS Principal,
 @@TRANCOUNT AS Transacciones,(@@OPTIONS & 2) AS Implicitas,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS VerDefiniciones,
 CONVERT(nvarchar(128),DATABASEPROPERTYEX(DB_NAME(),'Collation')) AS CollationBase,
 (SELECT compatibility_level FROM sys.databases WHERE name=DB_NAME()) AS Compatibilidad;
-- METADATOS
SELECT SCHEMA_NAME(t.schema_id) AS Esquema,t.name AS Tabla,c.name AS Columna,
 TYPE_NAME(c.system_type_id) AS Tipo,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.is_computed,c.collation_name
FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
WHERE t.object_id IN (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas'))
 OR t.schema_id=SCHEMA_ID(N'authcom') ORDER BY Esquema,Tabla,c.column_id;
SELECT OBJECT_NAME(c.object_id) AS Tabla,c.name AS Columna,c.is_persisted,c.definition
FROM sys.computed_columns c WHERE c.object_id=OBJECT_ID(N'dbo.Usuarios') AND c.name=N'EmailNormalizado';
SELECT OBJECT_NAME(i.object_id) AS Tabla,i.name AS Indice,i.is_unique,i.is_disabled,i.has_filter,
 c.name AS Columna,ic.key_ordinal,ic.is_included_column
FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE i.object_id IN (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas'))
 OR OBJECT_SCHEMA_NAME(i.object_id)=N'authcom' ORDER BY Tabla,Indice,ic.key_ordinal;
SELECT OBJECT_SCHEMA_NAME(parent_object_id) AS Esquema,OBJECT_NAME(parent_object_id) AS Tabla,name,
 OBJECT_SCHEMA_NAME(referenced_object_id) AS EsquemaReferencia,OBJECT_NAME(referenced_object_id) AS TablaReferencia,
 is_disabled,is_not_trusted,delete_referential_action_desc,update_referential_action_desc
FROM sys.foreign_keys WHERE parent_object_id IN (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas'))
 OR SCHEMA_NAME(schema_id)=N'authcom';
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,definition,is_disabled,is_not_trusted
FROM sys.check_constraints WHERE parent_object_id IN (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas')) OR SCHEMA_NAME(schema_id)=N'authcom';
SELECT OBJECT_NAME(d.parent_object_id) AS Tabla,c.name AS Columna,d.name AS Restriccion,d.definition
FROM sys.default_constraints d JOIN sys.columns c ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
WHERE d.parent_object_id IN (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas'))
 AND c.name IN (N'Estado',N'Activo',N'DebeCambiarPassword',N'VersionSesion',N'FechaCreacion',N'FechaActualizacion',N'FechaCambioPassword');
SELECT OBJECT_NAME(parent_id) AS Tabla,name,is_disabled,is_instead_of_trigger FROM sys.triggers
WHERE parent_id IN (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas')) AND is_ms_shipped=0;
SELECT OBJECT_SCHEMA_NAME(pr.target_object_id) AS Esquema,OBJECT_NAME(pr.target_object_id) AS Tabla,
 p.name AS Politica,p.is_enabled,pr.predicate_type_desc,pr.operation_desc
FROM sys.security_policies p JOIN sys.security_predicates pr ON pr.object_id=p.object_id
WHERE pr.target_object_id IN (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas'));
SELECT name,CONVERT(nvarchar(100),value) AS Valor FROM sys.extended_properties
WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name IN
 (N'HostFlowAuthModelo',N'HostFlowAuthIngreso',N'HostFlowAuthCorreo',N'HostFlowAuthResiliencia');
SELECT Objeto,Permiso,HAS_PERMS_BY_NAME(Objeto,'OBJECT',Permiso) AS Efectivo FROM (VALUES
 (N'dbo.Usuarios',N'SELECT'),(N'dbo.Usuarios',N'INSERT'),(N'dbo.Roles',N'SELECT'),(N'dbo.Empresas',N'SELECT'),
 (N'sys.sp_getapplock',N'EXECUTE'),(N'authcom.Ingresos',N'INSERT'),(N'authcom.Outbox',N'UPDATE'))v(Objeto,Permiso);
SELECT Columna,HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','UPDATE',Columna,'COLUMN') AS Efectivo
FROM (VALUES(N'PasswordHash'),(N'DebeCambiarPassword'),(N'VersionSesion'),(N'FechaCambioPassword'),(N'FechaActualizacion'),(N'IdUsuarioActualizacion'))v(Columna);
-- Visibilidad parcial no demuestra ausencia global de triggers/RLS/objetos authcom.
-- Complemento administrativo: no conceder VIEW DEFINITION al runtime para ejecutarlo.
-- Si las definiciones son NULL o VerDefiniciones=0, el dictamen sigue siendo parcial.
SELECT SCHEMA_ID(N'authcom') AS EsquemaAuthcom,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS PuedeCrearTablas,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE SCHEMA') AS PuedeCrearEsquema,
 IS_ROLEMEMBER(N'db_owner') AS DbOwner,IS_ROLEMEMBER(N'db_datawriter') AS DataWriter,
 IS_ROLEMEMBER(N'db_datareader') AS DataReader;
SELECT s.name AS Esquema,o.name AS Objeto,o.type_desc AS Tipo
FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
WHERE s.name=N'authcom' AND o.is_ms_shipped=0 ORDER BY Objeto;
SELECT OBJECT_NAME(k.parent_object_id) AS Tabla,k.name AS Clave,
 pc.name AS Columna,OBJECT_SCHEMA_NAME(k.referenced_object_id) AS EsquemaReferencia,
 OBJECT_NAME(k.referenced_object_id) AS TablaReferencia,rc.name AS ColumnaReferencia
FROM sys.foreign_keys k JOIN sys.foreign_key_columns f ON f.constraint_object_id=k.object_id
JOIN sys.columns pc ON pc.object_id=f.parent_object_id AND pc.column_id=f.parent_column_id
JOIN sys.columns rc ON rc.object_id=f.referenced_object_id AND rc.column_id=f.referenced_column_id
WHERE k.parent_object_id IN (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas'))
 OR OBJECT_SCHEMA_NAME(k.parent_object_id)=N'authcom' ORDER BY Tabla,Clave,f.constraint_column_id;
SELECT OBJECT_SCHEMA_NAME(d.referencing_id) AS Esquema,OBJECT_NAME(d.referencing_id) AS Objeto,
 d.referenced_schema_name AS EsquemaReferencia,d.referenced_entity_name AS ObjetoReferencia,
 d.is_schema_bound_reference AS Enlazada
FROM sys.sql_expression_dependencies d
WHERE d.referencing_id IN (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas'))
 OR d.referencing_id IN (SELECT object_id FROM sys.check_constraints WHERE parent_object_id IN
 (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas')))
 OR d.referencing_id IN (SELECT object_id FROM sys.default_constraints WHERE parent_object_id IN
 (OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas')));
