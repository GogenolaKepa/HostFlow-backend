-- SOLO LOCAL. NO EJECUTADO. Autorizar CREAR + MARCAR por separado del esquema.
-- Abrir SSMS, Windows integrado, servidor lpc:localhost, base master.
-- Batch completo, sin transaccion externa. NO USE ni GO entre guarda y CREATE.
DECLARE @CrearYMarcar bit=0;
IF ISNULL(@CrearYMarcar,0)<>1 THROW 51930,'Creacion local no autorizada.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'master' OR DATALENGTH(DB_NAME())<>DATALENGTH(N'master')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>N'PC-Escritorio'
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(N'PC-Escritorio')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')),N'') COLLATE Latin1_General_100_BIN2<>N'PC-Escritorio'
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>3
 OR ISNULL(CONVERT(int,SERVERPROPERTY('ProductMajorVersion')),0)<>17
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')),N'')<>N'Shared memory'
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('auth_scheme')),N'') NOT IN(N'NTLM',N'KERBEROS')
 OR ISNULL(IS_SRVROLEMEMBER(N'sysadmin'),0)<>1
 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 THROW 51931,'Instancia local/autocommit no acreditados.',1;
IF DB_ID(N'HostFlow_Test_Notificaciones_V2') IS NOT NULL
 THROW 51932,'Base preexistente: nunca adoptar, limpiar ni reemplazar.',1;
-- CREATE DATABASE fuera de BEGIN TRANSACTION: no hay transaccion explicita.
CREATE DATABASE [HostFlow_Test_Notificaciones_V2] COLLATE SQL_Latin1_General_CP1_CI_AS;
EXEC [HostFlow_Test_Notificaciones_V2].sys.sp_addextendedproperty
 @name=N'HostFlowTestIsolation',@value=N'hostflow-notifications-disposable-v2';
-- Si falla la marca, la base puede existir. NO repetir ni borrar automaticamente.
SELECT name,create_date,collation_name FROM sys.databases WHERE name=N'HostFlow_Test_Notificaciones_V2';
