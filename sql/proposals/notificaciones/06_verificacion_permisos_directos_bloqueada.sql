-- PROPUESTA BLOQUEADA: solo metadatos del principal, SIN SID ni impersonacion.
-- No ejecuta concesiones. No sustituye la prueba futura de conexion efectiva.
DECLARE @Verificar bit=0,@ServidorEsperado sysname=NULL,@PrincipalBackend sysname=NULL;
IF ISNULL(@Verificar,0)<>1 OR @ServidorEsperado IS NULL OR @PrincipalBackend IS NULL
 OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow' OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 OR @PrincipalBackend COLLATE Latin1_General_100_BIN2<>N'hostflow_app' OR DATALENGTH(@PrincipalBackend)<>DATALENGTH(N'hostflow_app')
 THROW 51910,'Verificacion administrativa no autorizada o destino/principal incorrectos.',1;
IF USER_NAME() COLLATE Latin1_General_100_BIN2=@PrincipalBackend COLLATE Latin1_General_100_BIN2
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL'),0)<>1
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1
 THROW 51911,'Usar una sesion administrativa existente con visibilidad completa.',1;
DECLARE @PrincipalId int;
SELECT @PrincipalId=principal_id FROM sys.database_principals
 WHERE name COLLATE Latin1_General_100_BIN2=@PrincipalBackend COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(name)=DATALENGTH(@PrincipalBackend) AND type IN('S','U','E','X');
IF @PrincipalId IS NULL THROW 51912,'Principal existente no acreditado.',1;
IF OBJECT_ID(N'dbo.Notificaciones',N'U') IS NULL OR OBJECT_ID(N'dbo.NotificacionDestinatarios',N'U') IS NULL
 OR OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario',N'U') IS NULL OR OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa',N'U') IS NULL
 THROW 51913,'Faltan tablas: esta verificacion nunca las crea.',1;
