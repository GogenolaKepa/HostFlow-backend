-- PROPUESTA POSTERIOR INDEPENDIENTE. NO pertenece a01-15,16/17 o18.
-- Solo esquema durable de correlación/eventos/supresión. Sin GRANT ni activación.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51970,'Eventos de correo bloqueados.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),CONVERT(sysname,SERVERPROPERTY('ServerName')))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR CONVERT(int,SERVERPROPERTY('EngineEdition'))<>5 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 51971,'Destino/sesión no acreditados.',1;
IF OBJECT_ID(N'authcom.Outbox',N'U') IS NULL
 OR NOT EXISTS(SELECT 1 FROM sys.schemas s JOIN sys.database_principals p ON p.principal_id=s.principal_id
   WHERE s.name=N'authcom' AND p.name=N'hostflow_authcom_owner' AND p.type='S' AND p.authentication_type=0)
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthResiliencia' AND CONVERT(nvarchar(80),value)=N'authcom-resiliencia-v1')
 OR (SELECT COUNT(*) FROM sys.database_permissions WHERE class=3 AND major_id=SCHEMA_ID(N'authcom')
   AND grantee_principal_id=DATABASE_PRINCIPAL_ID(N'hostflow_app') AND state='D'
   AND permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','REFERENCES','TAKE OWNERSHIP'))<>8
 THROW 51972,'Dependencias/aislamiento no acreditados.',1;
IF OBJECT_ID(N'authcom.CorreoMensajes') IS NOT NULL OR OBJECT_ID(N'authcom.CorreoEventos') IS NOT NULL OR OBJECT_ID(N'authcom.CorreoBloqueos') IS NOT NULL
 OR EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthEventos')
 THROW 51973,'Objetos previos: no completar ni repetir.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 CREATE TABLE authcom.CorreoMensajes(
  OutboxId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES authcom.Outbox(Id),
  ProveedorId uniqueidentifier NULL,
  Destino binary(32) NOT NULL,
  Prioridad tinyint NOT NULL DEFAULT 0 CHECK(Prioridad IN(0,10,20,30,40,50,60,70)),
  Estado varchar(32) NOT NULL DEFAULT 'preparada' CHECK(Estado IN('preparada','email.sent','email.delivery_delayed','email.delivered','email.failed','email.bounced','email.suppressed','email.complained')),
  EstadoEn datetime2(3) NULL,CreadaEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
 );
 CREATE UNIQUE INDEX UX_CorreoMensajes_Proveedor ON authcom.CorreoMensajes(ProveedorId) WHERE ProveedorId IS NOT NULL;
 CREATE TABLE authcom.CorreoEventos(
  EventoId varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  ProveedorId uniqueidentifier NOT NULL,Huella binary(32) NOT NULL,
  Tipo varchar(32) NOT NULL CHECK(Tipo IN('email.sent','email.delivery_delayed','email.delivered','email.failed','email.bounced','email.suppressed','email.complained')),
  OcurridoEn datetime2(3) NOT NULL,RecibidoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  OutboxId uniqueidentifier NULL REFERENCES authcom.CorreoMensajes(OutboxId),
  AplicadoEn datetime2(3) NULL,
  CHECK((OutboxId IS NULL AND AplicadoEn IS NULL) OR (OutboxId IS NOT NULL AND AplicadoEn IS NOT NULL))
 );
 CREATE INDEX IX_CorreoEventos_Pendientes ON authcom.CorreoEventos(ProveedorId,OcurridoEn,EventoId) WHERE AplicadoEn IS NULL;
 CREATE TABLE authcom.CorreoBloqueos(
  Destino binary(32) NOT NULL PRIMARY KEY,
  Tipo varchar(32) NOT NULL CHECK(Tipo IN('email.bounced','email.complained','email.suppressed')),
  Fecha datetime2(3) NOT NULL,EventoId varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL REFERENCES authcom.CorreoEventos(EventoId)
 );
 EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthEventos',@value=N'authcom-eventos-v1',@level0type=N'SCHEMA',@level0name=N'authcom';
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- Sin cuerpos crudos, emails, asuntos, enlaces ni tokens. Destino es HMAC privado
-- de correo normalizado, con clave estable gestionada, NO SHA256 simple de un email.
-- No se añaden identidades ni permisos aquí. Sender y receptor requieren DCL
-- revisada aparte. Mantenerlos inactivos hasta aceptar atomicidad real Node/SQL.
-- Sin limpieza automática: definir retención de deduplicación/supresión antes de
-- cualquier DELETE; sus FK impiden perder silenciosamente el motivo del bloqueo.
