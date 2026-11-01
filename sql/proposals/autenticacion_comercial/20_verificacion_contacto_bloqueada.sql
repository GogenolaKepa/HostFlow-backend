-- POSTERIOR y opcional. NO ejecutar en Azure sin nueva autorización DDL.
-- Amplía tres CHECK de las tablas existentes; sin backfill, contactos ni GRANT.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51980,'Verificación de contactos bloqueada.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),CONVERT(sysname,SERVERPROPERTY('ServerName')))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 51981,'Destino/sesión no acreditados.',1;
IF NOT EXISTS(SELECT 1 FROM sys.schemas s JOIN sys.database_principals p ON p.principal_id=s.principal_id
 WHERE s.name=N'authcom' AND p.name=N'hostflow_authcom_owner' AND p.type='S' AND p.authentication_type=0)
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthResiliencia' AND CONVERT(nvarchar(80),value)=N'authcom-resiliencia-v1')
 OR (SELECT COUNT(*) FROM sys.database_permissions WHERE class=3 AND major_id=SCHEMA_ID(N'authcom')
 AND grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_app') AND state='D'
 AND permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','REFERENCES','TAKE OWNERSHIP'))<>8
 THROW 51982,'Dependencias/aislamiento no acreditados.',1;
IF EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthContacto')
 THROW 51983,'Verificación ya instalada: no repetir.',1;
DECLARE @Proposito sysname,@Forma sysname,@Auditoria sysname;
-- Nombres de CHECK generados por SQL no son estables; localizar por columna y
-- contrato exacto normalizado. No quitar restricciones desconocidas.
DECLARE @Checks TABLE(Nombre sysname,Tabla sysname,Columna sysname NULL,Def nvarchar(max));
INSERT @Checks SELECT c.name,OBJECT_NAME(c.parent_object_id),COL_NAME(c.parent_object_id,c.parent_column_id),
 REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.definition,N' ',N''),N'(',N''),N')',N''),CHAR(13),N''),CHAR(10),N'')
 FROM sys.check_constraints c WHERE c.parent_object_id IN(OBJECT_ID(N'authcom.Desafios'),OBJECT_ID(N'authcom.Auditoria'))
 AND c.is_disabled=0 AND c.is_not_trusted=0;
SELECT @Proposito=Nombre FROM @Checks WHERE Tabla=N'Desafios' AND Columna=N'Proposito'
 AND Def IN(N'[Proposito]=''invitacion''OR[Proposito]=''recuperacion''',N'[Proposito]=''recuperacion''OR[Proposito]=''invitacion''');
SELECT @Forma=Nombre FROM @Checks WHERE Tabla=N'Desafios' AND Columna IS NULL
 AND Def=N'[Proposito]=''recuperacion''AND[IdUsuario]ISNOTNULLAND[IdInvitador]ISNULLAND[Pendiente]=0OR[Proposito]=''invitacion''AND[IdUsuario]ISNULLAND[IdInvitador]ISNOTNULL';
SELECT @Auditoria=Nombre FROM @Checks WHERE Tabla=N'Auditoria' AND Columna=N'Tipo'
 AND Def=N'[Tipo]=''INVITACION_REVOCADA''OR[Tipo]=''INVITACION_ACEPTADA''OR[Tipo]=''PASSWORD_RESTABLECIDA''OR[Tipo]=''INVITACION_EMITIDA''OR[Tipo]=''RECUPERACION_SOLICITADA''';
IF @Proposito IS NULL OR @Forma IS NULL OR @Auditoria IS NULL THROW 51984,'CHECK previo distinto: revisión requerida.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @DDL nvarchar(max)=N'ALTER TABLE authcom.Desafios DROP CONSTRAINT '+QUOTENAME(@Proposito)+N','+QUOTENAME(@Forma)+N'; ALTER TABLE authcom.Auditoria DROP CONSTRAINT '+QUOTENAME(@Auditoria)+N';';
 EXEC sys.sp_executesql @DDL;
 ALTER TABLE authcom.Desafios WITH CHECK ADD CONSTRAINT CK_Desafios_Proposito_Contacto
 CHECK(Proposito IN('recuperacion','invitacion','contacto'));
 ALTER TABLE authcom.Desafios WITH CHECK ADD CONSTRAINT CK_Desafios_Forma_Contacto
 CHECK((Proposito IN('recuperacion','contacto') AND IdUsuario IS NOT NULL AND IdInvitador IS NULL AND Pendiente=0)
 OR (Proposito='invitacion' AND IdUsuario IS NULL AND IdInvitador IS NOT NULL));
 ALTER TABLE authcom.Auditoria WITH CHECK ADD CONSTRAINT CK_Auditoria_Tipo_Contacto
 CHECK(Tipo IN('RECUPERACION_SOLICITADA','INVITACION_EMITIDA','PASSWORD_RESTABLECIDA','INVITACION_ACEPTADA','INVITACION_REVOCADA','CONTACTO_SOLICITADO','CONTACTO_VERIFICADO'));
 EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthContacto',@value=N'authcom-contacto-v1',@level0type=N'SCHEMA',@level0name=N'authcom';
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- DCL separado pendiente: solo perfil cuentas necesita SELECT,INSERT,UPDATE en
-- authcom.Contactos. Nada para hostflow_app/ingresoHttp/workerIngreso. Sin DELETE.
-- Reversión: desactivar HTTP de contactos, conservar evidencias y evaluar filas
-- Proposito=contacto / auditorías nuevas antes de restringir CHECK. NO auto-DOWN.
