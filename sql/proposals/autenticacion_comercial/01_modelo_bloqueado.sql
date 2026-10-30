-- PROPUESTA: no ejecutar sin revisión administrativa y autorización separada.
-- No se carga al arrancar. Sin backfill, ALTER Usuarios, GRANT ni borrados.
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0, @InventarioRevisado bit=0;
DECLARE @ServidorEsperado sysname=NULL, @BaseEsperada sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1
 THROW 51800,'Migración comercial bloqueada: falta autorización e inventario.',1;
IF @ServidorEsperado IS NULL OR @BaseEsperada IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),ISNULL(CONVERT(sysname,SERVERPROPERTY('ServerName')),N''))<>CONVERT(varbinary(256),@ServidorEsperado)
 THROW 51801,'Destino no coincide con el aprobado.',1;
IF @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0 THROW 51802,'Sesión con transacciones previas/implícitas.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1
 THROW 51803,'Se requiere visibilidad administrativa completa.',1;
IF SCHEMA_ID(N'authcom') IS NOT NULL THROW 51804,'El esquema ya existe: no repetir ni completar a ciegas.',1;
IF OBJECT_ID(N'dbo.Usuarios',N'U') IS NULL OR OBJECT_ID(N'dbo.Roles',N'U') IS NULL OR OBJECT_ID(N'dbo.Empresas',N'U') IS NULL
 OR COL_LENGTH(N'dbo.Usuarios',N'VersionSesion')<>4
 OR COL_LENGTH(N'dbo.Usuarios',N'VersionRegistro')<>8
 OR COL_LENGTH(N'dbo.Usuarios',N'EmailNormalizado') IS NULL
 THROW 51805,'Dependencias incompatibles: detener y contrastar metadatos.',1;
