/*
  HostFlow - Migracion de horarios de check-in / check-out
  Fecha: 2026-09-26

  Objetivo:
  - Permitir que Reservas.FechaIngreso y Reservas.FechaEgreso
    almacenen fecha + hora.
  - Mantener la restriccion FechaEgreso > FechaIngreso.
*/

IF EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_Reservas_Fechas'
    AND parent_object_id = OBJECT_ID('dbo.Reservas')
)
BEGIN
  ALTER TABLE dbo.Reservas
  DROP CONSTRAINT CK_Reservas_Fechas;
END;
GO

ALTER TABLE dbo.Reservas
ALTER COLUMN FechaIngreso DATETIME2(0) NOT NULL;
GO

ALTER TABLE dbo.Reservas
ALTER COLUMN FechaEgreso DATETIME2(0) NOT NULL;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_Reservas_Fechas'
    AND parent_object_id = OBJECT_ID('dbo.Reservas')
)
BEGIN
  ALTER TABLE dbo.Reservas
  ADD CONSTRAINT CK_Reservas_Fechas
  CHECK (FechaEgreso > FechaIngreso);
END;
GO
