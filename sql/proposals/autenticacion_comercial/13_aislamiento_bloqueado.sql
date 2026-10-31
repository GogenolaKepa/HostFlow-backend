-- DCL separado, bloqueado. Ejecutar solo con autorización expresa y después de01/12.
-- No cambia roles ni permisos de dbo. No crea identidades de runtime ni correos.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51870,'Aislamiento comercial bloqueado.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),ISNULL(CONVERT(sysname,SERVERPROPERTY('ServerName')),N''))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0 THROW 51871,'Destino/sesión no acreditados.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 51872,'Visibilidad administrativa insuficiente.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthModelo' AND CONVERT(nvarchar(80),value)=N'authcom-v1')
 OR NOT EXISTS(SELECT 1 FROM sys.schemas WHERE name=N'authcom' AND principal_id=DATABASE_PRINCIPAL_ID(N'dbo'))
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'hostflow_authcom_owner' AND type=N'S' AND authentication_type=0)
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'hostflow_app' AND type=N'S')
 OR ISNULL(IS_ROLEMEMBER(N'db_owner',N'hostflow_app'),1)<>0
 OR ISNULL(IS_ROLEMEMBER(N'db_securityadmin',N'hostflow_app'),1)<>0
 OR ISNULL(IS_ROLEMEMBER(N'db_ddladmin',N'hostflow_app'),1)<>0
 THROW 51873,'Identidades/modelo incompatibles o aislamiento ya aplicado.',1;
IF EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner'))
 OR EXISTS(SELECT 1 FROM sys.database_permissions WHERE grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner') AND permission_name<>N'CONNECT')
 OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner'))
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner'))
 THROW 51874,'El propietario sin login no está reservado exclusivamente a esta instalación.',1;
IF (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID(N'authcom'))<>5
 OR EXISTS(SELECT 1 FROM sys.objects WHERE schema_id=SCHEMA_ID(N'authcom') AND (principal_id IS NOT NULL OR (parent_object_id=0 AND type<>N'U')))
 OR OBJECT_ID(N'authcom.Ingresos') IS NOT NULL
 THROW 51875,'Estado parcial inesperado u objeto con propietario explícito.',1;
-- Estado recién instalado por01: no tocar contactos/desafíos previos ni entregas en vuelo.
IF EXISTS(SELECT 1 FROM authcom.Contactos) OR EXISTS(SELECT 1 FROM authcom.Desafios)
 OR EXISTS(SELECT 1 FROM authcom.Cuotas) OR EXISTS(SELECT 1 FROM authcom.Outbox) OR EXISTS(SELECT 1 FROM authcom.Auditoria)
 THROW 51876,'Authcom no está vacío: detener y revisar, sin reinterpretar datos.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 ALTER AUTHORIZATION ON SCHEMA::authcom TO [hostflow_authcom_owner];
 DENY SELECT,INSERT,UPDATE,DELETE,EXECUTE,ALTER,REFERENCES,TAKE OWNERSHIP
  ON SCHEMA::authcom TO [hostflow_app];
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- Revalidar desde hostflow_app: denegaciones authcom y permisos operativos dbo.
-- No otorga autoridad a otros principales; revisar IMPERSONATE/CONTROL/propiedad
-- y cualquier módulo de ejecución privilegiada antes de reabrir servicios.
