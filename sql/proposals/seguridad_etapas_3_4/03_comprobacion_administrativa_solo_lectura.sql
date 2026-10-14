/*
  PREPARADO PARA REVISION. NO EJECUTADO.
  Ejecutar cada bloque por separado solo despues de autorizar la comprobacion.
  Usar una conexion administrativa existente a HostFlow, distinta de la cuenta
  de aplicacion. No modifica permisos, datos, esquemas ni configuracion.
  Los bloques 1 y 2 consultan metadatos; el 3 lee solo el catalogo publico Roles.
*/

-- 1. Verificar destino y capacidad de observacion; detenerse si no coinciden.
SELECT
  DB_NAME() AS BaseActual,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS PuedeVerEsquemaCompleto,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') AS TieneControlBase,
  HAS_PERMS_BY_NAME('dbo.Roles', 'OBJECT', 'SELECT') AS PuedeLeerRoles;

-- Continuar solo con BaseActual = HostFlow y ambos permisos de lectura = 1.
-- TieneControlBase es informativo; no es necesario concederlo para consultar.

-- 2. Inventario completo de objetos y columnas: detectar Usuarios/equivalentes.
-- No depende del nombre de la tabla y no consulta ninguna fila de negocio.
SELECT
  s.name AS Esquema,
  o.name AS Objeto,
  o.type_desc AS TipoObjeto,
  c.column_id AS OrdenColumna,
  c.name AS Columna,
  t.name AS TipoDato,
  c.max_length AS LongitudBytes,
  c.is_nullable AS PermiteNull,
  c.is_identity AS EsIdentity
FROM sys.objects o
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.columns c ON c.object_id = o.object_id
LEFT JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE o.is_ms_shipped = 0 AND o.type IN ('U', 'V', 'SN')
ORDER BY s.name, o.name, c.column_id;

-- 3. Catalogo de roles existente: solo los tres campos solicitados.
SELECT IdRol, Nombre, Activo
FROM dbo.Roles
ORDER BY IdRol;
