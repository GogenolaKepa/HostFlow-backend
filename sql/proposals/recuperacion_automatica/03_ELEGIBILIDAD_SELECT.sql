-- Administrador de base: solo metadatos/conteos, sin hashes ni correos de personas.
IF DB_NAME()<>N'HostFlow' OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5
 THROW 51981,'Destino incompatible; no continuar.',1;
SELECT DB_NAME() AS Base,SERVERPROPERTY('ServerName') AS Servidor;
SELECT r.Nombre AS Rol,u.Estado,COUNT_BIG(*) AS Cuentas,
 SUM(CASE WHEN r.Activo=1 AND u.Estado=N'Activo' AND u.VersionSesion>0 AND u.VersionSesion<2147483647
  AND c.RevocadoEn IS NULL AND c.VerificadoEn IS NOT NULL AND c.VerificadoEn<=SYSUTCDATETIME() AND c.VersionContacto>0
  AND c.Email=u.EmailNormalizado COLLATE Latin1_General_100_BIN2
  AND DATALENGTH(u.PasswordHash)=60 AND LEFT(u.PasswordHash,4) IN('$2a$','$2b$')
  AND SUBSTRING(u.PasswordHash,7,1)='$' AND TRY_CONVERT(int,SUBSTRING(u.PasswordHash,5,2)) BETWEEN 4 AND 15
  AND SUBSTRING(u.PasswordHash,5,2) COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%'
  AND SUBSTRING(u.PasswordHash,8,53) COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^./A-Za-z0-9]%'
  AND EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa=1 AND Activo=1) THEN 1 ELSE 0 END) AS Elegibles
FROM dbo.Usuarios u JOIN dbo.Roles r ON r.IdRol=u.IdRol
LEFT JOIN authcom.Contactos c ON c.IdUsuario=u.IdUsuario
WHERE r.Nombre IN(N'Administrador',N'Operador') GROUP BY r.Nombre,u.Estado;
