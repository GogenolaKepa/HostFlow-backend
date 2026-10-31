-- SOLO LECTURA posterior a08 y previa verificación de identidad/modelo09.
-- Métricas agregadas; sin destinatarios, hashes, tokens, claves ni sobres.
SELECT Estado,EnCuarentena,CodigoFallo,COUNT_BIG(*) AS Cantidad,
 MIN(PrimerIntentoEn) AS PrimerIntentoMasAntiguo,MIN(Proxima) AS ProximaMasAntigua
FROM authcom.Outbox GROUP BY Estado,EnCuarentena,CodigoFallo;
SELECT Estado,COUNT_BIG(*) AS Cantidad,MIN(CreadaEn) AS CreadaMasAntigua,
 SUM(CASE WHEN LeaseHasta>SYSUTCDATETIME() THEN 1 ELSE 0 END) AS LeasesVigentes
FROM authcom.Ingresos GROUP BY Estado;
SELECT Estado,Codigo,COUNT_BIG(*) AS Cantidad,MAX(Intentos) AS IntentosMaximos,
 MIN(ActualizadaEn) AS FalloMasAntiguo FROM authcom.IngresoFallos GROUP BY Estado,Codigo;
