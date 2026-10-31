-- Perfil CUENTAS (confirmación e invitaciones). NO aplica DCL.
-- La separación actual de los otros tres perfiles está en05; no usar este perfil en workers.
SELECT Objeto,Accion FROM (VALUES
 (N'authcom.Contactos',N'SELECT, INSERT'),
 (N'authcom.Desafios',N'SELECT, INSERT, UPDATE'),
 (N'authcom.Cuotas',N'SELECT, INSERT, UPDATE'),
 (N'authcom.Outbox',N'INSERT'),
 (N'authcom.Auditoria',N'INSERT'),
 (N'dbo.Usuarios',N'SELECT IdUsuario,Nombre,Email,EmailNormalizado,PasswordHash,IdRol,Estado,DebeCambiarPassword,VersionSesion,VersionRegistro; INSERT para invitación'),
 (N'dbo.Usuarios',N'UPDATE solo PasswordHash, DebeCambiarPassword, VersionSesion, FechaCambioPassword, FechaActualizacion, IdUsuarioActualizacion'),
 (N'dbo.Roles',N'SELECT IdRol,Nombre,Activo'),(N'dbo.Empresas',N'SELECT IdEmpresa, Activo'),
 (N'sys.sp_getapplock',N'EXECUTE'),
 (N'authcom',N'Visibilidad de marca de modelo; comprobar permisos efectivos')
) p(Objeto,Accion);
-- Sin DELETE, ALTER, CONTROL, roles de base, acceso a reservas o cambios a permisos actuales.
-- Visibilidad: VIEW DEFINITION de schemaauthcom y objetos de dependencia, para marcas
-- y HAS_PERMS_BY_NAME. No requiere VIEW DEFINITION de toda la base ni lectura de filas.
-- INSERT Usuarios sigue siendo autoridad sensible: GRANT no limita IdRol a Operador.
-- La restricción Operador reside en el servicio/SQL parametrizado, no en un sandbox SQL.
-- Revisar este riesgo expresamente antes de aprovisionar la identidad.
