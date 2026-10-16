-- Solo genera texto para revisión. NO ejecuta GRANT ni otro DCL.
-- Verificar concesiones DIRECTAS del backend con 06, no con HAS_PERMS de admin.
-- Los roles db_datareader/db_datawriter siguen aportando derechos efectivos.
DECLARE @ServidorEsperado sysname=NULL,@PrincipalBackend sysname=NULL;
IF @ServidorEsperado IS NULL OR @PrincipalBackend IS NULL OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 THROW 51870,'Completar destino y principal verificados tras aprobacion.',1;
IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name COLLATE Latin1_General_100_BIN2=@PrincipalBackend COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(name)=DATALENGTH(@PrincipalBackend) AND type IN('S','U','E','X'))
 THROW 51871,'Principal no acreditado.',1;
-- Contratos personales preparados (apagados). La bandeja
-- operativa reutiliza SELECT Alertas, ya contenido en los 48 permisos actuales.
SELECT N'GRANT SELECT, INSERT ON OBJECT::dbo.PreferenciasNotificacionUsuario TO '+QUOTENAME(@PrincipalBackend)+N';' AS PropuestaNoEjecutada
UNION ALL SELECT N'GRANT UPDATE ON OBJECT::dbo.PreferenciasNotificacionUsuario (Habilitada, FechaActualizacion) TO '+QUOTENAME(@PrincipalBackend)+N';'
UNION ALL SELECT N'GRANT SELECT ON OBJECT::dbo.Notificaciones TO '+QUOTENAME(@PrincipalBackend)+N';'
UNION ALL SELECT N'GRANT SELECT ON OBJECT::dbo.NotificacionDestinatarios TO '+QUOTENAME(@PrincipalBackend)+N';'
UNION ALL SELECT N'GRANT UPDATE ON OBJECT::dbo.NotificacionDestinatarios (FechaLectura) TO '+QUOTENAME(@PrincipalBackend)+N';';
-- Seis pares tabla/operacion; siete entradas de concesion (tres UPDATE por columna).
-- No conceder UPDATE global a estas tablas. Validar permisos COLUMN y negativos
-- de IdUsuario/Tipo/IdNotificacion, no exigir UPDATE de objeto para estas columnas.
-- No conceder INSERT a Notificaciones/Destinatarios ni permisos a Políticas:
-- sus productores/administración no están implementados.
-- Actualizar matriz, inspección, perfil de prueba y script de retiro de roles
-- ANTES de conceder estos derechos o activar la funcionalidad SQL futura.
