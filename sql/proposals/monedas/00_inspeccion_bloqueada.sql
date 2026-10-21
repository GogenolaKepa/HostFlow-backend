-- PREPARADO, NO EJECUTADO. Solo metadatos; no filas, SID ni credenciales.
DECLARE @AutorizarLectura bit=0, @ServidorEsperado sysname=NULL;
IF ISNULL(@AutorizarLectura,0)<>1 OR @ServidorEsperado IS NULL THROW 52300,'Inspeccion no autorizada.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow' OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 THROW 52301,'Destino distinto.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 52302,'Visibilidad insuficiente.',1;
SELECT DB_NAME() AS Base,SERVERPROPERTY('ServerName') AS Servidor,DATABASEPROPERTYEX(DB_NAME(),'Collation') AS Collation;
SELECT t.name AS Tabla,c.name AS Columna,ty.name AS Tipo,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity
 FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
 WHERE t.schema_id=SCHEMA_ID(N'dbo') AND t.name IN(N'Usuarios',N'Empresas',N'Propiedades',N'Reservas',N'ReservaEventos',N'ConfiguracionMonetaria',N'TarifasPropiedad',N'AcuerdosMonetariosReserva');
SELECT OBJECT_NAME(i.object_id) AS Tabla,i.name,i.is_unique,i.is_primary_key,c.name AS Columna,ic.key_ordinal
 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
 WHERE i.object_id IN(OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Empresas'),OBJECT_ID(N'dbo.Propiedades'),OBJECT_ID(N'dbo.Reservas'));
SELECT OBJECT_NAME(parent_id) AS Tabla,name,is_disabled,is_instead_of_trigger FROM sys.triggers WHERE parent_class=1 AND is_ms_shipped=0;
SELECT name,is_enabled FROM sys.security_policies;
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,definition,is_disabled,is_not_trusted FROM sys.check_constraints
 WHERE parent_object_id IN(OBJECT_ID(N'dbo.Reservas'),OBJECT_ID(N'dbo.ReservaEventos'),OBJECT_ID(N'dbo.Propiedades'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'));
SELECT OBJECT_NAME(parent_object_id) AS Tabla,COL_NAME(parent_object_id,parent_column_id) AS Columna,name,definition FROM sys.default_constraints
 WHERE parent_object_id IN(OBJECT_ID(N'dbo.Reservas'),OBJECT_ID(N'dbo.ReservaEventos'),OBJECT_ID(N'dbo.Propiedades'));
SELECT OBJECT_NAME(target_object_id) AS Tabla,predicate_type_desc,operation_desc,predicate_definition FROM sys.security_predicates;
