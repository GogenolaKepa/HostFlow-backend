-- Metadatos + cantidades, sin contenido empresarial ni datos de usuarios.
SELECT DB_NAME() AS Base,SERVERPROPERTY('ServerName') AS Servidor,SERVERPROPERTY('EngineEdition') AS Motor;
SELECT t.name AS Tabla,c.name AS Columna,ty.name AS Tipo,c.max_length,c.is_nullable
 FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
 WHERE t.object_id IN(OBJECT_ID(N'dbo.Empresas',N'U'),OBJECT_ID(N'dbo.PreferenciasOperativas',N'U')) ORDER BY t.name,c.column_id;
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,is_disabled,is_not_trusted FROM sys.check_constraints
 WHERE parent_object_id IN(OBJECT_ID(N'dbo.Empresas',N'U'),OBJECT_ID(N'dbo.PreferenciasOperativas',N'U'));
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,is_disabled,is_not_trusted,delete_referential_action FROM sys.foreign_keys
 WHERE parent_object_id IN(OBJECT_ID(N'dbo.Empresas',N'U'),OBJECT_ID(N'dbo.PreferenciasOperativas',N'U'));
SELECT OBJECT_NAME(parent_object_id) AS Tabla,name,definition AS ValorPredeterminado FROM sys.default_constraints
 WHERE parent_object_id IN(OBJECT_ID(N'dbo.Empresas',N'U'),OBJECT_ID(N'dbo.PreferenciasOperativas',N'U'));
SELECT OBJECT_NAME(object_id) AS Tabla,name,is_primary_key,is_unique,is_disabled FROM sys.indexes
 WHERE object_id IN(OBJECT_ID(N'dbo.Empresas',N'U'),OBJECT_ID(N'dbo.PreferenciasOperativas',N'U')) AND index_id>0;
SELECT OBJECT_NAME(major_id) AS Tabla,name,CONVERT(nvarchar(100),value) AS Modelo FROM sys.extended_properties
 WHERE class=1 AND minor_id=0 AND name=N'HostFlowConfiguracionModelo'
 AND major_id IN(OBJECT_ID(N'dbo.Empresas',N'U'),OBJECT_ID(N'dbo.PreferenciasOperativas',N'U'));
SELECT COUNT(*) AS Empresas FROM dbo.Empresas;
SELECT COUNT(*) AS Preferencias FROM dbo.PreferenciasOperativas;
SELECT HAS_PERMS_BY_NAME(N'dbo.Empresas','OBJECT','SELECT') AS LeerEmpresa,
 HAS_PERMS_BY_NAME(N'dbo.Empresas','OBJECT','UPDATE') AS EditarEmpresa,
 HAS_PERMS_BY_NAME(N'dbo.PreferenciasOperativas','OBJECT','SELECT') AS LeerPreferencias,
 HAS_PERMS_BY_NAME(N'dbo.PreferenciasOperativas','OBJECT','UPDATE') AS EditarPreferencias;