-- Universo completo de concesiones DIRECTAS: 48 historicas + 7 nuevas.
-- CONNECT directo u otra excepcion aparece como Adicional: revisarla, no borrarla.
-- G es GRANT sin delegacion. W, D y R NO equivalen a una concesion G esperada.
;WITH Esperadas(Tabla,Columna,Permiso,Grupo) AS (
 SELECT * FROM (VALUES
 (N'Roles',N'',N'SELECT',N'Historico48'),
 (N'Usuarios',N'',N'SELECT',N'Historico48'),
 (N'Usuarios',N'',N'INSERT',N'Historico48'),
 (N'Usuarios',N'',N'UPDATE',N'Historico48'),
 (N'CanalesReserva',N'',N'SELECT',N'Historico48'),
 (N'EstadosReserva',N'',N'SELECT',N'Historico48'),
 (N'EstadosPropiedad',N'',N'SELECT',N'Historico48'),
 (N'Propiedades',N'',N'SELECT',N'Historico48'),
 (N'Propiedades',N'',N'INSERT',N'Historico48'),
 (N'Propiedades',N'',N'UPDATE',N'Historico48'),
 (N'Huespedes',N'',N'SELECT',N'Historico48'),
 (N'Huespedes',N'',N'INSERT',N'Historico48'),
 (N'Huespedes',N'',N'UPDATE',N'Historico48'),
 (N'Reservas',N'',N'SELECT',N'Historico48'),
 (N'Reservas',N'',N'INSERT',N'Historico48'),
 (N'Reservas',N'',N'UPDATE',N'Historico48'),
 (N'ReservaEventos',N'',N'SELECT',N'Historico48'),
 (N'ReservaEventos',N'',N'INSERT',N'Historico48'),
 (N'ReservaMensajes',N'',N'SELECT',N'Historico48'),
 (N'ReservaMensajes',N'',N'INSERT',N'Historico48'),
 (N'ReservaMensajes',N'',N'UPDATE',N'Historico48'),
 (N'ReservaIncidencias',N'',N'SELECT',N'Historico48'),
 (N'ReservaIncidencias',N'',N'INSERT',N'Historico48'),
 (N'ReservaIncidencias',N'',N'UPDATE',N'Historico48'),
 (N'ReservaObservaciones',N'',N'SELECT',N'Historico48'),
 (N'ReservaObservaciones',N'',N'INSERT',N'Historico48'),
 (N'ReservaObservaciones',N'',N'UPDATE',N'Historico48'),
 (N'ReservaObservaciones',N'',N'DELETE',N'Historico48'),
 (N'TareasLimpieza',N'',N'SELECT',N'Historico48'),
 (N'TareasLimpieza',N'',N'INSERT',N'Historico48'),
 (N'TareasLimpieza',N'',N'UPDATE',N'Historico48'),
 (N'Alertas',N'',N'SELECT',N'Historico48'),
 (N'Alertas',N'',N'INSERT',N'Historico48'),
 (N'Alertas',N'',N'UPDATE',N'Historico48'),
 (N'PropiedadCanales',N'',N'SELECT',N'Historico48'),
 (N'PropiedadCanales',N'',N'INSERT',N'Historico48'),
 (N'PropiedadCanales',N'',N'UPDATE',N'Historico48'),
 (N'PropiedadImagenes',N'',N'SELECT',N'Historico48'),
 (N'PropiedadImagenes',N'',N'INSERT',N'Historico48'),
 (N'PropiedadImagenes',N'',N'UPDATE',N'Historico48'),
 (N'PropiedadImagenCanales',N'',N'SELECT',N'Historico48'),
 (N'PropiedadImagenCanales',N'',N'INSERT',N'Historico48'),
 (N'PropiedadImagenCanales',N'',N'UPDATE',N'Historico48'),
 (N'PropiedadImagenCanales',N'',N'DELETE',N'Historico48'),
 (N'Empresas',N'',N'SELECT',N'Historico48'),
 (N'Empresas',N'',N'UPDATE',N'Historico48'),
 (N'PreferenciasOperativas',N'',N'SELECT',N'Historico48'),
 (N'PreferenciasOperativas',N'',N'UPDATE',N'Historico48'),
 (N'PreferenciasNotificacionUsuario',N'',N'SELECT',N'Nuevo7'),
 (N'PreferenciasNotificacionUsuario',N'',N'INSERT',N'Nuevo7'),
 (N'PreferenciasNotificacionUsuario',N'Habilitada',N'UPDATE',N'Nuevo7'),
 (N'PreferenciasNotificacionUsuario',N'FechaActualizacion',N'UPDATE',N'Nuevo7'),
 (N'Notificaciones',N'',N'SELECT',N'Nuevo7'),
 (N'NotificacionDestinatarios',N'',N'SELECT',N'Nuevo7'),
 (N'NotificacionDestinatarios',N'FechaLectura',N'UPDATE',N'Nuevo7')
 ) v(Tabla,Columna,Permiso,Grupo)
), Actuales AS (
 SELECT p.class,p.major_id,p.minor_id,p.permission_name,p.state,
  OBJECT_SCHEMA_NAME(p.major_id) AS Esquema,OBJECT_NAME(p.major_id) AS Tabla,
  CASE WHEN p.minor_id=0 THEN N'' ELSE COL_NAME(p.major_id,p.minor_id) END AS Columna
 FROM sys.database_permissions p WHERE p.grantee_principal_id=@PrincipalId
), Comparacion AS (
 SELECT e.Grupo,e.Tabla AS TablaEsperada,e.Columna AS ColumnaEsperada,e.Permiso,
  a.class,a.major_id,a.minor_id,a.Esquema,a.Tabla,a.Columna,a.permission_name,a.state,
  CASE WHEN e.Tabla IS NULL THEN N'Adicional' WHEN a.class IS NULL THEN N'Faltante'
   WHEN a.state='G' THEN N'Confirmado' ELSE N'EstadoNoPermitido' END AS Resultado
 FROM Esperadas e FULL JOIN Actuales a ON a.class=1 AND a.Esquema COLLATE Latin1_General_100_BIN2=N'dbo'
 AND a.Tabla COLLATE Latin1_General_100_BIN2=e.Tabla COLLATE Latin1_General_100_BIN2
 AND a.Columna COLLATE Latin1_General_100_BIN2=e.Columna COLLATE Latin1_General_100_BIN2
 AND a.permission_name COLLATE Latin1_General_100_BIN2=e.Permiso COLLATE Latin1_General_100_BIN2
)
SELECT *,SUM(CASE WHEN Grupo=N'Nuevo7' AND Resultado=N'Confirmado' THEN 1 ELSE 0 END) OVER() AS NuevasConfirmadasDe7,
 SUM(CASE WHEN Grupo=N'Historico48' AND Resultado=N'Confirmado' THEN 1 ELSE 0 END) OVER() AS HistoricasConfirmadasDe48,
 SUM(CASE WHEN Resultado=N'Adicional' THEN 1 ELSE 0 END) OVER() AS AdicionalesParaRevision
 FROM Comparacion ORDER BY Grupo,TablaEsperada,ColumnaEsperada,Permiso;
