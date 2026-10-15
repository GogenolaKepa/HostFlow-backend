-- SOLO METADATOS. Preparado, NO ejecutado. Requiere autorización de lectura.
-- No consultar filas, contraseñas ni hashes. La sesión debe tener VIEW DEFINITION.
SELECT DB_NAME() AS Base,SERVERPROPERTY('ServerName') AS Servidor,
 SERVERPROPERTY('EngineEdition') AS Motor,USER_NAME() AS Sesion,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS Visibilidad;
SELECT principal_id,name,type_desc,sid,authentication_type_desc FROM sys.database_principals
 WHERE name=N'hostflow_app';
;WITH P AS (
 SELECT principal_id,0 AS Nivel FROM sys.database_principals WHERE name=N'hostflow_app'
 UNION ALL SELECT rm.role_principal_id,P.Nivel+1 FROM P JOIN sys.database_role_members rm ON rm.member_principal_id=P.principal_id
)
SELECT P.Nivel,d.principal_id,d.name,d.type_desc FROM P JOIN sys.database_principals d ON d.principal_id=P.principal_id
OPTION(MAXRECURSION 32);
;WITH P AS (
 SELECT principal_id FROM sys.database_principals WHERE name IN(N'hostflow_app',N'public')
 UNION ALL SELECT rm.role_principal_id FROM P JOIN sys.database_role_members rm ON rm.member_principal_id=P.principal_id
)
SELECT dp.name AS Beneficiario,p.class_desc,p.major_id,p.minor_id,p.permission_name,p.state_desc,
 CASE WHEN p.class=1 THEN OBJECT_SCHEMA_NAME(p.major_id) END AS Esquema,
 CASE WHEN p.class=1 THEN OBJECT_NAME(p.major_id) END AS Objeto
FROM sys.database_permissions p JOIN sys.database_principals dp ON dp.principal_id=p.grantee_principal_id
WHERE p.grantee_principal_id IN(SELECT principal_id FROM P) OPTION(MAXRECURSION 32);
-- Los permisos propios de roles fijos NO están todos en sys.database_permissions.
SELECT s.name AS Esquema,t.name AS Tabla,t.principal_id AS PropietarioExplicito,
 s.principal_id AS PropietarioEsquema,t.is_memory_optimized,t.temporal_type_desc
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.is_ms_shipped=0;
SELECT s.name AS Esquema,t.name AS Tabla,c.name AS Columna,ty.name AS Tipo,c.max_length,c.is_nullable,c.is_computed
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id;
SELECT tr.name,OBJECT_SCHEMA_NAME(tr.parent_id) AS Esquema,OBJECT_NAME(tr.parent_id) AS Tabla,
 tr.is_disabled,tr.is_instead_of_trigger,sm.execute_as_principal_id,
 CASE WHEN sm.definition IS NULL THEN 0 ELSE 1 END AS DefinicionVisible
FROM sys.triggers tr LEFT JOIN sys.sql_modules sm ON sm.object_id=tr.object_id WHERE tr.is_ms_shipped=0;
SELECT OBJECT_SCHEMA_NAME(referencing_id) AS EsquemaOrigen,OBJECT_NAME(referencing_id) AS ObjetoOrigen,
 referenced_server_name,referenced_database_name,referenced_schema_name,referenced_entity_name,is_ambiguous
FROM sys.sql_expression_dependencies;
SELECT s.name AS Esquema,sy.name AS Sinonimo,sy.base_object_name FROM sys.synonyms sy JOIN sys.schemas s ON s.schema_id=sy.schema_id;
SELECT p.name,p.is_enabled,OBJECT_SCHEMA_NAME(pr.target_object_id) AS Esquema,
 OBJECT_NAME(pr.target_object_id) AS Tabla,pr.predicate_type_desc,pr.operation_desc
FROM sys.security_policies p JOIN sys.security_predicates pr ON pr.object_id=p.object_id;
SELECT OBJECT_SCHEMA_NAME(parent_object_id) AS Esquema,OBJECT_NAME(parent_object_id) AS Tabla,
 name,is_disabled,is_not_trusted,delete_referential_action_desc,update_referential_action_desc
FROM sys.foreign_keys;
SELECT OBJECT_SCHEMA_NAME(object_id) AS Esquema,OBJECT_NAME(object_id) AS Tabla,name AS Columna,is_masked
FROM sys.masked_columns WHERE is_masked=1;
