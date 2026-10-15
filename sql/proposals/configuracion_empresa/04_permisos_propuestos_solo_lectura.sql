-- SOLO PREPARA TEXTO. No ejecuta GRANT ni modifica identidades/permisos.
-- Completar con el principal REAL comprobado desde la conexión del backend.
DECLARE @PrincipalBackend sysname=NULL;
IF @PrincipalBackend IS NULL OR NOT EXISTS(SELECT 1 FROM sys.database_principals
 WHERE name COLLATE Latin1_General_100_BIN2=@PrincipalBackend COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(name)=DATALENGTH(@PrincipalBackend) AND type IN('S','U','E','X'))
 THROW 51520,'Indicar un principal existente y previamente verificado.',1;
SELECT N'GRANT SELECT, UPDATE ON OBJECT::dbo.Empresas TO '+QUOTENAME(@PrincipalBackend)+N';' AS Propuesta;
SELECT N'GRANT SELECT, UPDATE ON OBJECT::dbo.PreferenciasOperativas TO '+QUOTENAME(@PrincipalBackend)+N';' AS Propuesta;
