-- PROPUESTA BLOQUEADA. No ejecutar sin autorización administrativa SEPARADA.
DECLARE @Conceder bit=0;
DECLARE @InspeccionAprobada bit=0;
DECLARE @ServidorEsperado sysname=NULL;
DECLARE @PrincipalIdEsperado int=NULL;
DECLARE @SidEsperado varbinary(85)=NULL;
IF ISNULL(@Conceder,0)<>1 OR ISNULL(@InspeccionAprobada,0)<>1
 THROW 51600,'Operacion bloqueada: requiere autorizacion especifica.',1;
IF @ServidorEsperado IS NULL OR @PrincipalIdEsperado IS NULL OR @SidEsperado IS NULL
 OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 THROW 51601,'Destino exacto no acreditado.',1;
IF @PrincipalIdEsperado<=4 OR NOT EXISTS(SELECT 1 FROM sys.database_principals
 WHERE principal_id=@PrincipalIdEsperado AND sid=@SidEsperado AND type IN('S','U','E','X')
 AND name COLLATE Latin1_General_100_BIN2=N'hostflow_app' AND DATALENGTH(name)=DATALENGTH(N'hostflow_app'))
 THROW 51602,'Principal y SID no acreditados: no cambiar permisos.',1;
IF USER_NAME()=N'hostflow_app' OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL'),0)<>1
 THROW 51603,'Usar una identidad administrativa existente, distinta del backend.',1;
IF @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 THROW 51604,'Usar sesion dedicada en autocommit, sin transacciones previas.',1;
IF EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=@PrincipalIdEsperado)
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=@PrincipalIdEsperado)
 THROW 51605,'La aplicacion posee objetos/esquemas: revisar propiedad antes de continuar.',1;
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
-- Primero conceder los 48 permisos específicos. No retira roles ni cambia datos.
-- No se concede EXECUTE general ni DDL/REFERENCES a la aplicación.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
GRANT SELECT ON OBJECT::dbo.Roles TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Usuarios TO [hostflow_app];
GRANT SELECT ON OBJECT::dbo.CanalesReserva TO [hostflow_app];
GRANT SELECT ON OBJECT::dbo.EstadosReserva TO [hostflow_app];
GRANT SELECT ON OBJECT::dbo.EstadosPropiedad TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Propiedades TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Huespedes TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Reservas TO [hostflow_app];
GRANT SELECT, INSERT ON OBJECT::dbo.ReservaEventos TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.ReservaMensajes TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.ReservaIncidencias TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.ReservaObservaciones TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.TareasLimpieza TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Alertas TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.PropiedadCanales TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.PropiedadImagenes TO [hostflow_app];
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.PropiedadImagenCanales TO [hostflow_app];
GRANT SELECT, UPDATE ON OBJECT::dbo.Empresas TO [hostflow_app];
GRANT SELECT, UPDATE ON OBJECT::dbo.PreferenciasOperativas TO [hostflow_app];
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
SELECT n.Objeto,n.Permiso,p.state_desc FROM @Necesarios n LEFT JOIN sys.database_permissions p
 ON p.class=1 AND p.major_id=OBJECT_ID(n.Objeto) AND p.minor_id=0
 AND p.grantee_principal_id=@PrincipalIdEsperado AND p.permission_name COLLATE Latin1_General_100_BIN2=n.Permiso COLLATE Latin1_General_100_BIN2;
