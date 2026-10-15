/* PROPUESTA BLOQUEADA. Requiere revisión del inventario completo para descartar
   tablas equivalentes y autorización específica. Nunca se carga al iniciar.
   Solo crea Empresas y PreferenciasOperativas. No inserta datos ni cambia
   Usuarios, Roles, Propiedades, Reservas, TareasLimpieza o integraciones. */
SET XACT_ABORT ON;
DECLARE @Aplicar bit = 0;
DECLARE @InventarioRevisado bit = 0;
DECLARE @BaseEsperada sysname = NULL;
DECLARE @ServidorEsperado sysname = NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1
  THROW 51500,'Propuesta bloqueada: falta revision y autorizacion explicita.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
  OR @BaseEsperada COLLATE Latin1_General_100_BIN2<>N'HostFlow'
  OR DATALENGTH(@BaseEsperada)<>DATALENGTH(N'HostFlow')
  OR DB_NAME() COLLATE Latin1_General_100_BIN2<>@BaseEsperada COLLATE Latin1_General_100_BIN2
  OR DATALENGTH(DB_NAME())<>DATALENGTH(@BaseEsperada)
  OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
  OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
  OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
  THROW 51501,'Destino Azure no acreditado.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1
  OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE'),0)<>1
  OR ISNULL(HAS_PERMS_BY_NAME(N'dbo','SCHEMA','ALTER'),0)<>1
  OR ISNULL(HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','REFERENCES'),0)<>1
  THROW 51502,'Visibilidad o permisos administrativos insuficientes.',1;
IF OBJECT_ID(N'dbo.Empresas') IS NOT NULL OR OBJECT_ID(N'dbo.PreferenciasOperativas') IS NOT NULL
  THROW 51503,'Objetos preexistentes: no reemplazar ni repetir esta propuesta.',1;
IF NOT EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Usuarios',N'U')
  AND name=N'IdUsuario' AND system_type_id=56 AND is_nullable=0)
  THROW 51504,'Usuarios no compatible: revisar antes de continuar.',1;
IF @@TRANCOUNT<>0 THROW 51505,'Ejecutar en una sesion sin transacciones previas.',1;

BEGIN TRY
  BEGIN TRANSACTION;
  CREATE TABLE dbo.Empresas (
    IdEmpresa int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Empresas PRIMARY KEY,
    NombreComercial nvarchar(120) NULL,
    RazonSocial nvarchar(180) NULL,
    CorreoContacto nvarchar(254) NULL,
    Telefono nvarchar(40) NULL,
    Pais nvarchar(80) NULL,
    Provincia nvarchar(100) NULL,
    Ciudad nvarchar(100) NULL,
    Direccion nvarchar(240) NULL,
    InformacionAdicional nvarchar(1000) NULL,
    Activo bit NOT NULL CONSTRAINT DF_Empresas_Activo DEFAULT 1,
    FechaCreacion datetime2(0) NOT NULL CONSTRAINT DF_Empresas_Creacion DEFAULT SYSUTCDATETIME(),
    FechaActualizacion datetime2(0) NOT NULL CONSTRAINT DF_Empresas_Actualizacion DEFAULT SYSUTCDATETIME(),
    IdUsuarioActualizacion int NULL,
    VersionRegistro rowversion NOT NULL,
    CONSTRAINT FK_Empresas_UsuarioActualizacion FOREIGN KEY(IdUsuarioActualizacion) REFERENCES dbo.Usuarios(IdUsuario),
    CONSTRAINT CK_Empresas_Nombre CHECK(NombreComercial IS NULL OR LEN(LTRIM(RTRIM(NombreComercial)))>0)
  );
  CREATE TABLE dbo.PreferenciasOperativas (
    IdEmpresa int NOT NULL CONSTRAINT PK_PreferenciasOperativas PRIMARY KEY,
    HoraIngreso time(0) NOT NULL,
    HoraEgreso time(0) NOT NULL,
    ZonaHoraria nvarchar(100) NOT NULL,
    FechaCreacion datetime2(0) NOT NULL CONSTRAINT DF_PreferenciasOperativas_Creacion DEFAULT SYSUTCDATETIME(),
    FechaActualizacion datetime2(0) NOT NULL CONSTRAINT DF_PreferenciasOperativas_Actualizacion DEFAULT SYSUTCDATETIME(),
    IdUsuarioActualizacion int NULL,
    VersionRegistro rowversion NOT NULL,
    CONSTRAINT FK_PreferenciasOperativas_Empresa FOREIGN KEY(IdEmpresa) REFERENCES dbo.Empresas(IdEmpresa),
    CONSTRAINT FK_PreferenciasOperativas_UsuarioActualizacion FOREIGN KEY(IdUsuarioActualizacion) REFERENCES dbo.Usuarios(IdUsuario),
    CONSTRAINT CK_PreferenciasOperativas_HoraIngreso CHECK(DATEPART(SECOND,HoraIngreso)=0),
    CONSTRAINT CK_PreferenciasOperativas_HoraEgreso CHECK(DATEPART(SECOND,HoraEgreso)=0),
    CONSTRAINT CK_PreferenciasOperativas_Zona CHECK(ZonaHoraria COLLATE Latin1_General_100_BIN2=N'America/Argentina/Buenos_Aires'
      AND DATALENGTH(ZonaHoraria)=DATALENGTH(N'America/Argentina/Buenos_Aires'))
  );
  EXEC sys.sp_addextendedproperty @name=N'HostFlowConfiguracionModelo',@value=N'hostflow-configuracion-empresa-v1',
    @level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'Empresas';
  EXEC sys.sp_addextendedproperty @name=N'HostFlowConfiguracionModelo',@value=N'hostflow-configuracion-empresa-v1',
    @level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'PreferenciasOperativas';
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
