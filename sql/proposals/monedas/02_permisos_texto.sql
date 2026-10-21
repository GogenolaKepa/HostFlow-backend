-- NO ejecuta GRANT. Solo produce texto despues de verificar el principal real.
-- Estos derechos son nuevos/propuestos y NO forman parte de los 55 ya aplicados.
DECLARE @Principal sysname=NULL,@ServidorEsperado sysname=NULL,@AutorizarGeneracion bit=0;
IF ISNULL(@AutorizarGeneracion,0)<>1 OR @ServidorEsperado IS NULL THROW 52319,'Generacion bloqueada; revisar destino y principal.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow' OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado) THROW 52322,'Destino no acreditado.',1;
IF @Principal IS NULL OR @Principal COLLATE Latin1_General_100_BIN2<>N'hostflow_app' OR DATALENGTH(@Principal)<>DATALENGTH(N'hostflow_app')
 THROW 52320,'Completar el principal previamente acreditado; no se piden SID ni credenciales.',1;
IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=@Principal AND type IN('S','E','X')) THROW 52321,'Principal no visible.',1;
IF (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0 AND name=N'HostFlowMonedasModelo'
 AND major_id IN(OBJECT_ID(N'dbo.ConfiguracionMonetaria'),OBJECT_ID(N'dbo.TarifasPropiedad'),OBJECT_ID(N'dbo.AcuerdosMonetariosReserva'))
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-monedas-v2'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'hostflow-monedas-v2'))<>3 THROW 52323,'Modelo v2 no acreditado. No generar concesiones.',1;
SELECT N'GRANT SELECT, INSERT ON OBJECT::dbo.ConfiguracionMonetaria TO '+QUOTENAME(@Principal)+N';' AS Propuesta
UNION ALL SELECT N'GRANT UPDATE (Fuente,Tipo,Valor,FechaCotizacion,HoraPublicacion,ConsultadaEn,IdUsuarioActualizacion,FechaActualizacion) ON OBJECT::dbo.ConfiguracionMonetaria TO '+QUOTENAME(@Principal)+N';'
UNION ALL SELECT N'GRANT SELECT, INSERT ON OBJECT::dbo.TarifasPropiedad TO '+QUOTENAME(@Principal)+N';'
UNION ALL SELECT N'GRANT UPDATE (Moneda,PrecioBase,ReferenciaFuente,ReferenciaTipo,ReferenciaValor,ReferenciaFecha,IdUsuarioActualizacion,FechaActualizacion) ON OBJECT::dbo.TarifasPropiedad TO '+QUOTENAME(@Principal)+N';'
UNION ALL SELECT N'GRANT SELECT, INSERT ON OBJECT::dbo.AcuerdosMonetariosReserva TO '+QUOTENAME(@Principal)+N';'
UNION ALL SELECT N'GRANT UPDATE (Moneda,Importe,PagoEquivalenteARS,FuenteReferencia,TipoReferencia,FuenteAplicada,TipoAplicado,ValorAplicado,FechaEfectiva,FechaCheckinFijada,FijadoEn,EquivalenteARS,IdUsuarioFijacion,IdUsuarioActualizacion,FechaActualizacion) ON OBJECT::dbo.AcuerdosMonetariosReserva TO '+QUOTENAME(@Principal)+N';';
-- No UPDATE de IdReserva/IdEmpresa/IdUsuarioAcuerdo/FechaAcuerdo; no DELETE ni permisos DDL.
-- Los roles amplios existentes no se retiran ni se consideran privilegio minimo efectivo.
