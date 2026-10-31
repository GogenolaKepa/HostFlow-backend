-- SOLO SELECT de catálogos, sin datos personales ni ejecución de migraciones.
-- Ejecutar identidad09 primero, con visibilidad administrativa. VerDefiniciones=0
-- o cualquier diferencia BLOQUEA aceptación, incluso si las cantidades coinciden.
-- Referencia: fuentes01 ->04 ->06 ->08. Complementar con detalle02/09:
-- Las fases12/13 de propiedad/aislamiento no cambian estos conteos; verificar con14.
-- cantidades iguales no sustituyen comparar tipos, definiciones, columnas y filtros.
SELECT DB_NAME() AS Base,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS Servidor,
 CONVERT(int,SERVERPROPERTY('EngineEdition')) AS Motor,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS VerDefiniciones,
 IS_ROLEMEMBER(N'db_datawriter') AS DataWriter,IS_ROLEMEMBER(N'db_datareader') AS DataReader;

SELECT e.Tabla,e.Columnas AS ColumnasEsperadas,
 (SELECT COUNT(*) FROM sys.columns c WHERE c.object_id=OBJECT_ID(N'authcom.'+e.Tabla,N'U')) AS ColumnasActuales,
 e.Indices AS IndicesEsperados,
 (SELECT COUNT(*) FROM sys.indexes i WHERE i.object_id=OBJECT_ID(N'authcom.'+e.Tabla,N'U') AND i.index_id>0 AND i.is_hypothetical=0) AS IndicesActuales,
 e.FK AS FKEsperadas,
 (SELECT COUNT(*) FROM sys.foreign_keys f WHERE f.parent_object_id=OBJECT_ID(N'authcom.'+e.Tabla,N'U')) AS FKActuales,
 e.CK AS CHECKEsperados,
 (SELECT COUNT(*) FROM sys.check_constraints k WHERE k.parent_object_id=OBJECT_ID(N'authcom.'+e.Tabla,N'U')) AS CHECKActuales,
 e.Defaults AS DefaultsEsperados,
 (SELECT COUNT(*) FROM sys.default_constraints d WHERE d.parent_object_id=OBJECT_ID(N'authcom.'+e.Tabla,N'U')) AS DefaultsActuales
FROM (VALUES
 (N'Contactos',5,1,1,2,0),(N'Desafios',13,5,3,7,0),(N'Cuotas',5,1,0,2,0),
 (N'Outbox',12,2,1,6,2),(N'Auditoria',7,1,4,1,0),(N'Ingresos',9,2,0,6,1),
 (N'IngresoFallos',6,2,1,3,0))e(Tabla,Columnas,Indices,FK,CK,Defaults) ORDER BY e.Tabla;

SELECT t.name AS TablaInesperada FROM sys.tables t
WHERE t.schema_id=SCHEMA_ID(N'authcom')
 AND t.name NOT IN(N'Contactos',N'Desafios',N'Cuotas',N'Outbox',N'Auditoria',N'Ingresos',N'IngresoFallos');
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name AS Restriccion,N'FK' AS Tipo
FROM sys.foreign_keys WHERE SCHEMA_NAME(schema_id)=N'authcom' AND(is_disabled=1 OR is_not_trusted=1)
UNION ALL SELECT OBJECT_NAME(parent_object_id),name,N'CHECK'
FROM sys.check_constraints WHERE SCHEMA_NAME(schema_id)=N'authcom' AND(is_disabled=1 OR is_not_trusted=1);
SELECT OBJECT_NAME(i.object_id) AS Tabla,i.name AS Indice FROM sys.indexes i
WHERE OBJECT_SCHEMA_NAME(i.object_id)=N'authcom' AND (i.is_disabled=1 OR i.is_hypothetical=1);
SELECT e.Marca,e.Esperado,CONVERT(nvarchar(100),p.value) AS Actual
FROM(VALUES(N'HostFlowAuthModelo',N'authcom-v1'),(N'HostFlowAuthIngreso',N'authcom-ingreso-v1'),
 (N'HostFlowAuthCorreo',N'authcom-correo-v1'),(N'HostFlowAuthResiliencia',N'authcom-resiliencia-v1'))e(Marca,Esperado)
LEFT JOIN sys.extended_properties p ON p.class=3 AND p.major_id=SCHEMA_ID(N'authcom') AND p.name=e.Marca;
