-- PROPUESTA BLOQUEADA. No ejecutar sin autorización administrativa SEPARADA.
DECLARE @RecuperarRoles bit=0;
DECLARE @InspeccionAprobada bit=0;
DECLARE @ServidorEsperado sysname=NULL;
DECLARE @PrincipalIdEsperado int=NULL;
DECLARE @SidEsperado varbinary(85)=NULL;
IF ISNULL(@RecuperarRoles,0)<>1 OR ISNULL(@InspeccionAprobada,0)<>1
 THROW 51630,'Operacion bloqueada: requiere autorizacion especifica.',1;
IF @ServidorEsperado IS NULL OR @PrincipalIdEsperado IS NULL OR @SidEsperado IS NULL
 OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 THROW 51631,'Destino exacto no acreditado.',1;
IF @PrincipalIdEsperado<=4 OR NOT EXISTS(SELECT 1 FROM sys.database_principals
 WHERE principal_id=@PrincipalIdEsperado AND sid=@SidEsperado AND type IN('S','U','E','X')
 AND name COLLATE Latin1_General_100_BIN2=N'hostflow_app' AND DATALENGTH(name)=DATALENGTH(N'hostflow_app'))
 THROW 51632,'Principal y SID no acreditados: no cambiar permisos.',1;
IF USER_NAME()=N'hostflow_app' OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL'),0)<>1
 THROW 51633,'Usar una identidad administrativa existente, distinta del backend.',1;
IF @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 THROW 51634,'Usar sesion dedicada en autocommit, sin transacciones previas.',1;
IF EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=@PrincipalIdEsperado)
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=@PrincipalIdEsperado)
 THROW 51635,'La aplicacion posee objetos/esquemas: revisar propiedad antes de continuar.',1;

DECLARE @SnapshotPrevioConfirmado bit=0;
IF ISNULL(@SnapshotPrevioConfirmado,0)<>1 THROW 51636,'Requiere snapshot de ambas membresias previas y autorizacion de recuperacion.',1;
-- Recuperación EXCEPCIONAL: reintroduce el exceso original. No es estado final.
-- Conserva GRANT específicos; no ejecuta REVOKE ni toca datos.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF NOT EXISTS(SELECT 1 FROM sys.database_role_members WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'db_datareader') AND member_principal_id=@PrincipalIdEsperado)
  ALTER ROLE [db_datareader] ADD MEMBER [hostflow_app];
 IF NOT EXISTS(SELECT 1 FROM sys.database_role_members WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'db_datawriter') AND member_principal_id=@PrincipalIdEsperado)
  ALTER ROLE [db_datawriter] ADD MEMBER [hostflow_app];
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
