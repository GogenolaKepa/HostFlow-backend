-- PREPARADO, NO EJECUTADO. Requiere autorización de LECTURA separada.
-- NO es solo metadatos: consulta hasta 200 registros técnicos de Alertas y cuenta
-- su totalidad. Sin Titulo/Mensaje/DatosJson, huéspedes, importes o cuentas.
-- No ejecutar GET /alertas para esta comparación: sincroniza antes de devolver.
DECLARE @ServidorEsperado sysname=NULL;
IF @ServidorEsperado IS NULL OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 THROW 51890,'Destino no acreditado: diagnostico bloqueado.',1;
SELECT COUNT(*) AS TotalPersistidas,
 COUNT(CASE WHEN Estado COLLATE Latin1_General_100_BIN2=N'Nueva' THEN 1 END) AS Nuevas,
 COUNT(CASE WHEN Estado COLLATE Latin1_General_100_BIN2<>N'Resuelta' AND Severidad COLLATE Latin1_General_100_BIN2=N'Critica' THEN 1 END) AS CriticasPendientes,
 COUNT(CASE WHEN Estado COLLATE Latin1_General_100_BIN2 IN(N'Nueva',N'Leida')
  AND Tipo COLLATE Latin1_General_100_BIN2 IN(N'CHECKIN_PROXIMO',N'CONFLICTO_RESERVAS',N'INCIDENCIA_ABIERTA',N'SINCRONIZACION_ERROR') THEN 1 END) AS ElegiblesBandejaSinFiltros
FROM dbo.Alertas;
SELECT TOP(200) IdAlerta,Tipo,Estado,Severidad,FechaAlerta,FechaActualizacion
FROM dbo.Alertas ORDER BY IdAlerta DESC;
-- Si TotalPersistidas>200 esta muestra NO contiene todos los IDs. No concluir
-- equivalencia completa de cantidades a partir de la muestra ni publicar resultados.
