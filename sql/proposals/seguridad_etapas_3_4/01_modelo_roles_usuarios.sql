/*
  MODELO DEFINITIVO PARA APROBACION. NO APLICADO.
  Comprobacion administrativa confirmada por el titular: HostFlow,
  VIEW DEFINITION = 1 y ausencia de Usuarios/equivalentes en inventario completo.
  Aprobar este modelo NO autoriza ejecutar la migracion. Los dos flags de
  aprobacion permanecen en cero hasta las autorizaciones correspondientes.

  Reutiliza dbo.Roles existente (IdRol int IDENTITY, Nombre nvarchar(50),
  Descripcion nvarchar(200), Activo bit). No modifica ni inserta roles.
  Crea solamente dbo.Usuarios si se confirma que no existe una tabla equivalente.
  No crea cuentas, importa mocks ni modifica tablas operativas.
  Roles confirmados activos: Administrador (1), Propietario (2), Operador (3).
  Estos IDs son evidencia, NO constantes de autorizacion. Propietario se conserva.
*/

DECLARE @ModeloAprobado bit = 0;
DECLARE @EscrituraAutorizada bit = 0;
DECLARE @MetadatosCompletosConfirmados bit = 1;
DECLARE @BaseEsperada sysname = N'HostFlow';

IF @ModeloAprobado <> 1 OR @EscrituraAutorizada <> 1
   OR @MetadatosCompletosConfirmados <> 1
  THROW 51000, 'Migracion bloqueada: requiere modelo aprobado y escritura autorizada.', 1;

IF DB_NAME() <> @BaseEsperada
  THROW 51001, 'La base actual no coincide con el destino aprobado.', 1;

IF @@TRANCOUNT <> 0
  THROW 51002, 'Ejecutar en una sesion sin transacciones previas.', 1;

IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION'), 0) <> 1
  THROW 51003, 'La cuenta no puede verificar la estructura completa.', 1;

IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
  THROW 51004, 'No se encontro la tabla Roles observada en HostFlow.', 1;

-- Comprobar los tipos que requiere la relacion; nunca adaptar Roles automaticamente.
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.Roles') AND name = N'IdRol'
    AND system_type_id = TYPE_ID(N'int') AND is_nullable = 0 AND is_identity = 1
)
OR NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.Roles') AND name = N'Nombre'
    AND system_type_id = TYPE_ID(N'nvarchar') AND max_length = 100 AND is_nullable = 0
)
OR NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.Roles') AND name = N'Activo'
    AND system_type_id = TYPE_ID(N'bit') AND is_nullable = 0
)
  THROW 51005, 'Roles no coincide con los metadatos revisados.', 1;

IF EXISTS (
  SELECT 1 FROM sys.objects
  WHERE is_ms_shipped = 0 AND type IN ('U', 'V', 'SN')
    AND (name LIKE N'%Usuario%' OR name LIKE N'%User%')
)
  THROW 51006, 'Existe seguridad de usuarios: preparar una migracion adaptada.', 1;

/*
  Revalidar los dos roles activos por nombre en el momento de aplicar.
  Nunca corregir datos de Roles. Si difieren de la comprobacion, detenerse.
*/
IF NOT EXISTS (
  SELECT 1 FROM dbo.Roles
  WHERE Nombre COLLATE Latin1_General_100_BIN2 = N'Administrador'
    AND DATALENGTH(Nombre) = DATALENGTH(N'Administrador') AND Activo = 1
)
OR NOT EXISTS (
  SELECT 1 FROM dbo.Roles
  WHERE Nombre COLLATE Latin1_General_100_BIN2 = N'Operador'
    AND DATALENGTH(Nombre) = DATALENGTH(N'Operador') AND Activo = 1
)
  THROW 51007, 'No estan confirmados los dos roles activos acordados.', 1;

SET XACT_ABORT ON;
-- Opciones requeridas para el indice de la columna calculada persistida.
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

BEGIN TRY
  BEGIN TRANSACTION;

  CREATE TABLE dbo.Usuarios (
    IdUsuario int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Usuarios PRIMARY KEY,
    Nombre nvarchar(120) NOT NULL,
    Email nvarchar(254) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    EmailNormalizado AS LOWER(LTRIM(RTRIM(Email))) PERSISTED,
    PasswordHash varchar(255) COLLATE Latin1_General_100_BIN2 NOT NULL,
    IdRol int NOT NULL,
    Estado nvarchar(10) COLLATE Latin1_General_100_BIN2 NOT NULL
      CONSTRAINT DF_Usuarios_Estado DEFAULT N'Activo',
    DebeCambiarPassword bit NOT NULL
      CONSTRAINT DF_Usuarios_DebeCambiarPassword DEFAULT 1,
    VersionSesion int NOT NULL
      CONSTRAINT DF_Usuarios_VersionSesion DEFAULT 1,
    FechaCreacion datetime2(0) NOT NULL
      CONSTRAINT DF_Usuarios_FechaCreacion DEFAULT SYSUTCDATETIME(),
    FechaActualizacion datetime2(0) NOT NULL
      CONSTRAINT DF_Usuarios_FechaActualizacion DEFAULT SYSUTCDATETIME(),
    FechaCambioPassword datetime2(0) NOT NULL
      CONSTRAINT DF_Usuarios_FechaCambioPassword DEFAULT SYSUTCDATETIME(),
    IdUsuarioCreacion int NULL,
    IdUsuarioActualizacion int NULL,
    VersionRegistro rowversion NOT NULL,

    CONSTRAINT FK_Usuarios_Roles FOREIGN KEY (IdRol) REFERENCES dbo.Roles(IdRol),
    CONSTRAINT FK_Usuarios_Creacion FOREIGN KEY (IdUsuarioCreacion)
      REFERENCES dbo.Usuarios(IdUsuario),
    CONSTRAINT FK_Usuarios_Actualizacion FOREIGN KEY (IdUsuarioActualizacion)
      REFERENCES dbo.Usuarios(IdUsuario),
    CONSTRAINT CK_Usuarios_Nombre CHECK (LEN(LTRIM(RTRIM(Nombre))) > 0),
    CONSTRAINT CK_Usuarios_Email CHECK (LEN(LTRIM(RTRIM(Email))) > 0),
    CONSTRAINT CK_Usuarios_HashLongitud CHECK (DATALENGTH(PasswordHash) >= 60),
    CONSTRAINT CK_Usuarios_Estado CHECK (Estado IN (N'Activo', N'Inactivo')),
    CONSTRAINT CK_Usuarios_VersionSesion CHECK (VersionSesion > 0)
  );

  CREATE UNIQUE INDEX UX_Usuarios_EmailNormalizado ON dbo.Usuarios(EmailNormalizado);
  CREATE INDEX IX_Usuarios_Rol_Estado ON dbo.Usuarios(IdRol, Estado);

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

-- Sin cuentas iniciales ni DML sobre tablas existentes.
