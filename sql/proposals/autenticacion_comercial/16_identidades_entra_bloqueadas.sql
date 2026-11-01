-- PROPUESTA SEPARADA del candidato01/12/13/04/06/08. No aplicar con esa aprobación.
-- Entra es una opción sin contraseñas en SQL. Los objectId deben acreditarse fuera
-- de este script: SID/TYPE no valida la existencia del objeto en el directorio.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@DirectorioRevisado bit=0;
DECLARE @BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
DECLARE @Ingreso sysname=NULL,@WorkerIngreso sysname=NULL,@Cuentas sysname=NULL,@Correo sysname=NULL;
DECLARE @IngresoObjectId uniqueidentifier=NULL,@WorkerObjectId uniqueidentifier=NULL,
 @CuentasObjectId uniqueidentifier=NULL,@CorreoObjectId uniqueidentifier=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 OR ISNULL(@DirectorioRevisado,0)<>1 THROW 51891,'Aprovisionamiento bloqueado.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),CONVERT(sysname,SERVERPROPERTY('ServerName')))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 51892,'Destino/sesión no acreditados.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthResiliencia' AND CONVERT(nvarchar(80),value)=N'authcom-resiliencia-v1')
 OR NOT EXISTS(SELECT 1 FROM sys.schemas WHERE name=N'authcom' AND principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner')) THROW 51893,'Instalación/aislamiento no acreditados.',1;
DECLARE @Perfiles TABLE(Perfil varchar(20),Nombre sysname,ObjectId uniqueidentifier);
INSERT @Perfiles VALUES('ingresoHttp',@Ingreso,@IngresoObjectId),('workerIngreso',@WorkerIngreso,@WorkerObjectId),('cuentas',@Cuentas,@CuentasObjectId),('correo',@Correo,@CorreoObjectId);
IF EXISTS(SELECT 1 FROM @Perfiles WHERE Nombre IS NULL OR ObjectId IS NULL OR LEN(Nombre) NOT BETWEEN 3 AND 80
 OR REPLACE(REPLACE(Nombre,N'_',N''),N'-',N'') COLLATE Latin1_General_100_BIN2 LIKE N'%[^A-Za-z0-9]%'
 OR LEFT(Nombre,1) COLLATE Latin1_General_100_BIN2 NOT LIKE N'[A-Za-z]'
 OR LOWER(Nombre) IN(N'dbo',N'sa',N'guest',N'public',N'hostflow_app',N'hostflowadmin',N'hostflow_authcom_owner')
 OR DATABASE_PRINCIPAL_ID(Nombre) IS NOT NULL)
 OR (SELECT COUNT(DISTINCT LOWER(Nombre)) FROM @Perfiles)<>4 OR (SELECT COUNT(DISTINCT ObjectId) FROM @Perfiles)<>4
 THROW 51894,'Parámetros, colisión o identidades reutilizadas; detener.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @Perfil varchar(20),@Nombre sysname,@ObjectId uniqueidentifier,@SQL nvarchar(max);
 DECLARE perfiles CURSOR LOCAL FAST_FORWARD FOR SELECT Perfil,Nombre,ObjectId FROM @Perfiles;
 OPEN perfiles;FETCH NEXT FROM perfiles INTO @Perfil,@Nombre,@ObjectId;
 WHILE @@FETCH_STATUS=0
 BEGIN
  SET @SQL=N'CREATE USER '+QUOTENAME(@Nombre)+N' WITH SID = '+CONVERT(varchar(34),CONVERT(varbinary(16),@ObjectId),1)+N', TYPE = E;';
  EXEC sys.sp_executesql @SQL;
  EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthPerfil',@value=@Perfil,@level0type=N'USER',@level0name=@Nombre;
  FETCH NEXT FROM perfiles INTO @Perfil,@Nombre,@ObjectId;
 END;
 CLOSE perfiles;DEALLOCATE perfiles;
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- No GRANT/roles ni activación. Aceptar estas cuatro identidades antes de17.
