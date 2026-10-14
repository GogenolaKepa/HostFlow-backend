/* PROPUESTA LOCAL. NO EJECUTADA. Requiere aprobacion separada para escribir la marca.
   La base exacta debe existir, estar vacia y ser de uso exclusivo. */
DECLARE @EscrituraAutorizada bit = 0;
IF @EscrituraAutorizada<>1 THROW 51506,'Marca local no autorizada.',1;
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
IF EXISTS(SELECT 1 FROM sys.objects WHERE is_ms_shipped=0 AND parent_object_id=0
 AND object_id NOT IN(ISNULL(OBJECT_ID(N'dbo.Roles',N'U'),-1),ISNULL(OBJECT_ID(N'dbo.Usuarios',N'U'),-1)))
 THROW 51502,'Objetos ajenos: inspeccion manual requerida.',1;

IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0) THROW 51507,'La base debe estar vacia.',1;
IF EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'HostFlowTestIsolation')
 THROW 51508,'Existe una marca previa; inspeccionar sin sobrescribir.',1;
EXEC sys.sp_addextendedproperty @name=N'HostFlowTestIsolation',@value=N'hostflow-security-disposable-v1';
