-- DCL independiente. No pertenece al manifiesto de instalación01/12/13/04/06/08.
-- Matrices03/05: cuentas gestiona confirmaciones e invitaciones; workerIngreso
-- procesa solicitudes. No se fusiona el worker con el principal público.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
DECLARE @Ingreso sysname=NULL,@WorkerIngreso sysname=NULL,@Cuentas sysname=NULL,@Correo sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51930,'Perfiles bloqueados.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),CONVERT(sysname,SERVERPROPERTY('ServerName')))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 51931,'Destino/sesión incompatibles.',1;
IF NOT EXISTS(SELECT 1 FROM sys.schemas WHERE name=N'authcom' AND principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_authcom_owner'))
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthResiliencia' AND CONVERT(nvarchar(80),value)=N'authcom-resiliencia-v1')
 OR EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthPermisos')
 OR (SELECT COUNT(*) FROM sys.database_permissions WHERE class=3 AND major_id=SCHEMA_ID(N'authcom')
  AND grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_app') AND state=N'D'
  AND permission_name IN(N'SELECT',N'INSERT',N'UPDATE',N'DELETE',N'EXECUTE',N'ALTER',N'REFERENCES',N'TAKE OWNERSHIP'))<>8
 THROW 51932,'Modelo/aislamiento incompatible o perfiles ya aplicados.',1;
DECLARE @Perfiles TABLE(Perfil varchar(20),Nombre sysname);
INSERT @Perfiles VALUES('ingresoHttp',@Ingreso),('workerIngreso',@WorkerIngreso),('cuentas',@Cuentas),('correo',@Correo);
IF (SELECT COUNT(DISTINCT LOWER(Nombre)) FROM @Perfiles)<>4
 OR EXISTS(SELECT 1 FROM @Perfiles p LEFT JOIN sys.database_principals u ON u.name=p.Nombre
  WHERE p.Nombre IS NULL OR u.principal_id IS NULL OR u.type<>N'E' OR u.authentication_type<>4
   OR NOT EXISTS(SELECT 1 FROM sys.extended_properties e WHERE e.class=4 AND e.major_id=u.principal_id
    AND e.name=N'HostFlowAuthPerfil' AND CONVERT(varchar(20),e.value)=p.Perfil)
   OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id=u.principal_id)
   OR EXISTS(SELECT 1 FROM sys.database_permissions WHERE grantee_principal_id=u.principal_id AND permission_name<>N'CONNECT')
   OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=u.principal_id)
   OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=u.principal_id))
 THROW 51933,'Identidades ausentes, reutilizadas o con privilegios previos.',1;
DECLARE @Permisos TABLE(Perfil varchar(20),Clausula nvarchar(1000));
INSERT @Permisos VALUES
 ('ingresoHttp',N'INSERT ON OBJECT::authcom.Ingresos'),
 ('workerIngreso',N'SELECT,UPDATE ON OBJECT::authcom.Ingresos'),
 ('workerIngreso',N'SELECT,INSERT,UPDATE ON OBJECT::authcom.IngresoFallos'),
 ('workerIngreso',N'SELECT,INSERT,UPDATE ON OBJECT::authcom.Desafios'),
 ('workerIngreso',N'SELECT ON OBJECT::authcom.Contactos'),
 ('workerIngreso',N'INSERT ON OBJECT::authcom.Outbox'),
 ('workerIngreso',N'INSERT ON OBJECT::authcom.Auditoria'),
 ('workerIngreso',N'SELECT ON OBJECT::dbo.Usuarios(IdUsuario,Nombre,Email,EmailNormalizado,IdRol,Estado,DebeCambiarPassword,VersionSesion,VersionRegistro)'),
 ('workerIngreso',N'SELECT ON OBJECT::dbo.Roles(IdRol,Nombre,Activo)'),
 ('workerIngreso',N'SELECT ON OBJECT::dbo.Empresas(IdEmpresa,Activo)'),
 ('cuentas',N'SELECT,INSERT ON OBJECT::authcom.Contactos'),
 ('cuentas',N'SELECT,INSERT,UPDATE ON OBJECT::authcom.Desafios'),
 ('cuentas',N'INSERT ON OBJECT::authcom.Outbox'),
 ('cuentas',N'INSERT ON OBJECT::authcom.Auditoria'),
 ('cuentas',N'SELECT ON OBJECT::dbo.Usuarios(IdUsuario,Nombre,Email,EmailNormalizado,PasswordHash,IdRol,Estado,DebeCambiarPassword,VersionSesion,VersionRegistro)'),
 ('cuentas',N'INSERT ON OBJECT::dbo.Usuarios'),
 ('cuentas',N'UPDATE ON OBJECT::dbo.Usuarios(PasswordHash,DebeCambiarPassword,VersionSesion,FechaCambioPassword,FechaActualizacion,IdUsuarioActualizacion)'),
 ('cuentas',N'SELECT ON OBJECT::dbo.Roles(IdRol,Nombre,Activo)'),
 ('cuentas',N'SELECT ON OBJECT::dbo.Empresas(IdEmpresa,Activo)'),
 ('correo',N'SELECT,UPDATE ON OBJECT::authcom.Outbox'),
 ('correo',N'SELECT ON OBJECT::authcom.Desafios');
INSERT @Permisos SELECT Perfil,N'CONNECT' FROM @Perfiles;
INSERT @Permisos SELECT Perfil,N'SELECT,INSERT,UPDATE ON OBJECT::authcom.Cuotas' FROM @Perfiles;
INSERT @Permisos SELECT Perfil,N'VIEW DEFINITION ON SCHEMA::authcom' FROM @Perfiles;
-- Permite acreditar el negativo IMPERSONATE sin interpretar NULL como denegación.
INSERT @Permisos SELECT Perfil,N'VIEW DEFINITION ON USER::hostflow_authcom_owner' FROM @Perfiles;
INSERT @Permisos SELECT p.Perfil,N'VIEW DEFINITION ON OBJECT::dbo.'+v.Objeto FROM @Perfiles p
 CROSS JOIN(VALUES(N'Usuarios'),(N'Roles'),(N'Empresas'))v(Objeto);
-- sp_getapplock se acredita ejecutándolo en la aceptación de cuentas/workers;
-- utiliza public. No intentar GRANT sobre un procedimiento de sistema aquí ni
-- cambiar master para satisfacerlo. Si no está disponible, detener la activación.
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @Nombre sysname,@Clausula nvarchar(1000),@SQL nvarchar(max);
 DECLARE permisos CURSOR LOCAL FAST_FORWARD FOR SELECT p.Nombre,g.Clausula FROM @Perfiles p JOIN @Permisos g ON g.Perfil=p.Perfil;
 OPEN permisos;FETCH NEXT FROM permisos INTO @Nombre,@Clausula;
 WHILE @@FETCH_STATUS=0
 BEGIN
  SET @SQL=N'GRANT '+@Clausula+N' TO '+QUOTENAME(@Nombre)+N';';EXEC sys.sp_executesql @SQL;
  FETCH NEXT FROM permisos INTO @Nombre,@Clausula;
 END;
 CLOSE permisos;DEALLOCATE permisos;
 EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthPermisos',@value=N'authcom-perfiles-v1',@level0type=N'SCHEMA',@level0name=N'authcom';
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- Sin roles, DELETE, UPDATE IdRol/Estado, DDL ni grants amplios sobre authcom/dbo.
-- INSERT Usuarios permite escoger IdRol a nivel SQL: Operador se exige en el servicio.
-- Aceptar ese límite antes de aprovisionar. No activar HTTP/worker con este script.
