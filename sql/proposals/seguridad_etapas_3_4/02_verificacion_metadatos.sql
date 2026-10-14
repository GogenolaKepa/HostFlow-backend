/*
  PROPUESTA DE COMPROBACION POSTERIOR A UNA MIGRACION AUTORIZADA.
  Solo metadatos; no lee PasswordHash ni filas de cuentas.
  NO EJECUTADO en esta etapa de diseno.
*/

SELECT s.name AS Esquema, t.name AS Tabla, c.name AS Columna,
  ty.name AS Tipo, c.max_length AS LongitudBytes, c.is_nullable AS PermiteNull,
  c.is_identity AS EsIdentity, c.is_computed AS EsCalculada
FROM sys.tables t
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
INNER JOIN sys.columns c ON c.object_id = t.object_id
INNER JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE s.name = 'dbo' AND t.name IN ('Roles', 'Usuarios')
ORDER BY t.name, c.column_id;

SELECT t.name AS Tabla, i.name AS Indice, i.is_unique AS Unico,
  i.is_primary_key AS ClavePrimaria, i.is_disabled AS Deshabilitado
FROM sys.tables t
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
INNER JOIN sys.indexes i ON i.object_id = t.object_id
WHERE s.name = 'dbo' AND t.name IN ('Roles', 'Usuarios') AND i.index_id > 0
ORDER BY t.name, i.name;

SELECT t.name AS Tabla, fk.name AS Relacion,
  OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS EsquemaDestino,
  OBJECT_NAME(fk.referenced_object_id) AS TablaDestino,
  fk.is_disabled AS Deshabilitada, fk.is_not_trusted AS NoValidada
FROM sys.foreign_keys fk
INNER JOIN sys.tables t ON t.object_id = fk.parent_object_id
WHERE SCHEMA_NAME(t.schema_id) = 'dbo' AND t.name = 'Usuarios'
ORDER BY fk.name;

SELECT t.name AS Tabla, ck.name AS Restriccion,
  ck.is_disabled AS Deshabilitada, ck.is_not_trusted AS NoValidada
FROM sys.check_constraints ck
INNER JOIN sys.tables t ON t.object_id = ck.parent_object_id
WHERE SCHEMA_NAME(t.schema_id) = 'dbo' AND t.name IN ('Roles', 'Usuarios')
ORDER BY t.name, ck.name;
