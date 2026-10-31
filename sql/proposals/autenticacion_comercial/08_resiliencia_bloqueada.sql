-- PROPUESTA ADITIVA. No ejecutar en Azure sin autorización independiente.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51850,'Resiliencia bloqueada.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),ISNULL(CONVERT(sysname,SERVERPROPERTY('ServerName')),N''))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0 THROW 51851,'Destino/sesión no acreditados.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 51852,'Visibilidad insuficiente.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthIngreso' AND CONVERT(nvarchar(80),value)=N'authcom-ingreso-v1')
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthCorreo' AND CONVERT(nvarchar(80),value)=N'authcom-correo-v1')
 OR OBJECT_ID(N'authcom.IngresoFallos') IS NOT NULL OR COL_LENGTH(N'authcom.Outbox',N'EnCuarentena') IS NOT NULL
 THROW 51853,'Modelo incompatible o propuesta ya aplicada.',1;
-- Workers detenidos; no interpretar entregas en vuelo ni modificar pendientes a ciegas.
IF EXISTS(SELECT 1 FROM authcom.Outbox WHERE Estado='procesando') THROW 51854,'Hay leases en vuelo: detener.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 CREATE TABLE authcom.IngresoFallos(
  Id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES authcom.Ingresos(Id),
  Intentos tinyint NOT NULL CHECK(Intentos BETWEEN 1 AND 3),
  Proxima datetime2(3) NOT NULL,
  Estado varchar(12) NOT NULL CHECK(Estado IN ('reintento','cuarentena')),
  Codigo varchar(24) NOT NULL CHECK(Codigo IN ('SOBRE_INVALIDO','PAYLOAD_INVALIDO','TRANSITORIO','CLAVE_NO_DISPONIBLE')),
  ActualizadaEn datetime2(3) NOT NULL
 );
 CREATE INDEX IX_IngresoFallos_Proxima ON authcom.IngresoFallos(Estado,Proxima,Id);
 ALTER TABLE authcom.Ingresos ADD Intentos tinyint NOT NULL CONSTRAINT DF_Ingresos_Intentos DEFAULT 0
  CONSTRAINT CK_Ingresos_Intentos CHECK(Intentos BETWEEN 0 AND 3),Lease uniqueidentifier NULL,LeaseHasta datetime2(3) NULL,
  CONSTRAINT CK_Ingresos_Lease CHECK((Lease IS NULL AND LeaseHasta IS NULL) OR (Lease IS NOT NULL AND LeaseHasta IS NOT NULL));
 ALTER TABLE authcom.Outbox ADD EnCuarentena bit NOT NULL CONSTRAINT DF_Outbox_Cuarentena DEFAULT 0,
  CodigoFallo varchar(32) NULL CONSTRAINT CK_Outbox_CodigoFallo CHECK(CodigoFallo IN
   ('TRANSITORIO','RESULTADO_INCIERTO','PROVEEDOR_PERMANENTE','CONFIGURACION','SOBRE_INVALIDO','INTENTOS_AGOTADOS','VENTANA_CERRADA'));
 EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthResiliencia',@value=N'authcom-resiliencia-v1',@level0type=N'SCHEMA',@level0name=N'authcom';
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- Cuarentena conserva ciphertext y evidencia. No reactivar/borrar automáticamente.
