-- SOLO SELECT. Identidad09 antes; secciones administrativas no consultan usuarios personales.
SELECT DB_NAME() AS Base,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS Servidor,
 USER_NAME() AS Principal,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS VerDefiniciones;
SELECT s.name AS Esquema,USER_NAME(s.principal_id) AS Propietario,p.type_desc,p.authentication_type_desc
FROM sys.schemas s JOIN sys.database_principals p ON p.principal_id=s.principal_id WHERE s.name=N'authcom';
SELECT name,type_desc,authentication_type_desc FROM sys.database_principals WHERE name=N'hostflow_authcom_owner';
SELECT USER_NAME(m.role_principal_id) AS Rol FROM sys.database_role_members m
WHERE m.member_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner');
SELECT p.class_desc,p.state_desc,p.permission_name,SCHEMA_NAME(p.major_id) AS Esquema
FROM sys.database_permissions p WHERE p.class=3 AND p.major_id=SCHEMA_ID(N'authcom')
 AND p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_app');
SELECT s.name AS Esquema,o.name AS Objeto,USER_NAME(o.principal_id) AS PropietarioExplicito,o.type_desc
FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
WHERE s.name=N'authcom' AND o.principal_id IS NOT NULL;
SELECT OBJECT_SCHEMA_NAME(d.referencing_id) AS Esquema,OBJECT_NAME(d.referencing_id) AS Objeto,
 d.referenced_schema_name,d.referenced_entity_name,m.execute_as_principal_id
FROM sys.sql_expression_dependencies d LEFT JOIN sys.sql_modules m ON m.object_id=d.referencing_id
WHERE d.referenced_schema_name=N'authcom' OR OBJECT_SCHEMA_NAME(d.referenced_id)=N'authcom';
-- Sección de capacidad efectiva: ejecutar también desde la conexión EXISTENTE hostflow_app.
-- Principal debe ser hostflow_app para atribuirle estos resultados. No usar EXECUTE AS en Azure aquí.
SELECT USER_NAME() AS Principal,Objeto,Permiso,HAS_PERMS_BY_NAME(Objeto,Clase,Permiso) AS Efectivo
FROM(VALUES(N'authcom',N'SCHEMA',N'SELECT'),(N'authcom',N'SCHEMA',N'INSERT'),
 (N'authcom',N'SCHEMA',N'UPDATE'),(N'authcom',N'SCHEMA',N'DELETE'),
 (N'authcom',N'SCHEMA',N'ALTER'),(N'authcom',N'SCHEMA',N'EXECUTE'),
 (N'dbo',N'SCHEMA',N'ALTER'),(N'dbo',N'SCHEMA',N'CONTROL'),
 (N'hostflow_authcom_owner',N'USER',N'IMPERSONATE'),(N'dbo',N'USER',N'IMPERSONATE'),
 (N'dbo.Usuarios',N'OBJECT',N'SELECT'),(N'dbo.Usuarios',N'OBJECT',N'INSERT'))v(Objeto,Clase,Permiso);
SELECT USER_NAME() AS Principal,Permiso,HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',Permiso) AS Efectivo
FROM(VALUES(N'CONTROL'),(N'ALTER ANY USER'),(N'ALTER ANY ROLE'),(N'ALTER ANY SCHEMA'))v(Permiso);
SELECT permission_name AS PermisoImpersonacionSoportado FROM sys.fn_builtin_permissions(N'DATABASE')
WHERE permission_name LIKE N'%IMPERSONATE%';
-- IMPERSONATE ANY USER devolvióNULL en Azure: no tratarlo como permiso denegado.
-- Revisar permisos de usuario específicos y capacidades soportadas en ese motor.
-- Módulos con contexto privilegiado/firmas necesitan revisión dirigida aunque no
-- tengan una referencia estática a authcom. No devolver sus cuerpos ni firmas.
SELECT OBJECT_SCHEMA_NAME(m.object_id) AS Esquema,OBJECT_NAME(m.object_id) AS Objeto,
 m.execute_as_principal_id,CASE WHEN m.definition IS NULL THEN 0 ELSE 1 END AS DefinicionVisible,
 CASE WHEN m.definition LIKE N'%authcom%' THEN 1 ELSE 0 END AS MencionaAuthcom
FROM sys.sql_modules m WHERE m.execute_as_principal_id IS NOT NULL OR m.definition LIKE N'%authcom%';
SELECT OBJECT_SCHEMA_NAME(c.major_id) AS Esquema,OBJECT_NAME(c.major_id) AS Objeto,c.crypt_type_desc
FROM sys.crypt_properties c WHERE c.class=1;
SELECT grantee_principal_id,permission_name,state_desc FROM sys.database_permissions
WHERE class=4 AND major_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner');
-- Antes de12: propietario ausente/NULL es esperado. Después de13: NULL no acredita denegación.