-- Membresias directas e indirectas. Los permisos de roles fijos NO se enumeran
-- completamente en sys.database_permissions; nunca inferir ausencia efectiva.
;WITH Roles AS (
 SELECT drm.role_principal_id,1 AS Nivel FROM sys.database_role_members drm WHERE drm.member_principal_id=@PrincipalId
 UNION ALL SELECT drm.role_principal_id,r.Nivel+1 FROM sys.database_role_members drm JOIN Roles r ON drm.member_principal_id=r.role_principal_id
)
SELECT p.name AS Rol,MIN(r.Nivel) AS NivelMinimo,CASE WHEN MIN(r.Nivel)=1 THEN 1 ELSE 0 END AS MembresiaDirecta
 FROM Roles r JOIN sys.database_principals p ON p.principal_id=r.role_principal_id
 GROUP BY p.name OPTION(MAXRECURSION 64);
;WITH Roles AS (
 SELECT role_principal_id FROM sys.database_role_members WHERE member_principal_id=@PrincipalId
 UNION ALL SELECT drm.role_principal_id FROM sys.database_role_members drm JOIN Roles r ON drm.member_principal_id=r.role_principal_id
)
SELECT MAX(CASE WHEN p.name=N'db_datareader' THEN 1 ELSE 0 END) AS DbDatareader,
 MAX(CASE WHEN p.name=N'db_datawriter' THEN 1 ELSE 0 END) AS DbDatawriter,
 N'Con roles amplios siguen existiendo permisos efectivos adicionales, aunque no haya GRANT directo.' AS Advertencia
 FROM Roles r JOIN sys.database_principals p ON p.principal_id=r.role_principal_id OPTION(MAXRECURSION 64);
-- Derechos explicitos heredables de public y roles: solo metadatos, sin SID.
;WITH Roles AS (
 SELECT role_principal_id FROM sys.database_role_members WHERE member_principal_id=@PrincipalId
 UNION ALL SELECT drm.role_principal_id FROM sys.database_role_members drm JOIN Roles r ON drm.member_principal_id=r.role_principal_id
)
SELECT gr.name AS Origen,p.class_desc,p.major_id,p.minor_id,p.permission_name,p.state_desc,
 OBJECT_SCHEMA_NAME(p.major_id) AS Esquema,OBJECT_NAME(p.major_id) AS Objeto,
 CASE WHEN p.class=1 AND p.minor_id>0 THEN COL_NAME(p.major_id,p.minor_id) END AS Columna
 FROM sys.database_permissions p JOIN sys.database_principals gr ON gr.principal_id=p.grantee_principal_id
 WHERE gr.name=N'public' OR p.grantee_principal_id IN(SELECT role_principal_id FROM Roles)
 OPTION(MAXRECURSION 64);
-- Detenerse ante faltantes, estados W/D/R o adicionales no aprobados.
-- No se retiran roles, no se cambian permisos y no se acredita aislamiento SQL.
