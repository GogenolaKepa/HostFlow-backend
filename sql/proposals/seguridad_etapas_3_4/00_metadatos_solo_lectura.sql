/*
  PROPUESTA PARA AUTORIZAR ANTES DE EJECUTAR EN AZURE.
  Solo SELECT sobre catalogos del sistema: no lee filas de usuarios, hashes,
  secretos, definiciones de modulos ni contenidos de tablas operativas.
  Una lista vacia no demuestra ausencia si la cuenta no ve todos los metadatos.
*/

-- 1. Contexto, intercalacion y visibilidad/permisos (sin identidades de login).
SELECT
  DB_NAME() AS BaseActual,
  CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS sysname) AS Intercalacion,
  SERVERPROPERTY('EngineEdition') AS EdicionMotor,
  SERVERPROPERTY('ProductVersion') AS VersionMotor,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS PuedeVerDefinicion,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS PuedeCrearTablas,
  HAS_PERMS_BY_NAME('dbo', 'SCHEMA', 'ALTER') AS PuedeAlterarDbo,
  HAS_PERMS_BY_NAME('sys.sp_getapplock', 'OBJECT', 'EXECUTE') AS PuedeUsarBloqueoAplicacion;

-- 2. Inventario de tablas, vistas y sinonimos; nombres y clases solamente.
SELECT s.name AS Esquema, o.name AS Objeto, o.type_desc AS Tipo
FROM sys.objects o
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.is_ms_shipped = 0 AND o.type IN ('U', 'V', 'SN')
ORDER BY s.name, o.name;

-- 3. Columnas relacionadas con seguridad y autorias ya existentes.
SELECT
  s.name AS Esquema, o.name AS Objeto, c.column_id AS Orden,
  c.name AS Columna, t.name AS Tipo,
  CASE WHEN t.name IN ('nvarchar', 'nchar') AND c.max_length > 0
    THEN c.max_length / 2 ELSE c.max_length END AS LongitudDeclarada,
  c.precision AS Precision, c.scale AS Escala,
  c.is_nullable AS PermiteNull, c.is_identity AS EsIdentity,
  c.is_computed AS EsCalculada, cc.is_persisted AS CalculadaPersistida,
  c.collation_name AS IntercalacionColumna,
  dc.name AS RestriccionDefault
FROM sys.objects o
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
INNER JOIN sys.columns c ON c.object_id = o.object_id
INNER JOIN sys.types t ON t.user_type_id = c.user_type_id
LEFT JOIN sys.computed_columns cc
  ON cc.object_id = c.object_id AND cc.column_id = c.column_id
LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
WHERE o.is_ms_shipped = 0 AND o.type IN ('U', 'V')
  AND (o.name LIKE '%Usuario%' OR o.name LIKE '%Rol%'
    OR o.name LIKE '%Permiso%' OR o.name LIKE '%Sesion%'
    OR o.name LIKE '%Auditoria%' OR o.name LIKE '%Seguridad%'
    OR o.name IN ('ReservaObservaciones', 'ReservaEventos'))
ORDER BY s.name, o.name, c.column_id;

-- 4. Claves e indices: columnas, unicidad y existencia de filtros.
-- No se muestran definiciones de filtros/defaults, que podrian contener literales.
SELECT
  s.name AS Esquema, o.name AS Objeto, i.name AS Indice,
  i.is_primary_key AS ClavePrimaria, i.is_unique AS Unico,
  i.is_unique_constraint AS RestriccionUnica, i.has_filter AS TieneFiltro,
  i.is_disabled AS Deshabilitado, c.name AS Columna,
  ic.key_ordinal AS OrdenClave, ic.is_included_column AS ColumnaIncluida
FROM sys.objects o
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
INNER JOIN sys.indexes i ON i.object_id = o.object_id
INNER JOIN sys.index_columns ic
  ON ic.object_id = i.object_id AND ic.index_id = i.index_id
INNER JOIN sys.columns c
  ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE o.is_ms_shipped = 0 AND o.type = 'U'
  AND (o.name LIKE '%Usuario%' OR o.name LIKE '%Rol%'
    OR o.name LIKE '%Permiso%' OR o.name LIKE '%Sesion%'
    OR o.name LIKE '%Auditoria%' OR o.name LIKE '%Seguridad%')
ORDER BY s.name, o.name, i.name, ic.key_ordinal, ic.index_column_id;

-- 5. Relaciones entrantes/salientes con tablas de seguridad, incluido otro esquema.
SELECT
  fk.name AS Relacion, ps.name AS EsquemaOrigen, p.name AS TablaOrigen,
  pc.name AS ColumnaOrigen, rs.name AS EsquemaDestino, r.name AS TablaDestino,
  rc.name AS ColumnaDestino, fk.delete_referential_action_desc AS AlEliminar,
  fk.update_referential_action_desc AS AlActualizar,
  fk.is_disabled AS Deshabilitada, fk.is_not_trusted AS NoValidada
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = fk.object_id
INNER JOIN sys.tables p ON p.object_id = fk.parent_object_id
INNER JOIN sys.schemas ps ON ps.schema_id = p.schema_id
INNER JOIN sys.columns pc
  ON pc.object_id = p.object_id AND pc.column_id = fc.parent_column_id
INNER JOIN sys.tables r ON r.object_id = fk.referenced_object_id
INNER JOIN sys.schemas rs ON rs.schema_id = r.schema_id
INNER JOIN sys.columns rc
  ON rc.object_id = r.object_id AND rc.column_id = fc.referenced_column_id
WHERE p.name LIKE '%Usuario%' OR p.name LIKE '%Rol%'
  OR r.name LIKE '%Usuario%' OR r.name LIKE '%Rol%'
ORDER BY ps.name, p.name, fk.name, fc.constraint_column_id;

-- 6. Restricciones CHECK y triggers: nombres/estado, sin ejecutar ni leer cuerpos.
SELECT s.name AS Esquema, o.name AS Objeto, ck.name AS Restriccion,
  ck.is_disabled AS Deshabilitada, ck.is_not_trusted AS NoValidada
FROM sys.check_constraints ck
INNER JOIN sys.objects o ON o.object_id = ck.parent_object_id
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.name LIKE '%Usuario%' OR o.name LIKE '%Rol%'
ORDER BY s.name, o.name, ck.name;

SELECT s.name AS Esquema, o.name AS Objeto, tr.name AS TriggerNombre,
  tr.is_disabled AS Deshabilitado, tr.is_instead_of_trigger AS EsInsteadOf
FROM sys.triggers tr
INNER JOIN sys.objects o ON o.object_id = tr.parent_id
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.name LIKE '%Usuario%' OR o.name LIKE '%Rol%'
ORDER BY s.name, o.name, tr.name;
