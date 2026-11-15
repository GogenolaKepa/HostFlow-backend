-- PROPUESTA DCL SEPARADA. No ejecutar ni retirar esta guarda sin autorización.
THROW 51980, 'PROPUESTA BLOQUEADA. No es un instalador autorizado.', 1;
SET XACT_ABORT ON;
IF DB_NAME()<>N'HostFlow' OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5 OR @@TRANCOUNT<>0
 THROW 51981,'Destino o sesión incompatible.',1;
IF OBJECT_ID(N'authcom.PermitePasswordLocal',N'FN') IS NULL THROW 51982,'Falta función revisada.',1;
IF (SELECT COUNT(*) FROM sys.database_permissions WHERE class=3 AND major_id=SCHEMA_ID(N'authcom')
 AND grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_app') AND state=N'D'
 AND permission_name IN(N'ALTER',N'DELETE',N'EXECUTE',N'INSERT',N'REFERENCES',N'SELECT',N'TAKE OWNERSHIP',N'UPDATE'))<>8
 THROW 51983,'Aislamiento histórico no acreditado.',1;
IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'hostflow_authcom_owner' AND authentication_type_desc=N'NONE')
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner'))
 THROW 51984,'Propietario incompatible.',1;
-- Registrar permisos anteriores antes de una futura aplicación/reversión.
IF EXISTS(SELECT 1 FROM sys.database_permissions WHERE class=1 AND major_id=OBJECT_ID(N'dbo.Usuarios')
 AND minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Usuarios'),N'PasswordHash',N'ColumnId')
 AND grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner'))
 THROW 51985,'Permiso anterior requiere revisión; no reemplazar.',1;
BEGIN TRANSACTION;
GRANT SELECT ON OBJECT::dbo.Usuarios(PasswordHash) TO hostflow_authcom_owner;
GRANT EXECUTE ON OBJECT::authcom.PermitePasswordLocal TO hostflow_auth_worker;
GRANT EXECUTE ON OBJECT::authcom.PermitePasswordLocal TO hostflow_auth_cuentas;
COMMIT;
-- Ningún permiso nuevo sobre hashes para worker/cuentas, ni roles generales,
-- ni GRANT sobre esquema, IMPERSONATE o cambios de permisos de hostflow_app.
