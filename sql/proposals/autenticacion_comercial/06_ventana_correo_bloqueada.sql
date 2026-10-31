-- PROPUESTA: posterior a 01/04. No se ejecuta al arrancar. Sin datos/usuarios legacy.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51830,'Política de correo bloqueada.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),ISNULL(CONVERT(sysname,SERVERPROPERTY('ServerName')),N''))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0 THROW 51831,'Destino/sesión no acreditados.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 51832,'Visibilidad insuficiente.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthModelo' AND CONVERT(nvarchar(80),value)=N'authcom-v1')
 OR OBJECT_ID(N'authcom.Outbox',N'U') IS NULL OR COL_LENGTH(N'authcom.Outbox',N'PrimerIntentoEn') IS NOT NULL
 THROW 51833,'Modelo incompatible o propuesta ya aplicada.',1;
-- No interpretar una entrega antigua en vuelo como si nunca se hubiese intentado.
IF EXISTS(SELECT 1 FROM authcom.Outbox) THROW 51834,'Se exige outbox vacía y workers detenidos; no completar datos a ciegas.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 ALTER TABLE authcom.Outbox ADD PrimerIntentoEn datetime2(3) NULL;
 EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthCorreo',@value=N'authcom-correo-v1',@level0type=N'SCHEMA',@level0name=N'authcom';
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- Máximo tres intentos; desde el primero solo 23h para mantener margen con la
-- deduplicación de 24h del proveedor. No reenviar entregas antiguas con otra clave.
