/* PROPUESTA. NO EJECUTADA. Autorizar antes de conectar a Azure.
   Solo metadatos de la conexion y permisos; no lee cuentas ni datos operativos.
   Contrastar ServidorActual con el recurso aprobado en Azure Portal.
   No continuar por el solo hecho de que una base se llame HostFlow. */
SELECT
  DB_NAME() AS BaseActual,
  CONVERT(nvarchar(128), SERVERPROPERTY('ServerName')) AS ServidorActual,
  CONVERT(int, SERVERPROPERTY('EngineEdition')) AS MotorActual,
  CONVERT(nvarchar(128), DATABASEPROPERTYEX(DB_NAME(), 'Collation')) AS CollationActual,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS PuedeVerEsquemaCompleto,
  @@TRANCOUNT AS TransaccionesAbiertas,
  CONVERT(bit, CASE WHEN (@@OPTIONS & 2) <> 0 THEN 1 ELSE 0 END) AS TransaccionesImplicitas;
-- Esperado: HostFlow, servidor aprobado, motor 5 (Azure SQL Database),
-- VIEW DEFINITION=1, TransaccionesAbiertas=0 y TransaccionesImplicitas=0.
-- Ante cualquier diferencia: detenerse; no modificar configuracion ni permisos.
