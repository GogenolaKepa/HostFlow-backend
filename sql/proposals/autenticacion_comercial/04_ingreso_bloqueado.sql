-- PROPUESTA ADITIVA POSTERIOR A authcom-v1. NO EJECUTADA, NO AUTORIZADA EN AZURE.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 THROW 51820,'Ingreso asíncrono bloqueado.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),ISNULL(CONVERT(sysname,SERVERPROPERTY('ServerName')),N''))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0 THROW 51821,'Destino/sesión no acreditados.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 THROW 51822,'Visibilidad insuficiente.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthModelo' AND CONVERT(nvarchar(80),value)=N'authcom-v1')
 OR OBJECT_ID(N'authcom.Ingresos') IS NOT NULL THROW 51823,'Modelo previo incompatible o ingreso ya existente.',1;
IF OBJECT_ID(N'authcom.Desafios',N'U') IS NULL OR EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'authcom.Desafios') AND name=N'IX_Desafios_Listado')
 THROW 51824,'Revisar dependencia o índice de listado preexistente.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 CREATE TABLE authcom.Ingresos(
  Id uniqueidentifier NOT NULL PRIMARY KEY,
  CreadaEn datetime2(3) NOT NULL,
  ExpiraEn datetime2(3) NOT NULL,
  Sobre nvarchar(4000) NULL CHECK(Sobre IS NULL OR ISJSON(Sobre)=1),
  Estado varchar(12) NOT NULL CHECK(Estado IN ('pendiente','procesada','descartada')),
  ProcesadaEn datetime2(3) NULL,
  CHECK(ExpiraEn>CreadaEn),
  CHECK((Estado='pendiente' AND Sobre IS NOT NULL AND ProcesadaEn IS NULL)
    OR (Estado='procesada' AND Sobre IS NULL AND ProcesadaEn IS NOT NULL)
    OR (Estado='descartada' AND Sobre IS NULL))
 );
 CREATE INDEX IX_Ingresos_Cola ON authcom.Ingresos(Estado,CreadaEn,Id);
 CREATE INDEX IX_Desafios_Listado ON authcom.Desafios(IdEmpresa,Proposito,CreadaEn DESC,Id)
  INCLUDE(Email,ExpiraEn,ConsumidaEn,RevocadaEn);
 EXEC sys.sp_addextendedproperty @name=N'HostFlowAuthIngreso',@value=N'authcom-ingreso-v1',@level0type=N'SCHEMA',@level0name=N'authcom';
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
