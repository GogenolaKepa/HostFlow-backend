-- Ejecutar administrativamente solo después de autorizar la inspección.
-- Valida GRANT por objeto; NO prueba derechos finales mientras sigan roles amplios.
DECLARE @PrincipalId int=DATABASE_PRINCIPAL_ID(N'hostflow_app');
DECLARE @Necesarios table(Objeto sysname NOT NULL,Permiso nvarchar(60) NOT NULL,PRIMARY KEY(Objeto,Permiso));
INSERT INTO @Necesarios(Objeto,Permiso) VALUES
 (N'dbo.Roles',N'SELECT'),
 (N'dbo.Usuarios',N'SELECT'),
 (N'dbo.Usuarios',N'INSERT'),
 (N'dbo.Usuarios',N'UPDATE'),
 (N'dbo.CanalesReserva',N'SELECT'),
 (N'dbo.EstadosReserva',N'SELECT'),
 (N'dbo.EstadosPropiedad',N'SELECT'),
 (N'dbo.Propiedades',N'SELECT'),
 (N'dbo.Propiedades',N'INSERT'),
 (N'dbo.Propiedades',N'UPDATE'),
 (N'dbo.Huespedes',N'SELECT'),
 (N'dbo.Huespedes',N'INSERT'),
 (N'dbo.Huespedes',N'UPDATE'),
 (N'dbo.Reservas',N'SELECT'),
 (N'dbo.Reservas',N'INSERT'),
 (N'dbo.Reservas',N'UPDATE'),
 (N'dbo.ReservaEventos',N'SELECT'),
 (N'dbo.ReservaEventos',N'INSERT'),
 (N'dbo.ReservaMensajes',N'SELECT'),
 (N'dbo.ReservaMensajes',N'INSERT'),
 (N'dbo.ReservaMensajes',N'UPDATE'),
 (N'dbo.ReservaIncidencias',N'SELECT'),
 (N'dbo.ReservaIncidencias',N'INSERT'),
 (N'dbo.ReservaIncidencias',N'UPDATE'),
 (N'dbo.ReservaObservaciones',N'SELECT'),
 (N'dbo.ReservaObservaciones',N'INSERT'),
 (N'dbo.ReservaObservaciones',N'UPDATE'),
 (N'dbo.ReservaObservaciones',N'DELETE'),
 (N'dbo.TareasLimpieza',N'SELECT'),
 (N'dbo.TareasLimpieza',N'INSERT'),
 (N'dbo.TareasLimpieza',N'UPDATE'),
 (N'dbo.Alertas',N'SELECT'),
 (N'dbo.Alertas',N'INSERT'),
 (N'dbo.Alertas',N'UPDATE'),
 (N'dbo.PropiedadCanales',N'SELECT'),
 (N'dbo.PropiedadCanales',N'INSERT'),
 (N'dbo.PropiedadCanales',N'UPDATE'),
 (N'dbo.PropiedadImagenes',N'SELECT'),
 (N'dbo.PropiedadImagenes',N'INSERT'),
 (N'dbo.PropiedadImagenes',N'UPDATE'),
 (N'dbo.PropiedadImagenCanales',N'SELECT'),
 (N'dbo.PropiedadImagenCanales',N'INSERT'),
 (N'dbo.PropiedadImagenCanales',N'UPDATE'),
 (N'dbo.PropiedadImagenCanales',N'DELETE'),
 (N'dbo.Empresas',N'SELECT'),
 (N'dbo.Empresas',N'UPDATE'),
 (N'dbo.PreferenciasOperativas',N'SELECT'),
 (N'dbo.PreferenciasOperativas',N'UPDATE');
IF EXISTS(SELECT 1 FROM @Necesarios WHERE OBJECT_ID(Objeto,N'U') IS NULL)
 THROW 51690,'Faltan tablas de la matriz: no crear ni migrar desde este script.',1;

SELECT n.Objeto,n.Permiso,p.state_desc,
 CASE WHEN p.state='G' THEN 1 ELSE 0 END AS ConcesionDirectaSinDelegacion
FROM @Necesarios n LEFT JOIN sys.database_permissions p ON p.class=1 AND p.major_id=OBJECT_ID(n.Objeto)
 AND p.minor_id=0 AND p.permission_name COLLATE Latin1_General_100_BIN2=n.Permiso COLLATE Latin1_General_100_BIN2 AND p.grantee_principal_id=@PrincipalId;
SELECT rp.name AS Rol,mp.name AS Miembro FROM sys.database_role_members rm
JOIN sys.database_principals rp ON rp.principal_id=rm.role_principal_id
JOIN sys.database_principals mp ON mp.principal_id=rm.member_principal_id WHERE mp.principal_id=@PrincipalId;
SELECT p.class_desc,p.major_id,p.minor_id,p.permission_name,p.state_desc FROM sys.database_permissions p
WHERE p.grantee_principal_id IN(@PrincipalId,DATABASE_PRINCIPAL_ID(N'public'))
 AND (p.state='D' OR p.class IN(0,3) OR p.state='W');
