-- Propuesta de inspección. No ejecutar automáticamente ni leer datos de negocio.
SELECT DB_NAME() AS Base, SERVERPROPERTY('ServerName') AS Servidor,
  SERVERPROPERTY('EngineEdition') AS Motor, DATABASEPROPERTYEX(DB_NAME(),'Collation') AS Collation,
  HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS VisibilidadCompleta;

SELECT s.name AS Esquema,t.name AS Tabla FROM sys.tables t
JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name;

SELECT s.name AS Esquema,t.name AS Tabla,c.name AS Columna,ty.name AS Tipo,
  c.max_length,c.is_nullable,c.is_identity FROM sys.tables t
JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id
-- Inventario completo de columnas: una estructura equivalente puede tener otro
-- nombre. Solo metadatos, nunca valores de filas empresariales ni personales.
WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id;

SELECT OBJECT_SCHEMA_NAME(f.parent_object_id) AS Esquema,OBJECT_NAME(f.parent_object_id) AS Tabla,
  f.name AS Relacion,pc.name AS Columna,OBJECT_SCHEMA_NAME(f.referenced_object_id) AS EsquemaReferenciado,
  OBJECT_NAME(f.referenced_object_id) AS TablaReferenciada,rc.name AS ColumnaReferenciada
FROM sys.foreign_keys f JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id
JOIN sys.columns pc ON pc.object_id=fc.parent_object_id AND pc.column_id=fc.parent_column_id
JOIN sys.columns rc ON rc.object_id=fc.referenced_object_id AND rc.column_id=fc.referenced_column_id;

SELECT HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS CrearTabla,
  HAS_PERMS_BY_NAME(N'dbo','SCHEMA','ALTER') AS AlterarEsquema,
  HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','REFERENCES') AS ReferenciarUsuarios,
  USER_NAME() AS PrincipalSesionInspeccion;
