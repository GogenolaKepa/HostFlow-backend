/* Metadatos agregados de backups del destino actual, sin IDs privados ni rutas.
   La visibilidad depende del nivel de servicio/permisos existentes.
   No ejecuta backup/restore. No acredita una cadena PITR ni permisos ARM de restore.
   Retencion configurada y ventana PITR se deben confirmar en Azure Portal. */
SELECT backup_type AS Tipo, COUNT(*) AS Cantidad,
  MIN(backup_start_date) AS InicioMasAntiguo,
  MAX(backup_finish_date) AS FinMasReciente
FROM sys.dm_database_backups
WHERE logical_database_name = DB_NAME() AND in_retention = 1
GROUP BY backup_type;