IF EXISTS (SELECT 1 FROM (VALUES
 (N'Usuarios',N'IdUsuario',56),(N'Usuarios',N'VersionSesion',56),(N'Usuarios',N'VersionRegistro',189),
 (N'Usuarios',N'Nombre',231),(N'Usuarios',N'Email',231),(N'Usuarios',N'PasswordHash',167),
 (N'Usuarios',N'IdRol',56),(N'Usuarios',N'Estado',231),(N'Usuarios',N'DebeCambiarPassword',104),
 (N'Usuarios',N'FechaCambioPassword',42),(N'Usuarios',N'FechaActualizacion',42),
 (N'Usuarios',N'IdUsuarioCreacion',56),(N'Usuarios',N'IdUsuarioActualizacion',56),
 (N'Roles',N'IdRol',56),(N'Roles',N'Nombre',231),(N'Roles',N'Activo',104),
 (N'Empresas',N'IdEmpresa',56),(N'Empresas',N'Activo',104)) v(Tabla,Columna,Tipo)
 LEFT JOIN sys.columns c ON c.object_id=OBJECT_ID(N'dbo.'+v.Tabla) AND c.name=v.Columna
 WHERE c.column_id IS NULL OR c.system_type_id<>v.Tipo)
 THROW 51806,'Tipos/columnas de dependencias incompatibles.',1;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRY
 BEGIN TRANSACTION;
 EXEC(N'CREATE SCHEMA authcom AUTHORIZATION dbo;');
 CREATE TABLE authcom.Contactos (
  IdUsuario int NOT NULL PRIMARY KEY REFERENCES dbo.Usuarios(IdUsuario),
  Email nvarchar(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  VersionContacto int NOT NULL CHECK(VersionContacto>0),
  VerificadoEn datetime2(3) NOT NULL,
  RevocadoEn datetime2(3) NULL,
  CHECK(RevocadoEn IS NULL OR RevocadoEn>=VerificadoEn)
 );
 CREATE TABLE authcom.Desafios (
  Id uniqueidentifier NOT NULL PRIMARY KEY,
  Hash binary(32) NOT NULL UNIQUE,
  Proposito varchar(20) COLLATE Latin1_General_100_BIN2 NOT NULL CHECK(Proposito IN ('recuperacion','invitacion')),
  IdEmpresa int NOT NULL REFERENCES dbo.Empresas(IdEmpresa),
  Email nvarchar(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  IdUsuario int NULL REFERENCES dbo.Usuarios(IdUsuario),
  IdInvitador int NULL REFERENCES dbo.Usuarios(IdUsuario),
  Documento nvarchar(2000) NOT NULL CHECK(ISJSON(Documento)=1),
  CreadaEn datetime2(3) NOT NULL,
  ExpiraEn datetime2(3) NOT NULL,
  ConsumidaEn datetime2(3) NULL,
  RevocadaEn datetime2(3) NULL,
  Pendiente bit NOT NULL,
  CHECK(ExpiraEn>CreadaEn),
  CHECK(ConsumidaEn IS NULL OR (ConsumidaEn>=CreadaEn AND ConsumidaEn<ExpiraEn)),
  CHECK(RevocadaEn IS NULL OR RevocadaEn>=CreadaEn),
  CHECK((Proposito='recuperacion' AND IdUsuario IS NOT NULL AND IdInvitador IS NULL AND Pendiente=0)
     OR (Proposito='invitacion' AND IdUsuario IS NULL AND IdInvitador IS NOT NULL)),
  CHECK(Pendiente=0 OR (Proposito='invitacion' AND ConsumidaEn IS NULL AND RevocadaEn IS NULL))
 );
 -- Expiración transicionada al emitir otra invitación; GETDATE no va en un índice filtrado.
 CREATE UNIQUE INDEX UX_Desafios_Invitacion ON authcom.Desafios(IdEmpresa,Email) WHERE Pendiente=1;
 CREATE INDEX IX_Desafios_Usuario ON authcom.Desafios(IdUsuario,Proposito);
 CREATE TABLE authcom.Cuotas (
  Proposito varchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
  Clave varchar(80) COLLATE Latin1_General_100_BIN2 NOT NULL,
  Inicio datetime2(3) NOT NULL,
  Ultima datetime2(3) NOT NULL,
  Cuenta int NOT NULL CHECK(Cuenta>0),
  PRIMARY KEY(Proposito,Clave), CHECK(Ultima>=Inicio)
 );
 CREATE TABLE authcom.Outbox (
  Id uniqueidentifier NOT NULL PRIMARY KEY,
  DesafioId uniqueidentifier NULL REFERENCES authcom.Desafios(Id),
  ExpiraEn datetime2(3) NOT NULL,
  Sobre nvarchar(max) NULL CHECK(Sobre IS NULL OR ISJSON(Sobre)=1),
  Estado varchar(16) NOT NULL CHECK(Estado IN ('pendiente','procesando','entregada','fallida','descartada')),
  Intentos int NOT NULL DEFAULT 0 CHECK(Intentos BETWEEN 0 AND 3),
  Proxima datetime2(3) NOT NULL,
  Lease uniqueidentifier NULL, LeaseHasta datetime2(3) NULL,
  CHECK((Lease IS NULL AND LeaseHasta IS NULL) OR (Lease IS NOT NULL AND LeaseHasta IS NOT NULL)),
  CHECK(Estado NOT IN ('entregada','descartada') OR Sobre IS NULL)
 );
 CREATE INDEX IX_Outbox_Cola ON authcom.Outbox(Estado,Proxima,LeaseHasta);
 CREATE TABLE authcom.Auditoria (
  Id bigint IDENTITY NOT NULL PRIMARY KEY,
  Tipo varchar(40) NOT NULL CHECK(Tipo IN ('RECUPERACION_SOLICITADA','INVITACION_EMITIDA','PASSWORD_RESTABLECIDA','INVITACION_ACEPTADA','INVITACION_REVOCADA')),
  UsuarioId int NULL REFERENCES dbo.Usuarios(IdUsuario),
  ActorId int NULL REFERENCES dbo.Usuarios(IdUsuario),
  DesafioId uniqueidentifier NULL REFERENCES authcom.Desafios(Id),
  IdEmpresa int NOT NULL REFERENCES dbo.Empresas(IdEmpresa),
  Fecha datetime2(3) NOT NULL
 );
 EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthModelo',@value=N'authcom-v1',
  @level0type=N'SCHEMA',@level0name=N'authcom';
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
