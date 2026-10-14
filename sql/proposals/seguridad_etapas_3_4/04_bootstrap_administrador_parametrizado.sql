/*
  PROPUESTA DE ALTA INICIAL. NO EJECUTADA. NO ES UNA MIGRACION.
  Batch DE REFERENCIA con parametros mssql, sin endpoint publico.
  El comando implementado usa UsuarioService/UsuarioRepository, con el mismo
  protocolo transaccional. No carga ni ejecuta este archivo automaticamente.
  No pegar contrasenas ni hashes como literales y no ejecutar desde el servidor.
  Requiere autorizacion explicita separada para el INSERT sobre Azure SQL.

  Parametros que necesita este batch de referencia (NO concatenados):
    @EscrituraAutorizada bit = 1 solo tras aprobacion explicita de este paso;
    @Nombre nvarchar(120), @Email nvarchar(254), @PasswordHash varchar(255).
  El comando genera el hash bcrypt cost 12 desde entrada interactiva oculta,
  valida los limites antes de enlazar y nunca registra parametros sensibles.
  El batch no crea objetos, no cambia Roles y no importa cuentas mock.
*/

IF ISNULL(@EscrituraAutorizada, 0) <> 1
  THROW 51100, 'Alta inicial bloqueada: falta autorizacion de escritura.', 1;

IF DB_NAME() <> N'HostFlow'
  THROW 51101, 'La base actual no coincide con el destino aprobado.', 1;

IF @@TRANCOUNT <> 0
  THROW 51102, 'Ejecutar sin transacciones previas.', 1;

IF OBJECT_ID(N'dbo.Usuarios', N'U') IS NULL
  THROW 51103, 'Primero debe aplicarse y verificarse la migracion aprobada.', 1;

IF @Nombre IS NULL OR LEN(LTRIM(RTRIM(@Nombre))) = 0
   OR @Email IS NULL OR LEN(LTRIM(RTRIM(@Email))) = 0
   OR @PasswordHash IS NULL OR DATALENGTH(@PasswordHash) <> 60
   OR LEFT(@PasswordHash, 7) COLLATE Latin1_General_100_BIN2 NOT IN ('$2a$12$', '$2b$12$')
  THROW 51104, 'Datos iniciales invalidos.', 1;

SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @ResultadoBloqueo int;
  EXEC @ResultadoBloqueo = sys.sp_getapplock
    @Resource = N'HostFlow:Seguridad:AdministradoresActivos',
    @LockMode = 'Exclusive',
    @LockOwner = 'Transaction',
    @LockTimeout = 10000,
    @DbPrincipal = 'public';

  IF @ResultadoBloqueo < 0
    THROW 51105, 'No se obtuvo el bloqueo para el alta inicial.', 1;

  -- Tambien bloquea el rango vacio: no se reemplaza ninguna cuenta existente.
  IF EXISTS (SELECT 1 FROM dbo.Usuarios WITH (UPDLOCK, HOLDLOCK))
    THROW 51106, 'El alta inicial solo se permite con Usuarios vacia.', 1;

  DECLARE @IdRolAdministrador int;
  SELECT @IdRolAdministrador = IdRol
  FROM dbo.Roles WITH (HOLDLOCK)
  WHERE Nombre COLLATE Latin1_General_100_BIN2 = N'Administrador'
    AND DATALENGTH(Nombre) = DATALENGTH(N'Administrador') AND Activo = 1;

  IF @IdRolAdministrador IS NULL
    THROW 51107, 'No existe el rol Administrador activo acordado.', 1;

  INSERT INTO dbo.Usuarios (Nombre, Email, PasswordHash, IdRol)
  VALUES (LTRIM(RTRIM(@Nombre)), LOWER(LTRIM(RTRIM(@Email))),
          @PasswordHash, @IdRolAdministrador);

  DECLARE @IdUsuario int = CONVERT(int, SCOPE_IDENTITY());
  COMMIT TRANSACTION;

  -- Solo comprobante no sensible; nunca devolver el hash o una contrasena.
  SELECT @IdUsuario AS IdUsuario, N'Administrador' AS Rol,
         N'Activo' AS Estado, CAST(1 AS bit) AS DebeCambiarPassword;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
