-- PREPARADO, NO EJECUTADO. Solo metadatos, sin datos financieros o personales.
DECLARE @AutorizarLectura bit=0,@ServidorEsperado sysname=NULL;
IF ISNULL(@AutorizarLectura,0)<>1 OR @ServidorEsperado IS NULL THROW 52330,'Verificacion bloqueada.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow' OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 THROW 52331,'Destino no acreditado.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 52332,'Visibilidad insuficiente para acreditar el esquema completo.',1;
SELECT DB_NAME() AS Base,SERVERPROPERTY('ServerName') AS Servidor,USER_NAME() AS Principal;
IF (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0 AND name=N'HostFlowMonedasModelo'
 AND major_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'))
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-monedas-v2'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'hostflow-monedas-v2'))<>3 THROW 52333,'No se acreditan las tres marcas v2.',1;
SELECT t.name AS Tabla,c.name AS Columna,ty.name AS Tipo,c.max_length,c.precision,c.scale,c.is_nullable,c.collation_name,c.is_identity,c.is_computed
 FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
 WHERE t.object_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,definition,is_disabled,is_not_trusted FROM sys.check_constraints
 WHERE parent_object_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,is_disabled,is_not_trusted,delete_referential_action_desc FROM sys.foreign_keys
 WHERE parent_object_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(object_id) AS Tabla,name,is_unique,is_primary_key FROM sys.indexes
 WHERE object_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(d.parent_object_id) AS Tabla,COL_NAME(d.parent_object_id,d.parent_column_id) AS Columna,d.name,d.definition
 FROM sys.default_constraints d WHERE d.parent_object_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(f.parent_object_id) AS Tabla,f.name,COL_NAME(c.parent_object_id,c.parent_column_id) AS Columna,
 OBJECT_SCHEMA_NAME(f.referenced_object_id) AS EsquemaReferencia,OBJECT_NAME(f.referenced_object_id) AS TablaReferencia,
 COL_NAME(c.referenced_object_id,c.referenced_column_id) AS ColumnaReferencia
 FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
 WHERE f.parent_object_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(i.object_id) AS Tabla,i.name,i.is_disabled,i.has_filter,i.filter_definition,c.name AS Columna,ic.key_ordinal,ic.is_included_column
 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
 WHERE i.object_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(parent_id) AS Tabla,name,is_disabled,is_instead_of_trigger FROM sys.triggers WHERE parent_class=1
 AND parent_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(target_object_id) AS Tabla,predicate_type_desc,operation_desc,predicate_definition FROM sys.security_predicates
 WHERE target_object_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(major_id) AS Tabla,value AS Modelo FROM sys.extended_properties WHERE name=N'HostFlowMonedasModelo';
-- HAS_PERMS_BY_NAME, si se agrega, refleja la sesion; admin no acredita al backend.
-- Lo siguiente acredita concesiones DIRECTAS del principal indicado, no permisos efectivos.
;WITH Objetos AS (
 SELECT Tabla FROM (VALUES(N'ConfiguracionMonetaria'),(N'TarifasPropiedad'),(N'AcuerdosMonetariosReserva')) v(Tabla)
), ColumnasUpdate AS (
 SELECT Tabla,Columna FROM (VALUES
 (N'ConfiguracionMonetaria',N'Fuente'),(N'ConfiguracionMonetaria',N'Tipo'),(N'ConfiguracionMonetaria',N'Valor'),(N'ConfiguracionMonetaria',N'FechaCotizacion'),
 (N'ConfiguracionMonetaria',N'HoraPublicacion'),(N'ConfiguracionMonetaria',N'ConsultadaEn'),(N'ConfiguracionMonetaria',N'IdUsuarioActualizacion'),(N'ConfiguracionMonetaria',N'FechaActualizacion'),
 (N'TarifasPropiedad',N'Moneda'),(N'TarifasPropiedad',N'PrecioBase'),(N'TarifasPropiedad',N'ReferenciaFuente'),(N'TarifasPropiedad',N'ReferenciaTipo'),
 (N'TarifasPropiedad',N'ReferenciaValor'),(N'TarifasPropiedad',N'ReferenciaFecha'),(N'TarifasPropiedad',N'IdUsuarioActualizacion'),(N'TarifasPropiedad',N'FechaActualizacion'),
 (N'AcuerdosMonetariosReserva',N'Moneda'),(N'AcuerdosMonetariosReserva',N'Importe'),(N'AcuerdosMonetariosReserva',N'PagoEquivalenteARS'),(N'AcuerdosMonetariosReserva',N'FuenteReferencia'),
 (N'AcuerdosMonetariosReserva',N'TipoReferencia'),(N'AcuerdosMonetariosReserva',N'FuenteAplicada'),(N'AcuerdosMonetariosReserva',N'TipoAplicado'),(N'AcuerdosMonetariosReserva',N'ValorAplicado'),
 (N'AcuerdosMonetariosReserva',N'FechaEfectiva'),(N'AcuerdosMonetariosReserva',N'FechaCheckinFijada'),(N'AcuerdosMonetariosReserva',N'FijadoEn'),(N'AcuerdosMonetariosReserva',N'EquivalenteARS'),
 (N'AcuerdosMonetariosReserva',N'IdUsuarioFijacion'),(N'AcuerdosMonetariosReserva',N'IdUsuarioActualizacion'),(N'AcuerdosMonetariosReserva',N'FechaActualizacion')) v(Tabla,Columna)
), Esperados AS (
 SELECT Tabla,CAST(N'' AS nvarchar(128)) AS Columna,Permiso FROM Objetos CROSS JOIN (VALUES(N'SELECT'),(N'INSERT')) v(Permiso)
 UNION ALL SELECT Tabla,Columna,N'UPDATE' FROM ColumnasUpdate
), Directos AS (
 SELECT OBJECT_NAME(p.major_id) AS Tabla,ISNULL(COL_NAME(p.major_id,p.minor_id),N'') AS Columna,p.permission_name AS Permiso,p.state_desc AS Estado
 FROM sys.database_permissions p JOIN sys.database_principals u ON u.principal_id=p.grantee_principal_id
 WHERE u.name=N'hostflow_app' AND p.class=1 AND p.major_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'))
)
SELECT COALESCE(e.Tabla,d.Tabla) AS Tabla,COALESCE(e.Columna,d.Columna) AS Columna,COALESCE(e.Permiso,d.Permiso) AS Permiso,d.Estado,
 CASE WHEN e.Tabla IS NULL THEN N'EXTRA_NO_PROPUESTO' WHEN d.Tabla IS NULL THEN N'FALTA_GRANT_DIRECTO' WHEN d.Estado<>N'GRANT' THEN N'REVISAR_DENY_O_GRANT_OPTION' ELSE N'GRANT_DIRECTO_ESPERADO' END AS Resultado
FROM Esperados e FULL JOIN Directos d ON e.Tabla=d.Tabla AND e.Columna=d.Columna AND e.Permiso=d.Permiso
ORDER BY Tabla,Columna,Permiso;

SELECT r.name AS RolActual FROM sys.database_role_members m JOIN sys.database_principals r ON r.principal_id=m.role_principal_id
 JOIN sys.database_principals u ON u.principal_id=m.member_principal_id WHERE u.name=N'hostflow_app';
-- Si conserva db_datareader/db_datawriter, una FALTA de GRANT directo NO demuestra
-- ausencia de permiso efectivo. Este script no ejecuta GRANT, DENY o ALTER ROLE.
