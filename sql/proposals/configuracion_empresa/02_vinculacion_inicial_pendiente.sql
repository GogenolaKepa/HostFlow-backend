-- Operación SEPARADA de la migración, pendiente de autorización. Crea una única
-- fila técnica sin información empresarial inventada y sus horarios originales.
-- No se ejecuta desde el backend. No asigna usuarios ni modifica sus cuentas.
SET XACT_ABORT ON;
DECLARE @Aprovisionar bit=0;
DECLARE @ServidorEsperado sysname=NULL;
IF ISNULL(@Aprovisionar,0)<>1 THROW 51510,'Vinculacion inicial bloqueada.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow' OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR @ServidorEsperado IS NULL
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 THROW 51511,'Destino Azure no acreditado.',1;
IF (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0 AND name=N'HostFlowConfiguracionModelo'
 AND major_id IN(OBJECT_ID(N'dbo.Empresas',N'U'),OBJECT_ID(N'dbo.PreferenciasOperativas',N'U'))
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-configuracion-empresa-v1'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'hostflow-configuracion-empresa-v1'))<>2
 THROW 51512,'Modelo de configuracion no acreditado.',1;
IF @@TRANCOUNT<>0 THROW 51514,'Ejecutar en una sesion sin transacciones previas.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 IF EXISTS(SELECT 1 FROM dbo.Empresas WITH(UPDLOCK,HOLDLOCK))
   THROW 51513,'Ya existe una empresa: inspeccionar, no repetir la vinculacion.',1;
 INSERT INTO dbo.Empresas DEFAULT VALUES;
 DECLARE @IdEmpresa int=CONVERT(int,SCOPE_IDENTITY());
 INSERT INTO dbo.PreferenciasOperativas(IdEmpresa,HoraIngreso,HoraEgreso,ZonaHoraria)
 VALUES(@IdEmpresa,CONVERT(time(0),'15:00'),CONVERT(time(0),'10:00'),N'America/Argentina/Buenos_Aires');
 COMMIT TRANSACTION;
 SELECT @IdEmpresa AS IdEmpresaVinculada;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
