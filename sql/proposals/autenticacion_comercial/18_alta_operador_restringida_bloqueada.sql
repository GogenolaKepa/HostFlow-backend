-- PROPUESTA OPCIONAL INDEPENDIENTE: DDL y DCL requieren aprobaciones separadas.
-- No pertenece al candidato01-15 ni se ejecuta al arrancar. Después de16/17.
-- Sustituye INSERT directo de cuentas por EXECUTE de un módulo con rol fijo.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@AutorizarDDL bit=0,@AutorizarDCL bit=0;
DECLARE @BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL,@Cuentas sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 OR ISNULL(@AutorizarDDL,0)<>1 OR ISNULL(@AutorizarDCL,0)<>1
 THROW 51950,'Alta restringida bloqueada.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL OR @Cuentas IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),CONVERT(sysname,SERVERPROPERTY('ServerName')))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL'),0)<>1 THROW 51951,'Destino/autoridad incompatible.',1;
IF NOT EXISTS(SELECT 1 FROM sys.schemas WHERE name=N'authcom' AND principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner'))
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'hostflow_authcom_owner' AND type=N'S' AND authentication_type=0)
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthPermisos' AND CONVERT(nvarchar(80),value)=N'authcom-perfiles-v1')
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=4 AND major_id=DATABASE_PRINCIPAL_ID(@Cuentas) AND name=N'HostFlowAuthPerfil' AND CONVERT(varchar(20),value)='cuentas')
 OR OBJECT_ID(N'authcom.CrearOperadorInvitado') IS NOT NULL
 OR EXISTS(SELECT 1 FROM sys.sql_modules m JOIN sys.objects o ON o.object_id=m.object_id WHERE o.schema_id=SCHEMA_ID(N'authcom'))
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner'))
 OR EXISTS(SELECT 1 FROM sys.database_permissions WHERE grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner') AND permission_name<>N'CONNECT')
 OR EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthAlta')
 THROW 51952,'Dependencias incompatibles o módulo preexistente.',1;
IF EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=DATABASE_PRINCIPAL_ID(@Cuentas))
 OR NOT EXISTS(SELECT 1 FROM sys.database_permissions WHERE class=1 AND major_id=OBJECT_ID(N'dbo.Usuarios') AND minor_id=0
  AND grantee_principal_id=DATABASE_PRINCIPAL_ID(@Cuentas) AND permission_name='INSERT' AND state='G')
 THROW 51953,'Perfil distinto al aprobado17.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 -- Propietario sin login. NO CONTROL de dbo, roles, permisos ni UPDATE de Usuarios.
 GRANT INSERT ON OBJECT::dbo.Usuarios TO hostflow_authcom_owner;
 GRANT SELECT ON OBJECT::dbo.Usuarios(IdUsuario,EmailNormalizado,IdRol,Estado,DebeCambiarPassword,VersionSesion) TO hostflow_authcom_owner;
 GRANT SELECT ON OBJECT::dbo.Roles(IdRol,Nombre,Activo) TO hostflow_authcom_owner;
 GRANT SELECT ON OBJECT::dbo.Empresas(IdEmpresa,Activo) TO hostflow_authcom_owner;
 EXEC(N'CREATE PROCEDURE authcom.CrearOperadorInvitado
  @DesafioId uniqueidentifier,@IdEmpresa int,@ConsumidaEn datetime2(3),@PasswordHash varchar(60)
 WITH EXECUTE AS OWNER AS
 BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @@TRANCOUNT=0 OR XACT_STATE()<>1 OR ISNULL(APPLOCK_MODE(N''public'',N''HostFlow:Seguridad:AdministradoresActivos'',N''Transaction''),N'''')<>N''Exclusive''
   THROW 51954,''Requiere transacción y bloqueo de cuentas.'',1;
  IF @IdEmpresa<>1 OR @ConsumidaEn IS NULL OR @PasswordHash IS NULL OR DATALENGTH(@PasswordHash)<>60
   OR LEFT(@PasswordHash,4) NOT IN (''$2a$'',''$2b$'') THROW 51955,''Datos incompatibles.'',1;
  DECLARE @Email nvarchar(254),@Nombre nvarchar(120),@Actor int,@Version int,@Rol int,@Id int;
  SELECT @Email=d.Email,@Nombre=JSON_VALUE(d.Documento,''$.nombre''),@Actor=d.IdInvitador,
   @Version=TRY_CONVERT(int,JSON_VALUE(d.Documento,''$.versionInvitador''))
  FROM authcom.Desafios d WITH(UPDLOCK,HOLDLOCK)
  WHERE d.Id=@DesafioId AND d.IdEmpresa=@IdEmpresa AND d.Proposito=''invitacion''
   AND d.ConsumidaEn=@ConsumidaEn AND d.RevocadaEn IS NULL AND d.Pendiente=0
   AND d.CreadaEn<=@ConsumidaEn AND d.ExpiraEn>@ConsumidaEn AND d.ExpiraEn>SYSUTCDATETIME()
   AND JSON_VALUE(d.Documento,''$.rol'') COLLATE Latin1_General_100_BIN2=N''Operador'';
  IF @Email IS NULL OR @Nombre IS NULL OR LEN(LTRIM(RTRIM(@Nombre)))=0
   OR NOT EXISTS(SELECT 1 FROM dbo.Empresas WITH(HOLDLOCK) WHERE IdEmpresa=@IdEmpresa AND Activo=1)
   OR NOT EXISTS(SELECT 1 FROM dbo.Usuarios u WITH(UPDLOCK,HOLDLOCK) JOIN dbo.Roles r WITH(HOLDLOCK) ON r.IdRol=u.IdRol
     WHERE u.IdUsuario=@Actor AND u.Estado=N''Activo'' AND u.DebeCambiarPassword=0 AND u.VersionSesion=@Version
      AND r.Nombre COLLATE Latin1_General_100_BIN2=N''Administrador'' AND r.Activo=1)
   OR EXISTS(SELECT 1 FROM dbo.Usuarios WITH(UPDLOCK,HOLDLOCK) WHERE EmailNormalizado=@Email)
   OR EXISTS(SELECT 1 FROM authcom.Auditoria WITH(UPDLOCK,HOLDLOCK) WHERE DesafioId=@DesafioId AND Tipo=''INVITACION_ACEPTADA'')
   THROW 51956,''Invitación no disponible.'',1;
  SELECT @Rol=IdRol FROM dbo.Roles WITH(HOLDLOCK) WHERE Nombre COLLATE Latin1_General_100_BIN2=N''Operador'' AND Activo=1;
  IF @Rol IS NULL THROW 51957,''Rol no disponible.'',1;
  INSERT dbo.Usuarios(Nombre,Email,PasswordHash,IdRol,DebeCambiarPassword,IdUsuarioCreacion,IdUsuarioActualizacion)
   VALUES(@Nombre,@Email,@PasswordHash,@Rol,0,@Actor,@Actor);
  SET @Id=CONVERT(int,SCOPE_IDENTITY());
  INSERT authcom.Contactos(IdUsuario,Email,VersionContacto,VerificadoEn) VALUES(@Id,@Email,1,@ConsumidaEn);
  INSERT authcom.Auditoria(Tipo,UsuarioId,ActorId,DesafioId,IdEmpresa,Fecha)
   VALUES(''INVITACION_ACEPTADA'',@Id,@Actor,@DesafioId,@IdEmpresa,@ConsumidaEn);
  SELECT @Id AS id;
 END;');
 DECLARE @SQL nvarchar(max)=N'REVOKE INSERT ON OBJECT::dbo.Usuarios FROM '+QUOTENAME(@Cuentas)+N';GRANT EXECUTE ON OBJECT::authcom.CrearOperadorInvitado TO '+QUOTENAME(@Cuentas)+N';';
 EXEC sys.sp_executesql @SQL;
 EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthAlta',@value=N'authcom-operador-v1',@level0type=N'SCHEMA',@level0name=N'authcom';
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- Aceptación: EXECUTE cuentas=1; INSERT Usuarios cuentas=0; resto de perfiles
-- EXECUTE=0; sin IMPERSONATE propietario ni ALTER authcom. Ensayar rollback y replay.
-- El dueño puede insertar a nivel SQL, pero no tiene login. No conceder a cuentas
-- ALTER/CONTROL/IMPERSONATE: podría convertir cualquier módulo en un bypass.
-- No impide forjar invitaciones si se compromete el perfil cuentas completo;
-- sí elimina su capacidad de insertar Administradores directamente.
