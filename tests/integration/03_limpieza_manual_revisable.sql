/* PROPUESTA LOCAL. NO EJECUTADA. Solo tras inspeccion y aprobacion de limpieza.
   Completar RunId con la ejecucion acreditada, nunca un valor supuesto.
   No elimina bases ni tablas sin propiedad coincidente. Uso exclusivo sin runner activo. */
DECLARE @EscrituraAutorizada bit = 0;
DECLARE @RunId uniqueidentifier = NULL;
IF @EscrituraAutorizada<>1 OR @RunId IS NULL THROW 51509,'Falta aprobacion/identificador de limpieza.',1;
IF ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')),N'') COLLATE Latin1_General_100_BIN2<>N'PC-Escritorio'
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>N'PC-Escritorio'
 OR SERVERPROPERTY('InstanceName') IS NOT NULL
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>3
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('Edition')),N'')<>N'Enterprise Evaluation Edition (64-bit)'
 OR ISNULL(CONVERT(nvarchar(40),SERVERPROPERTY('ProductVersion')),N'') NOT LIKE N'17.%'
 OR ISNULL(CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')),0)<>1
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')),N'')<>N'Shared memory'
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('auth_scheme')),N'') NOT IN(N'NTLM',N'KERBEROS')
 THROW 51500,'Instancia local Windows no acreditada.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow_Test_Seguridad'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow_Test_Seguridad')
 OR ISNULL(CONVERT(nvarchar(128),DATABASEPROPERTYEX(DB_NAME(),'Collation')),N'')<>N'SQL_Latin1_General_CP1_CI_AS'
 THROW 51501,'Base o collation incorrecta.',1;

IF @@TRANCOUNT<>0 THROW 51510,'Usar sesion sin transaccion previa.',1;
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF EXISTS(SELECT 1 FROM sys.objects WHERE is_ms_shipped=0 AND parent_object_id=0
 AND object_id NOT IN(ISNULL(OBJECT_ID(N'dbo.Roles',N'U'),-1),ISNULL(OBJECT_ID(N'dbo.Usuarios',N'U'),-1)))
 THROW 51502,'Objetos ajenos: inspeccion manual requerida.',1;

 IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'HostFlowTestIsolation'
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-security-disposable-v1')
 THROW 51511,'Marca de aislamiento ausente.',1;
 IF EXISTS(SELECT 1 FROM sys.tables t LEFT JOIN sys.extended_properties p
 ON p.class=1 AND p.major_id=t.object_id AND p.minor_id=0 AND p.name=N'HostFlowTestRun'
 WHERE t.is_ms_shipped=0 AND(t.schema_id<>SCHEMA_ID(N'dbo') OR t.name NOT IN(N'Roles',N'Usuarios')
 OR ISNULL(CONVERT(nvarchar(100),p.value),N'') COLLATE Latin1_General_100_BIN2<>CONVERT(nvarchar(36),@RunId)
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(100),p.value)),0)<>72))
 THROW 51512,'Pertenencia no acreditada. No eliminar.',1;
 IF OBJECT_ID(N'dbo.Usuarios',N'U') IS NOT NULL DROP TABLE dbo.Usuarios;
 IF OBJECT_ID(N'dbo.Roles',N'U') IS NOT NULL DROP TABLE dbo.Roles;
 COMMIT TRANSACTION;
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK TRANSACTION; THROW; END CATCH;
