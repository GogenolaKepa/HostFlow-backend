/* SELECT de permisos efectivos y opciones de la conexion actual.
   No concede permisos, no lee filas de cuentas ni ejecuta procedimientos.
   Usuarios puede no existir: NULL no acredita permisos futuros sobre esa tabla. */
SELECT
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS VerEsquema,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS CrearTabla,
  HAS_PERMS_BY_NAME(N'dbo', 'SCHEMA', 'ALTER') AS AlterarEsquemaDbo,
  HAS_PERMS_BY_NAME(N'dbo.Roles', 'OBJECT', 'REFERENCES') AS ReferenciarRoles,
  HAS_PERMS_BY_NAME(N'dbo.Roles', 'OBJECT', 'SELECT') AS LeerRoles,
  HAS_PERMS_BY_NAME(N'dbo', 'SCHEMA', 'SELECT') AS LeerEsquemaDbo,
  HAS_PERMS_BY_NAME(N'dbo', 'SCHEMA', 'INSERT') AS InsertarEsquemaDbo,
  HAS_PERMS_BY_NAME(N'dbo', 'SCHEMA', 'UPDATE') AS ActualizarEsquemaDbo,
  HAS_PERMS_BY_NAME(N'dbo.Usuarios', 'OBJECT', 'SELECT') AS LeerUsuariosActual,
  HAS_PERMS_BY_NAME(N'dbo.Usuarios', 'OBJECT', 'INSERT') AS InsertarUsuariosActual,
  HAS_PERMS_BY_NAME(N'dbo.Usuarios', 'OBJECT', 'UPDATE') AS ActualizarUsuariosActual,
  HAS_PERMS_BY_NAME(N'sys.sp_getapplock', 'OBJECT', 'EXECUTE') AS EjecutarBloqueo,
  IS_ROLEMEMBER(N'db_owner') AS MiembroDbOwner,
  IS_ROLEMEMBER(N'db_ddladmin') AS MiembroDbDdlAdmin,
  IS_ROLEMEMBER(N'db_datareader') AS MiembroDbDataReader,
  IS_ROLEMEMBER(N'db_datawriter') AS MiembroDbDataWriter,
  SESSIONPROPERTY('ANSI_NULLS') AS AnsiNulls,
  SESSIONPROPERTY('ANSI_PADDING') AS AnsiPadding,
  SESSIONPROPERTY('ANSI_WARNINGS') AS AnsiWarnings,
  SESSIONPROPERTY('ARITHABORT') AS ArithAbort,
  SESSIONPROPERTY('CONCAT_NULL_YIELDS_NULL') AS ConcatNullYieldsNull,
  SESSIONPROPERTY('QUOTED_IDENTIFIER') AS QuotedIdentifier,
  SESSIONPROPERTY('NUMERIC_ROUNDABORT') AS NumericRoundAbort;

-- Confirmar que la clave referenciable pertenece a IdRol, sin nombres internos.
SELECT c.name AS Columna, i.is_primary_key AS ClavePrimaria,
  i.is_unique AS Unico, i.is_disabled AS Deshabilitado,
  ic.key_ordinal AS OrdenClave
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE i.object_id=OBJECT_ID(N'dbo.Roles',N'U') AND i.is_unique=1 AND ic.key_ordinal>0
ORDER BY i.index_id,ic.key_ordinal;
