-- DDL ADITIVO separado. Requiere autorización específica para el principal SIN LOGIN.
-- Orden:01 ->12 ->13 ->04 ->06 ->08. Backend y workers detenidos durante toda la ventana.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51860,'Propietario comercial bloqueado.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),ISNULL(CONVERT(sysname,SERVERPROPERTY('ServerName')),N''))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0 THROW 51861,'Destino/sesión no acreditados.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 51862,'Visibilidad administrativa insuficiente.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthModelo' AND CONVERT(nvarchar(80),value)=N'authcom-v1')
 OR NOT EXISTS(SELECT 1 FROM sys.schemas WHERE name=N'authcom' AND principal_id=DATABASE_PRINCIPAL_ID(N'dbo'))
 OR DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner') IS NOT NULL
 THROW 51863,'Modelo, propietario o nombre preexistente incompatibles; no repetir.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 CREATE USER [hostflow_authcom_owner] WITHOUT LOGIN;
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- No otorga roles, CONNECT con credenciales, IMPERSONATE ni permisos operativos.
-- Solo13 asignará el esquema a este propietario, con autorización DCL separada.
