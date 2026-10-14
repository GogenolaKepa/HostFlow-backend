/* Propuesta de comprobacion futura, DESPUES de la migracion autorizada.
   Ejecutar con la conexion de aplicacion, no con la cuenta administrativa.
   Un SELECT de contexto/permisos; no lee cuentas, hashes ni datos de negocio.
   No ejecutado. No concede ni cambia permisos. */
SELECT
  DB_NAME() AS BaseActual,
  HAS_PERMS_BY_NAME(N'dbo.Roles', N'OBJECT', N'SELECT') AS PuedeLeerRoles,
  HAS_PERMS_BY_NAME(N'dbo.Usuarios', N'OBJECT', N'SELECT') AS PuedeLeerUsuarios,
  HAS_PERMS_BY_NAME(N'dbo.Usuarios', N'OBJECT', N'INSERT') AS PuedeCrearUsuarios,
  HAS_PERMS_BY_NAME(N'dbo.Usuarios', N'OBJECT', N'UPDATE') AS PuedeActualizarUsuarios,
  HAS_PERMS_BY_NAME(N'sys.sp_getapplock', N'OBJECT', N'EXECUTE') AS PuedeUsarBloqueo,
  SESSIONPROPERTY('ANSI_NULLS') AS AnsiNulls,
  SESSIONPROPERTY('ANSI_PADDING') AS AnsiPadding,
  SESSIONPROPERTY('ANSI_WARNINGS') AS AnsiWarnings,
  SESSIONPROPERTY('ARITHABORT') AS ArithAbort,
  SESSIONPROPERTY('CONCAT_NULL_YIELDS_NULL') AS ConcatNullYieldsNull,
  SESSIONPROPERTY('QUOTED_IDENTIFIER') AS QuotedIdentifier,
  SESSIONPROPERTY('NUMERIC_ROUNDABORT') AS NumericRoundAbort;
-- Opciones esperadas: seis primeras = 1, NumericRoundAbort = 0.
-- Verificar tambien desde la conexion efectiva del driver del backend;
-- una sesion SSMS no acredita las opciones/permisos de una conexion distinta.
