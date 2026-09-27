-- =========================================================
-- HOSTFLOW
-- MIGRACIÓN: TAREAS DE LIMPIEZA AUTOMÁTICAS
-- =========================================================

IF OBJECT_ID(N'dbo.TareasLimpieza', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TareasLimpieza (
        IdTareaLimpieza INT IDENTITY(1,1) NOT NULL,
        IdPropiedad INT NOT NULL,
        IdReservaSalida INT NOT NULL,
        IdReservaSiguiente INT NULL,

        FechaInicio DATETIME2(0) NOT NULL,
        FechaLimite DATETIME2(0) NULL,

        Estado NVARCHAR(30) NOT NULL
            CONSTRAINT DF_TareasLimpieza_Estado
            DEFAULT N'Pendiente',

        Origen NVARCHAR(30) NOT NULL
            CONSTRAINT DF_TareasLimpieza_Origen
            DEFAULT N'Automatica',

        Observacion NVARCHAR(500) NULL,

        FechaCreacion DATETIME2(0) NOT NULL
            CONSTRAINT DF_TareasLimpieza_FechaCreacion
            DEFAULT SYSDATETIME(),

        FechaActualizacion DATETIME2(0) NOT NULL
            CONSTRAINT DF_TareasLimpieza_FechaActualizacion
            DEFAULT SYSDATETIME(),

        CONSTRAINT PK_TareasLimpieza
            PRIMARY KEY (IdTareaLimpieza),

        CONSTRAINT FK_TareasLimpieza_Propiedades
            FOREIGN KEY (IdPropiedad)
            REFERENCES dbo.Propiedades(IdPropiedad),

        CONSTRAINT FK_TareasLimpieza_ReservaSalida
            FOREIGN KEY (IdReservaSalida)
            REFERENCES dbo.Reservas(IdReserva),

        CONSTRAINT FK_TareasLimpieza_ReservaSiguiente
            FOREIGN KEY (IdReservaSiguiente)
            REFERENCES dbo.Reservas(IdReserva),

        CONSTRAINT CK_TareasLimpieza_Estado
            CHECK (
                Estado IN (
                    N'Pendiente',
                    N'En progreso',
                    N'Completada',
                    N'Cancelada'
                )
            ),

        CONSTRAINT CK_TareasLimpieza_Fechas
            CHECK (
                FechaLimite IS NULL
                OR FechaLimite >= FechaInicio
            )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE
        name = N'UX_TareasLimpieza_ReservaSalida'
        AND object_id = OBJECT_ID(N'dbo.TareasLimpieza')
)
BEGIN
    CREATE UNIQUE INDEX UX_TareasLimpieza_ReservaSalida
        ON dbo.TareasLimpieza(IdReservaSalida);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE
        name = N'IX_TareasLimpieza_FechaInicio_Estado'
        AND object_id = OBJECT_ID(N'dbo.TareasLimpieza')
)
BEGIN
    CREATE INDEX IX_TareasLimpieza_FechaInicio_Estado
        ON dbo.TareasLimpieza(FechaInicio, Estado);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE
        name = N'IX_TareasLimpieza_Propiedad_FechaInicio'
        AND object_id = OBJECT_ID(N'dbo.TareasLimpieza')
)
BEGIN
    CREATE INDEX IX_TareasLimpieza_Propiedad_FechaInicio
        ON dbo.TareasLimpieza(IdPropiedad, FechaInicio);
END;
GO