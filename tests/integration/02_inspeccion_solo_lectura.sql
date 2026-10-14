/* SOLO SELECT de metadatos. Usar lpc:localhost y la base de pruebas exacta. */
SELECT DB_NAME() AS base,
 CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) AS equipo,
 CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS servidor,
 CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName')) AS instancia,
 CONVERT(nvarchar(128),SERVERPROPERTY('Edition')) AS edicion,
 CONVERT(nvarchar(40),SERVERPROPERTY('ProductVersion')) AS version,
 CONVERT(int,SERVERPROPERTY('EngineEdition')) AS motor,
 CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) AS soloWindows,
 CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')) AS transporte,
 CONVERT(nvarchar(40),CONNECTIONPROPERTY('auth_scheme')) AS autenticacion,
 CONVERT(nvarchar(128),DATABASEPROPERTYEX(DB_NAME(),'Collation')) AS collation,
 (SELECT CONVERT(nvarchar(100),value) FROM sys.extended_properties
  WHERE class=0 AND name=N'HostFlowTestIsolation') AS marca,
 (SELECT COUNT(*) FROM sys.objects WHERE is_ms_shipped=0 AND parent_object_id=0
  AND object_id NOT IN (ISNULL(OBJECT_ID(N'dbo.Roles',N'U'),-1),ISNULL(OBJECT_ID(N'dbo.Usuarios',N'U'),-1))) AS objetosInesperados;
SELECT s.name AS esquema,t.name AS tabla,t.object_id AS id,
 CONVERT(nvarchar(100),p.value) AS propietario FROM sys.tables t
 JOIN sys.schemas s ON s.schema_id=t.schema_id
 LEFT JOIN sys.extended_properties p ON p.class=1 AND p.major_id=t.object_id
 AND p.minor_id=0 AND p.name=N'HostFlowTestRun' WHERE t.is_ms_shipped=0;
SELECT s.name AS esquema,o.name,o.type_desc FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 WHERE o.is_ms_shipped=0 AND o.parent_object_id=0;
