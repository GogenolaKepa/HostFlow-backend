-- PREPARADO, NO EJECUTADO. No es una migracion ni vuelve a aprovisionar.
-- Solo SELECT: sin procedimientos, SQL dinamico, transacciones ni escrituras.
-- Ejecutar la primera sentencia por separado y verificar servidor hostflow,
-- base HostFlow y EngineEdition=5 antes de continuar con las restantes.
-- No devuelve nombre, correo, direccion ni otro contenido comercial/personal.
-- Una sesion administrativa NO acredita los permisos de la conexion del backend.

SELECT SERVERPROPERTY('ServerName') AS Servidor, DB_NAME() AS Base,
       SERVERPROPERTY('EngineEdition') AS Motor, USER_NAME() AS Principal;

SELECT COUNT(*) AS EmpresasTotales,
       COUNT(CASE WHEN IdEmpresa=1 AND Activo=1 THEN 1 END) AS Empresa1Activa
FROM dbo.Empresas;

SELECT COUNT(*) AS PreferenciasTotales,
       COUNT(CASE WHEN IdEmpresa=1 THEN 1 END) AS PreferenciasEmpresa1
FROM dbo.PreferenciasOperativas;

SELECT IdEmpresa, Activo, FechaActualizacion,
       CONVERT(varchar(16),VersionRegistro,2) AS RevisionEmpresa
FROM dbo.Empresas WHERE IdEmpresa=1;

SELECT p.IdEmpresa, CONVERT(char(5),p.HoraIngreso,108) AS HoraIngreso,
       CONVERT(char(5),p.HoraEgreso,108) AS HoraEgreso, p.ZonaHoraria,
       p.FechaActualizacion,
       CONVERT(varchar(16),p.VersionRegistro,2) AS RevisionPreferencias
FROM dbo.PreferenciasOperativas p
JOIN dbo.Empresas e ON e.IdEmpresa=p.IdEmpresa
WHERE p.IdEmpresa=1 AND e.Activo=1;

SELECT OBJECT_NAME(major_id) AS Tabla, CONVERT(nvarchar(100),value) AS Modelo
FROM sys.extended_properties
WHERE class=1 AND minor_id=0 AND name=N'HostFlowConfiguracionModelo'
  AND major_id IN (OBJECT_ID(N'dbo.Empresas',N'U'),OBJECT_ID(N'dbo.PreferenciasOperativas',N'U'));

SELECT HAS_PERMS_BY_NAME(N'dbo.Empresas',N'OBJECT',N'SELECT') AS LeerEmpresa,
       HAS_PERMS_BY_NAME(N'dbo.Empresas',N'OBJECT',N'UPDATE') AS EditarEmpresa,
       HAS_PERMS_BY_NAME(N'dbo.PreferenciasOperativas',N'OBJECT',N'SELECT') AS LeerPreferencias,
       HAS_PERMS_BY_NAME(N'dbo.PreferenciasOperativas',N'OBJECT',N'UPDATE') AS EditarPreferencias;
