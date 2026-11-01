-- DCL INDEPENDIENTE de20. No ejecutar sin aprobación del perfil concreto.
-- Sin usuarios nuevos, roles, permisos dbo ni cambios a hostflow_app.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL,@Cuentas sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51986,'Permiso de contacto bloqueado.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL OR @Cuentas IS NULL
 OR @Cuentas IN(N'dbo',N'HostFlowAdmin',N'hostflow_app',N'hostflow_authcom_owner')
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),CONVERT(sysname,SERVERPROPERTY('ServerName')))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL'),0)<>1 THROW 51987,'Destino/autoridad no acreditados.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthContacto' AND CONVERT(nvarchar(80),value)=N'authcom-contacto-v1')
 OR NOT EXISTS(SELECT 1 FROM sys.schemas s JOIN sys.database_principals p ON p.principal_id=s.principal_id WHERE s.name=N'authcom' AND p.name=N'hostflow_authcom_owner' AND p.type=N'S' AND p.authentication_type=0)
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthPermisos' AND CONVERT(nvarchar(80),value)=N'authcom-perfiles-v1')
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals u WHERE u.name=@Cuentas AND u.type=N'E' AND u.authentication_type=4)
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=4 AND major_id=DATABASE_PRINCIPAL_ID(@Cuentas) AND name=N'HostFlowAuthPerfil' AND CONVERT(varchar(20),value)='cuentas')
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=DATABASE_PRINCIPAL_ID(@Cuentas))
 OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=DATABASE_PRINCIPAL_ID(@Cuentas))
 OR (SELECT COUNT(*) FROM sys.database_permissions WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_app')
 AND state='D' AND permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','REFERENCES','TAKE OWNERSHIP'))<>8
 THROW 51988,'Perfil/dependencias incompatibles.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @SQL nvarchar(max)=N'GRANT UPDATE ON OBJECT::authcom.Contactos(Email,VersionContacto,VerificadoEn,RevocadoEn) TO '+QUOTENAME(@Cuentas)+N';';
 EXEC sys.sp_executesql @SQL;
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- SELECT e INSERT ya corresponden a17. No se concede UPDATE IdUsuario ni DELETE.
-- No activar contactos sin aceptación efectiva del perfil y modelo20.
