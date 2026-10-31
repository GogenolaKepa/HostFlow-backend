-- Mantenimiento PROPUESTO, manual y acotado. No se carga desde app/worker.
-- Requiere autorización de retención y una identidad administrativa separada.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@RetencionAprobada bit=0,@BaseEsperada sysname=NULL,@ServidorEsperado sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 OR ISNULL(@RetencionAprobada,0)<>1 THROW 51840,'Mantenimiento bloqueado.',1;
IF @BaseEsperada IS NULL OR @ServidorEsperado IS NULL
 OR CONVERT(varbinary(256),DB_NAME())<>CONVERT(varbinary(256),@BaseEsperada)
 OR CONVERT(varbinary(256),ISNULL(CONVERT(sysname,SERVERPROPERTY('ServerName')),N''))<>CONVERT(varbinary(256),@ServidorEsperado)
 OR @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0 THROW 51841,'Destino/sesión no acreditados.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthIngreso' AND CONVERT(nvarchar(80),value)=N'authcom-ingreso-v1')
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthCorreo' AND CONVERT(nvarchar(80),value)=N'authcom-correo-v1') THROW 51842,'Modelo incompatible.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthResiliencia' AND CONVERT(nvarchar(80),value)=N'authcom-resiliencia-v1') THROW 51844,'Aplicar resiliencia08 antes del mantenimiento.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @lock int;
 EXEC @lock=sys.sp_getapplock @Resource=N'HostFlow:Seguridad:AdministradoresActivos',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000,@DbPrincipal='public';
 IF @lock NOT IN (0,1) THROW 51843,'No se obtuvo exclusión.',1;
 UPDATE TOP(500) authcom.Ingresos SET Sobre=NULL,Estado='descartada'
  WHERE Estado='pendiente' AND Intentos=0 AND ExpiraEn<=SYSUTCDATETIME()
   AND NOT EXISTS(SELECT 1 FROM authcom.IngresoFallos f WHERE f.Id=Ingresos.Id AND f.Estado='cuarentena');
 UPDATE TOP(500) authcom.Outbox SET Sobre=NULL,Estado='descartada',Lease=NULL,LeaseHasta=NULL
  WHERE Sobre IS NOT NULL AND EnCuarentena=0 AND ISNULL(CodigoFallo,'')<>'RESULTADO_INCIERTO' AND (LeaseHasta IS NULL OR LeaseHasta<=SYSUTCDATETIME())
   AND (ExpiraEn<=SYSUTCDATETIME() OR PrimerIntentoEn<=DATEADD(hour,-23,SYSUTCDATETIME()) OR Intentos>=3);
 -- Ventana mayor que todas las cuotas actuales (máximo 24h). Nunca borrar cuotas vigentes.
 DELETE TOP(1000) FROM authcom.Cuotas WHERE Ultima<DATEADD(hour,-48,SYSUTCDATETIME());
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
-- No elimina usuarios, desafíos, auditoría ni historial de entregas. Su retención
-- necesita una política separada. No conceder DELETE a los procesos HTTP/worker.
