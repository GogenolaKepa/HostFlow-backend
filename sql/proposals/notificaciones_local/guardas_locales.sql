-- FRAGMENTO SOLO PARA COPIAS LOCALES. No ejecuta ni aprovisiona por si mismo.
-- Identidad documentada anteriormente; debe reconfirmarse ANTES de autorizar.
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow_Test_Notificaciones_V2'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow_Test_Notificaciones_V2')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>N'PC-Escritorio'
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(N'PC-Escritorio')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')),N'') COLLATE Latin1_General_100_BIN2<>N'PC-Escritorio'
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>3
 OR ISNULL(CONVERT(int,SERVERPROPERTY('ProductMajorVersion')),0)<>17
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')),N'')<>N'Shared memory'
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('auth_scheme')),N'') NOT IN(N'NTLM',N'KERBEROS')
 OR ISNULL(CONVERT(nvarchar(128),DATABASEPROPERTYEX(DB_NAME(),'Collation')),N'') COLLATE Latin1_General_100_BIN2<>N'SQL_Latin1_General_CP1_CI_AS'
 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 THROW 51940,'Destino local aislado no acreditado; no adaptar automaticamente.',1;
IF ISNULL(IS_SRVROLEMEMBER(N'sysadmin'),0)<>1
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'HostFlowTestIsolation'
 AND CONVERT(nvarchar(128),value) COLLATE Latin1_General_100_BIN2=N'hostflow-notifications-disposable-v2'
 AND DATALENGTH(CONVERT(nvarchar(128),value))=DATALENGTH(N'hostflow-notifications-disposable-v2'))
 THROW 51941,'Requiere administrador local y marca de base descartable.',1;
IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0 AND
 (SCHEMA_NAME(schema_id)<>N'dbo' OR name NOT IN(N'Usuarios',N'Empresas',N'Notificaciones',N'NotificacionDestinatarios',N'PreferenciasNotificacionUsuario',N'PoliticasNotificacionEmpresa')))
 OR EXISTS(SELECT 1 FROM sys.synonyms)
 OR EXISTS(SELECT 1 FROM sys.objects WHERE is_ms_shipped=0 AND type IN('V','P','PC','FN','IF','TF','FS','FT','TR','TA','SQ'))
 OR EXISTS(SELECT 1 FROM sys.sql_modules WHERE object_id IN(SELECT object_id FROM sys.objects WHERE is_ms_shipped=0))
 THROW 51942,'Objetos ajenos al fixture: detenerse sin limpiar.',1;
