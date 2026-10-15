-- PROPUESTA BLOQUEADA. No ejecutar sin autorización administrativa SEPARADA.
DECLARE @RetirarRoles bit=0;
DECLARE @InspeccionAprobada bit=0;
DECLARE @ServidorEsperado sysname=NULL;
DECLARE @PrincipalIdEsperado int=NULL;
DECLARE @SidEsperado varbinary(85)=NULL;
IF ISNULL(@RetirarRoles,0)<>1 OR ISNULL(@InspeccionAprobada,0)<>1
 THROW 51610,'Operacion bloqueada: requiere autorizacion especifica.',1;
IF @ServidorEsperado IS NULL OR @PrincipalIdEsperado IS NULL OR @SidEsperado IS NULL
 OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 THROW 51611,'Destino exacto no acreditado.',1;
IF @PrincipalIdEsperado<=4 OR NOT EXISTS(SELECT 1 FROM sys.database_principals
 WHERE principal_id=@PrincipalIdEsperado AND sid=@SidEsperado AND type IN('S','U','E','X')
 AND name COLLATE Latin1_General_100_BIN2=N'hostflow_app' AND DATALENGTH(name)=DATALENGTH(N'hostflow_app'))
 THROW 51612,'Principal y SID no acreditados: no cambiar permisos.',1;
IF USER_NAME()=N'hostflow_app' OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL'),0)<>1
 THROW 51613,'Usar una identidad administrativa existente, distinta del backend.',1;
IF @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 THROW 51614,'Usar sesion dedicada en autocommit, sin transacciones previas.',1;
IF EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=@PrincipalIdEsperado)
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=@PrincipalIdEsperado)
 THROW 51615,'La aplicacion posee objetos/esquemas: revisar propiedad antes de continuar.',1;

DECLARE @PruebasLocalesAprobadas bit=0;
DECLARE @VentanaMantenimientoAutorizada bit=0;
IF ISNULL(@PruebasLocalesAprobadas,0)<>1 OR ISNULL(@VentanaMantenimientoAutorizada,0)<>1
 THROW 51616,'Falta aprobar pruebas locales y ventana de mantenimiento.',1;
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

IF EXISTS(SELECT 1 FROM @Necesarios n WHERE NOT EXISTS(SELECT 1 FROM sys.database_permissions p
 WHERE p.class=1 AND p.major_id=OBJECT_ID(n.Objeto) AND p.minor_id=0 AND p.permission_name COLLATE Latin1_General_100_BIN2=n.Permiso COLLATE Latin1_General_100_BIN2
 AND p.grantee_principal_id=@PrincipalIdEsperado AND p.state='G'))
 THROW 51617,'Faltan GRANT directos sin delegacion. No retirar roles.',1;
IF (SELECT COUNT(*) FROM sys.database_role_members WHERE member_principal_id=@PrincipalIdEsperado)<>2
 OR (SELECT COUNT(*) FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id=rm.role_principal_id
 WHERE rm.member_principal_id=@PrincipalIdEsperado AND r.name IN(N'db_datareader',N'db_datawriter'))<>2
 THROW 51618,'Membresias distintas de las dos confirmadas: inspeccionar, no modificar.',1;
IF EXISTS(SELECT 1 FROM sys.database_permissions p
 WHERE p.grantee_principal_id IN(@PrincipalIdEsperado,DATABASE_PRINCIPAL_ID(N'public')) AND p.state='D'
 AND (p.class IN(0,3) OR (p.class=1 AND p.major_id IN(SELECT OBJECT_ID(Objeto) FROM @Necesarios))))
 THROW 51619,'DENY relevante existente, incluso de columna: requiere revision manual.',1;
-- Capturar el universo visible como ADMIN antes de impersonar: la visibilidad
-- reducida del backend no debe ocultar tablas sobre las que conserva privilegios.
DECLARE @Universo table(Objeto nvarchar(517),Permiso nvarchar(60),Esperado int,Actual int NULL);
INSERT INTO @Universo(Objeto,Permiso,Esperado)
 SELECT QUOTENAME(s.name)+N'.'+QUOTENAME(t.name),o.Permiso,
 CASE WHEN EXISTS(SELECT 1 FROM @Necesarios n WHERE OBJECT_ID(n.Objeto)=t.object_id AND n.Permiso=o.Permiso) THEN 1 ELSE 0 END
 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
 CROSS JOIN(VALUES(N'SELECT'),(N'INSERT'),(N'UPDATE'),(N'DELETE'),(N'ALTER'),(N'CONTROL'),(N'REFERENCES'),(N'TAKE OWNERSHIP'))o(Permiso)
 WHERE t.is_ms_shipped=0;
DECLARE @Excesos table(Clase nvarchar(30),Permiso nvarchar(60),Actual int NULL);
INSERT INTO @Excesos(Clase,Permiso) SELECT N'DATABASE',p FROM(VALUES
 (N'CONTROL'),(N'ALTER'),(N'CREATE TABLE'),(N'CREATE VIEW'),(N'CREATE PROCEDURE'),(N'CREATE FUNCTION'),
 (N'CREATE SCHEMA'),(N'CREATE ROLE'),(N'ALTER ANY ROLE'),(N'ALTER ANY USER'),(N'ALTER ANY SCHEMA'),(N'IMPERSONATE ANY USER'),
 (N'VIEW DEFINITION'),(N'TAKE OWNERSHIP'),(N'SELECT'),(N'INSERT'),(N'UPDATE'),(N'DELETE'),(N'EXECUTE'),(N'REFERENCES'))v(p);
INSERT INTO @Excesos(Clase,Permiso) SELECT N'SCHEMA',p FROM(VALUES
 (N'CONTROL'),(N'ALTER'),(N'VIEW DEFINITION'),(N'SELECT'),(N'INSERT'),(N'UPDATE'),(N'DELETE'),(N'EXECUTE'),(N'REFERENCES'))v(p);
DECLARE @Suplantando bit=0,@Conexion int,@Bloqueo int;
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 ALTER ROLE [db_datareader] DROP MEMBER [hostflow_app];
 ALTER ROLE [db_datawriter] DROP MEMBER [hostflow_app];
 EXECUTE AS USER=N'hostflow_app';
 SET @Suplantando=1;
 UPDATE @Universo SET Actual=HAS_PERMS_BY_NAME(Objeto,'OBJECT',Permiso);
 UPDATE @Excesos SET Actual=CASE WHEN Clase=N'DATABASE' THEN HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE',Permiso)
 ELSE HAS_PERMS_BY_NAME(N'dbo','SCHEMA',Permiso) END;
 SELECT @Conexion=HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONNECT'),
 @Bloqueo=HAS_PERMS_BY_NAME(N'sys.sp_getapplock','OBJECT','EXECUTE');
 REVERT;
 SET @Suplantando=0;
 IF EXISTS(SELECT 1 FROM @Universo WHERE Actual IS NULL OR Actual<>Esperado)
 OR EXISTS(SELECT 1 FROM @Excesos WHERE Actual IS NULL OR Actual<>0)
 OR ISNULL(@Conexion,0)<>1 OR ISNULL(@Bloqueo,0)<>1
  THROW 51620,'Perfil efectivo no coincide: rollback de retiro de roles; inspeccionar.',1;
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF @Suplantando=1 REVERT;
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
SELECT N'Retiro confirmado. Verificar nueva conexion real del backend antes de reabrir trafico.' AS Resultado;
