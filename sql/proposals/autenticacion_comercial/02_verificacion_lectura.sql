-- Solo lectura, preparar para DESPUÉS de una migración autorizada. No ejecutado aquí.
SELECT DB_NAME() AS Base,SERVERPROPERTY('ServerName') AS Servidor;
SELECT name,value FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom');
SELECT t.name AS Tabla,c.name AS Columna,ty.name AS Tipo,c.max_length,c.is_nullable
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE s.name=N'authcom' ORDER BY t.name,c.column_id;
SELECT t.name AS Tabla,i.name,i.is_unique,i.filter_definition
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.indexes i ON i.object_id=t.object_id WHERE s.name=N'authcom';
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,is_disabled,is_not_trusted
FROM sys.foreign_keys WHERE SCHEMA_NAME(schema_id)=N'authcom';
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,definition,is_disabled,is_not_trusted
FROM sys.check_constraints WHERE SCHEMA_NAME(schema_id)=N'authcom';
-- No selecciona hashes, contactos, cuerpos cifrados ni filas de usuarios reales.
