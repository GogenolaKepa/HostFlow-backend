/* PROPUESTA LOCAL. NO EJECUTADA. Requiere aprobacion separada para CREATE DATABASE.
   Ejecutar por lpc:localhost, Windows integrado, master. Nunca Azure. */
DECLARE @EscrituraAutorizada bit = 0;
IF @EscrituraAutorizada<>1 THROW 51503,'Creacion local no autorizada.',1;
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
IF DB_NAME()<>N'master' OR @@TRANCOUNT<>0 THROW 51504,'Usar master sin transaccion previa.',1;
IF (@@OPTIONS & 2)<>0 THROW 51513,'Usar autocommit con IMPLICIT_TRANSACTIONS OFF.',1;
IF DB_ID(N'HostFlow_Test_Seguridad') IS NOT NULL THROW 51505,'La base ya existe. No reemplazar.',1;
CREATE DATABASE [HostFlow_Test_Seguridad] COLLATE SQL_Latin1_General_CP1_CI_AS;
SELECT name,collation_name FROM sys.databases WHERE name=N'HostFlow_Test_Seguridad';
