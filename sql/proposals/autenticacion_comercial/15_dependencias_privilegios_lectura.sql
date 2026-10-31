-- SOLO SELECT administrativo dirigido. No expone cuerpos de módulos ni usuarios personales.
-- Completa09/14: dependencias ENTRANTES, contextos privilegiados y roles transitivos.
SELECT DB_NAME() AS Base,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS Servidor,
 ORIGINAL_LOGIN() AS LoginOriginal,USER_NAME() AS Principal,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS VerDefiniciones,
 @@TRANCOUNT AS Transacciones,(@@OPTIONS & 2) AS Implicitas;
SELECT DATABASE_PRINCIPAL_ID(N'hostflow_app') AS IdApp,DATABASE_PRINCIPAL_ID(N'public') AS IdPublic,
 DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner') AS IdPropietario,
 IS_ROLEMEMBER(N'db_owner',N'hostflow_app') AS DbOwner,
 IS_ROLEMEMBER(N'db_securityadmin',N'hostflow_app') AS SecurityAdmin,
 IS_ROLEMEMBER(N'db_ddladmin',N'hostflow_app') AS DdlAdmin,
 IS_ROLEMEMBER(N'db_datareader',N'hostflow_app') AS DataReader,
 IS_ROLEMEMBER(N'db_datawriter',N'hostflow_app') AS DataWriter;
SELECT principal_id,name,is_fixed_role FROM sys.database_principals WHERE type=N'R';
-- IDs, no nombres de personas. Incluye app->rol y todas las aristas rol->rol;
-- calcular cierre transitivo desde IdApp e incorporar IdPublic implícito.
SELECT role_principal_id,member_principal_id FROM sys.database_role_members
WHERE member_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_app')
 OR member_principal_id IN(SELECT principal_id FROM sys.database_principals WHERE type=N'R');
SELECT p.grantee_principal_id,p.class_desc,p.major_id,p.minor_id,p.permission_name,p.state_desc
FROM sys.database_permissions p
WHERE(p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_app')
 OR p.grantee_principal_id IN(SELECT principal_id FROM sys.database_principals WHERE type=N'R'))
 AND p.permission_name IN(N'CONTROL',N'ALTER',N'TAKE OWNERSHIP',N'IMPERSONATE',N'ALTER ANY USER',N'ALTER ANY ROLE',N'ALTER ANY SCHEMA',N'EXECUTE')
 AND(p.class IN(0,3,4) OR p.class=1 AND p.major_id IN(SELECT object_id FROM sys.objects WHERE is_ms_shipped=0));
SELECT s.name AS Esquema,USER_NAME(s.principal_id) AS Propietario FROM sys.schemas s
WHERE s.name IN(N'dbo',N'authcom');
SELECT OBJECT_SCHEMA_NAME(d.referencing_id) AS Esquema,OBJECT_NAME(d.referencing_id) AS Objeto,
 o.type_desc AS Tipo,d.referenced_schema_name AS EsquemaReferencia,d.referenced_entity_name AS ObjetoReferencia,
 d.is_schema_bound_reference AS Enlazada
FROM sys.sql_expression_dependencies d JOIN sys.objects o ON o.object_id=d.referencing_id
WHERE d.referenced_id IN(OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Roles'),OBJECT_ID(N'dbo.Empresas'))
 OR d.referenced_entity_name IN(N'Usuarios',N'Roles',N'Empresas') OR d.referenced_schema_name=N'authcom';
SELECT OBJECT_SCHEMA_NAME(o.object_id) AS Esquema,o.name AS Objeto,o.type_desc AS Tipo,
 m.execute_as_principal_id,CASE WHEN m.definition IS NULL THEN 0 ELSE 1 END AS DefinicionVisible,
 CASE WHEN m.definition LIKE N'%Usuarios%' OR m.definition LIKE N'%Roles%' OR m.definition LIKE N'%Empresas%' THEN 1 ELSE 0 END AS MencionaDependencias,
 CASE WHEN m.definition LIKE N'%authcom%' THEN 1 ELSE 0 END AS MencionaAuthcom
FROM sys.objects o JOIN sys.sql_modules m ON m.object_id=o.object_id WHERE o.is_ms_shipped=0;
SELECT SCHEMA_NAME(schema_id) AS Esquema,name AS Sinonimo,base_object_name AS Destino FROM sys.synonyms
WHERE base_object_name LIKE N'%Usuarios%' OR base_object_name LIKE N'%Roles%'
 OR base_object_name LIKE N'%Empresas%' OR base_object_name LIKE N'%authcom%';
SELECT p.name AS Politica,p.is_enabled,OBJECT_SCHEMA_NAME(pr.target_object_id) AS Esquema,
 OBJECT_NAME(pr.target_object_id) AS Tabla,pr.predicate_type_desc,pr.operation_desc,pr.predicate_definition
FROM sys.security_policies p LEFT JOIN sys.security_predicates pr ON pr.object_id=p.object_id;
-- Roles fijos no enumeran todos sus permisos en sys.database_permissions.
-- Un módulo no visible o un contexto privilegiado exige revisión dirigida, no aprobación por ausencia.
