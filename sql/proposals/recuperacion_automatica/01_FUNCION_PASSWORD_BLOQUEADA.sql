-- PROPUESTA DDL. No ejecutar: requiere revisión, validación SQL Server y autorización.
THROW 51980, 'PROPUESTA BLOQUEADA. No es un instalador autorizado.', 1;

SET XACT_ABORT ON;
IF DB_NAME()<>N'HostFlow' OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5
 OR @@TRANCOUNT<>0 OR (2&@@OPTIONS)=2 THROW 51981,'Destino o sesión incompatible.',1;
IF OBJECT_ID(N'authcom.PermitePasswordLocal') IS NOT NULL
 OR EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthPasswordLocal')
 THROW 51982,'Objeto o marca preexistente: no sobrescribir.',1;
IF NOT EXISTS(SELECT 1 FROM sys.schemas s JOIN sys.database_principals p ON p.principal_id=s.principal_id
 WHERE s.name=N'authcom' AND p.name=N'hostflow_authcom_owner' AND p.authentication_type_desc=N'NONE')
 THROW 51983,'Propietario sin login no acreditado.',1;
BEGIN TRANSACTION;
EXEC(N'CREATE FUNCTION authcom.PermitePasswordLocal(@IdUsuario int)
RETURNS bit WITH EXECUTE AS OWNER
AS
BEGIN
 DECLARE @hash varchar(255);
 SELECT @hash=PasswordHash FROM dbo.Usuarios WHERE IdUsuario=@IdUsuario;
 -- Solo la cuenta local exacta. Nunca busca clientes/google ni enlaza por correo.
 IF @hash IS NULL OR DATALENGTH(@hash)<>60 OR LEFT(@hash,4) NOT IN(''$2a$'',''$2b$'')
  OR SUBSTRING(@hash,7,1)<>''$'' OR TRY_CONVERT(int,SUBSTRING(@hash,5,2)) NOT BETWEEN 4 AND 15
  OR SUBSTRING(@hash,5,2) COLLATE Latin1_General_100_BIN2 LIKE ''%[^0-9]%''
  OR SUBSTRING(@hash,8,53) COLLATE Latin1_General_100_BIN2 LIKE ''%[^./A-Za-z0-9]%''
  RETURN 0;
 RETURN 1;
END');
EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthPasswordLocal',@value=N'authcom-password-local-v1',@level0type=N'SCHEMA',@level0name=N'authcom';
COMMIT;
