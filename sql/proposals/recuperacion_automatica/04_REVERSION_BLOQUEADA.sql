-- Solo después de cerrar servicios y restaurar configuración anterior aprobada.
-- No elimina cuentas, desafíos, auditoría, cuotas ni outbox.
THROW 51980, 'REVERSION BLOQUEADA. Requiere autorización y preimágenes.', 1;
SET XACT_ABORT ON;
IF DB_NAME()<>N'HostFlow' OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5 OR @@TRANCOUNT<>0
 THROW 51981,'Destino incompatible.',1;
IF OBJECT_ID(N'authcom.PermitePasswordLocal',N'FN') IS NULL OR NOT EXISTS
 (SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthPasswordLocal' AND CONVERT(nvarchar(80),value)=N'authcom-password-local-v1')
 THROW 51982,'Modelo anterior no acreditado.',1;
IF EXISTS(SELECT 1 FROM sys.sql_expression_dependencies WHERE referenced_id=OBJECT_ID(N'authcom.PermitePasswordLocal'))
 THROW 51983,'Hay dependencias nuevas; revisar antes de revertir.',1;
BEGIN TRANSACTION;
REVOKE EXECUTE ON OBJECT::authcom.PermitePasswordLocal FROM hostflow_auth_worker;
REVOKE EXECUTE ON OBJECT::authcom.PermitePasswordLocal FROM hostflow_auth_cuentas;
DROP FUNCTION authcom.PermitePasswordLocal;
EXEC sys.sp_dropextendedproperty @name=N'HostFlowAuthPasswordLocal',@level0type=N'SCHEMA',@level0name=N'authcom';
-- Aplicar únicamente si la preimagen de permisos acredita que se añadió aquí.
REVOKE SELECT ON OBJECT::dbo.Usuarios(PasswordHash) FROM hostflow_authcom_owner;
COMMIT;
