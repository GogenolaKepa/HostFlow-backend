-- Propuesta legible, NO aplica DCL. Reemplazar principal solo tras revisión.
SELECT Objeto,Accion FROM (VALUES
 (N'authcom.Contactos',N'SELECT, INSERT'),
 (N'authcom.Desafios',N'SELECT, INSERT, UPDATE'),
 (N'authcom.Cuotas',N'SELECT, INSERT, UPDATE'),
 (N'authcom.Outbox',N'SELECT, INSERT, UPDATE'),
 (N'authcom.Auditoria',N'INSERT'),
 (N'dbo.Usuarios',N'SELECT de columnas requeridas; INSERT para invitación'),
 (N'dbo.Usuarios',N'UPDATE solo PasswordHash, DebeCambiarPassword, VersionSesion, FechaCambioPassword, FechaActualizacion, IdUsuarioActualizacion'),
 (N'dbo.Roles',N'SELECT'),(N'dbo.Empresas',N'SELECT IdEmpresa, Activo'),
 (N'sys.sp_getapplock',N'EXECUTE'),
 (N'authcom',N'Visibilidad de marca de modelo; comprobar permisos efectivos')
) p(Objeto,Accion);
-- Sin DELETE, ALTER, CONTROL, roles de base, acceso a reservas o cambios a permisos actuales.
-- Adaptador actual usa una identidad transaccional; worker con identidad mínima separada
-- requiere adaptar su guarda de metadatos/lock. No conceder UPDATE Usuarios al worker.
