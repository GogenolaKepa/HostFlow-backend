const {
  poolPromise,
  sql,
} = require("../config/database");

class LimpiezaRepository {
  async sincronizar(
    fechaDesde,
    fechaHasta
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "fechaDesde",
          sql.Date,
          fechaDesde
        )
        .input(
          "fechaHasta",
          sql.Date,
          fechaHasta
        )
        .query(`
          SET NOCOUNT ON;

          DECLARE @Candidatas TABLE (
            IdReservaSalida INT NOT NULL PRIMARY KEY,
            IdPropiedad INT NOT NULL,
            FechaInicio DATETIME2(0) NOT NULL,
            IdReservaSiguiente INT NULL,
            FechaLimite DATETIME2(0) NULL
          );

          INSERT INTO @Candidatas (
            IdReservaSalida,
            IdPropiedad,
            FechaInicio,
            IdReservaSiguiente,
            FechaLimite
          )
          SELECT
            salida.IdReserva,
            salida.IdPropiedad,
            salida.FechaEgreso,
            siguiente.IdReserva,
            siguiente.FechaIngreso
          FROM dbo.Reservas salida

          INNER JOIN dbo.EstadosReserva estadoSalida
            ON estadoSalida.IdEstadoReserva =
               salida.IdEstadoReserva

          OUTER APPLY (
            SELECT TOP 1
              futura.IdReserva,
              futura.FechaIngreso
            FROM dbo.Reservas futura

            INNER JOIN dbo.EstadosReserva estadoFutura
              ON estadoFutura.IdEstadoReserva =
                 futura.IdEstadoReserva

            WHERE
              futura.IdPropiedad =
                salida.IdPropiedad

              AND futura.IdReserva <>
                  salida.IdReserva

              AND estadoFutura.Nombre NOT IN (
                N'Cancelada',
                N'No show'
              )

              AND futura.FechaIngreso >=
                  salida.FechaEgreso

            ORDER BY
              futura.FechaIngreso ASC,
              futura.IdReserva ASC
          ) siguiente

          WHERE
            estadoSalida.Nombre NOT IN (
              N'Cancelada',
              N'No show'
            )

            AND salida.FechaEgreso >=
                CAST(@fechaDesde AS DATETIME2(0))

            AND salida.FechaEgreso <
                DATEADD(
                  DAY,
                  1,
                  CAST(@fechaHasta AS DATETIME2(0))
                );

          UPDATE tarea
          SET
            tarea.IdPropiedad =
              candidata.IdPropiedad,

            tarea.IdReservaSiguiente =
              candidata.IdReservaSiguiente,

            tarea.FechaInicio =
              candidata.FechaInicio,

            tarea.FechaLimite =
              candidata.FechaLimite,

            tarea.Estado =
              CASE
                WHEN tarea.Estado = N'Cancelada'
                  THEN N'Pendiente'
                ELSE tarea.Estado
              END,

            tarea.FechaActualizacion =
              SYSDATETIME()

          FROM dbo.TareasLimpieza tarea

          INNER JOIN @Candidatas candidata
            ON candidata.IdReservaSalida =
               tarea.IdReservaSalida

          WHERE
            tarea.Estado <> N'Completada';

          DECLARE @Actualizadas INT =
            @@ROWCOUNT;

          INSERT INTO dbo.TareasLimpieza (
            IdPropiedad,
            IdReservaSalida,
            IdReservaSiguiente,
            FechaInicio,
            FechaLimite,
            Estado,
            Origen,
            FechaCreacion,
            FechaActualizacion
          )
          SELECT
            candidata.IdPropiedad,
            candidata.IdReservaSalida,
            candidata.IdReservaSiguiente,
            candidata.FechaInicio,
            candidata.FechaLimite,
            N'Pendiente',
            N'Automatica',
            SYSDATETIME(),
            SYSDATETIME()

          FROM @Candidatas candidata

          WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.TareasLimpieza tarea
            WHERE tarea.IdReservaSalida =
                  candidata.IdReservaSalida
          );

          DECLARE @Creadas INT =
            @@ROWCOUNT;

          UPDATE tarea
          SET
            tarea.Estado =
              N'Cancelada',

            tarea.FechaActualizacion =
              SYSDATETIME()

          FROM dbo.TareasLimpieza tarea

          INNER JOIN dbo.Reservas reserva
            ON reserva.IdReserva =
               tarea.IdReservaSalida

          INNER JOIN dbo.EstadosReserva estadoReserva
            ON estadoReserva.IdEstadoReserva =
               reserva.IdEstadoReserva

          WHERE
            estadoReserva.Nombre IN (
              N'Cancelada',
              N'No show'
            )

            AND tarea.Estado NOT IN (
              N'Completada',
              N'Cancelada'
            );

          DECLARE @Canceladas INT =
            @@ROWCOUNT;

          SELECT
            @Creadas AS creadas,
            @Actualizadas AS actualizadas,
            @Canceladas AS canceladas;
        `);

    return {
      creadas:
        Number(
          resultado.recordset[0]
            ?.creadas || 0
        ),

      actualizadas:
        Number(
          resultado.recordset[0]
            ?.actualizadas || 0
        ),

      canceladas:
        Number(
          resultado.recordset[0]
            ?.canceladas || 0
        ),
    };
  }

  async obtenerTodas(
    filtros = {}
  ) {
    const pool =
      await poolPromise;

    const idPropiedad =
      filtros.idPropiedad !==
        undefined &&
      filtros.idPropiedad !==
        null &&
      filtros.idPropiedad !== ""
        ? Number(
            filtros.idPropiedad
          )
        : null;

    const estado =
      filtros.estado
        ? String(
            filtros.estado
          ).trim()
        : null;

    const desde =
      filtros.desde ||
      null;

    const hasta =
      filtros.hasta ||
      null;

    const resultado =
      await pool
        .request()
        .input(
          "idPropiedad",
          sql.Int,
          idPropiedad
        )
        .input(
          "estado",
          sql.NVarChar(30),
          estado
        )
        .input(
          "desde",
          sql.Date,
          desde
        )
        .input(
          "hasta",
          sql.Date,
          hasta
        )
        .query(`
          SELECT
            tarea.IdTareaLimpieza
              AS idTareaLimpieza,

            tarea.IdPropiedad
              AS idPropiedad,

            propiedad.Nombre
              AS propiedad,

            tarea.IdReservaSalida
              AS idReservaSalida,

            canalSalida.Nombre
              AS canalReservaSalida,

            CONCAT(
              huespedSalida.Nombre,
              N' ',
              huespedSalida.Apellido
            ) AS huespedReservaSalida,

            CONVERT(
              VARCHAR(10),
              tarea.FechaInicio,
              23
            ) AS fechaInicio,

            CONVERT(
              VARCHAR(5),
              CAST(
                tarea.FechaInicio
                  AS TIME(0)
              ),
              108
            ) AS horaInicio,

            tarea.IdReservaSiguiente
              AS idReservaSiguiente,

            canalSiguiente.Nombre
              AS canalReservaSiguiente,

            CASE
              WHEN siguiente.IdReserva
                IS NULL
                THEN NULL

              ELSE CONCAT(
                huespedSiguiente.Nombre,
                N' ',
                huespedSiguiente.Apellido
              )
            END
              AS huespedReservaSiguiente,

            CASE
              WHEN tarea.FechaLimite
                IS NULL
                THEN NULL

              ELSE CONVERT(
                VARCHAR(10),
                tarea.FechaLimite,
                23
              )
            END
              AS fechaLimite,

            CASE
              WHEN tarea.FechaLimite
                IS NULL
                THEN NULL

              ELSE CONVERT(
                VARCHAR(5),
                CAST(
                  tarea.FechaLimite
                    AS TIME(0)
                ),
                108
              )
            END
              AS horaLimite,

            CASE
              WHEN tarea.FechaLimite
                IS NULL
                THEN NULL

              ELSE DATEDIFF(
                MINUTE,
                tarea.FechaInicio,
                tarea.FechaLimite
              )
            END
              AS minutosDisponibles,

            CASE
              WHEN tarea.FechaLimite
                IS NULL
                THEN NULL

              ELSE CAST(
                DATEDIFF(
                  MINUTE,
                  tarea.FechaInicio,
                  tarea.FechaLimite
                ) / 60.0
                AS DECIMAL(10, 2)
              )
            END
              AS horasDisponibles,

            CASE
              WHEN tarea.Estado IN (
                N'Completada',
                N'Cancelada'
              )
                THEN NULL

              WHEN tarea.FechaLimite
                IS NULL
                THEN N'Normal'

              WHEN DATEDIFF(
                MINUTE,
                tarea.FechaInicio,
                tarea.FechaLimite
              ) <= 180
                THEN N'Urgente'

              WHEN DATEDIFF(
                MINUTE,
                tarea.FechaInicio,
                tarea.FechaLimite
              ) <= 300
                THEN N'Alta'

              ELSE N'Normal'
            END
              AS prioridad,

            tarea.Estado
              AS estado,

            tarea.Origen
              AS origen,

            tarea.Observacion
              AS observacion,

            tarea.FechaCreacion
              AS fechaCreacion,

            tarea.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.TareasLimpieza tarea

          INNER JOIN dbo.Propiedades propiedad
            ON propiedad.IdPropiedad =
               tarea.IdPropiedad

          INNER JOIN dbo.Reservas salida
            ON salida.IdReserva =
               tarea.IdReservaSalida

          INNER JOIN dbo.CanalesReserva canalSalida
            ON canalSalida.IdCanalReserva =
               salida.IdCanalReserva

          INNER JOIN dbo.Huespedes huespedSalida
            ON huespedSalida.IdHuesped =
               salida.IdHuesped

          LEFT JOIN dbo.Reservas siguiente
            ON siguiente.IdReserva =
               tarea.IdReservaSiguiente

          LEFT JOIN dbo.CanalesReserva canalSiguiente
            ON canalSiguiente.IdCanalReserva =
               siguiente.IdCanalReserva

          LEFT JOIN dbo.Huespedes huespedSiguiente
            ON huespedSiguiente.IdHuesped =
               siguiente.IdHuesped

          WHERE
            (
              @idPropiedad IS NULL
              OR tarea.IdPropiedad =
                 @idPropiedad
            )

            AND (
              @estado IS NULL
              OR tarea.Estado =
                 @estado
            )

            AND (
              @desde IS NULL
              OR CAST(
                tarea.FechaInicio
                  AS DATE
              ) >= @desde
            )

            AND (
              @hasta IS NULL
              OR CAST(
                tarea.FechaInicio
                  AS DATE
              ) <= @hasta
            )

          ORDER BY
            CASE
              WHEN tarea.Estado =
                   N'En progreso'
                THEN 0

              WHEN tarea.Estado =
                   N'Pendiente'
                THEN 1

              WHEN tarea.Estado =
                   N'Completada'
                THEN 2

              ELSE 3
            END,

            tarea.FechaInicio ASC,

            tarea.IdTareaLimpieza ASC;
        `);

    return resultado.recordset;
  }

  async obtenerPorId(
    idTareaLimpieza
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idTareaLimpieza",
          sql.Int,
          Number(
            idTareaLimpieza
          )
        )
        .query(`
          SELECT
            IdTareaLimpieza
              AS idTareaLimpieza,

            IdPropiedad
              AS idPropiedad,

            IdReservaSalida
              AS idReservaSalida,

            IdReservaSiguiente
              AS idReservaSiguiente,

            CONVERT(
              VARCHAR(10),
              FechaInicio,
              23
            ) AS fechaInicio,

            CONVERT(
              VARCHAR(5),
              CAST(
                FechaInicio
                  AS TIME(0)
              ),
              108
            ) AS horaInicio,

            CASE
              WHEN FechaLimite
                IS NULL
                THEN NULL

              ELSE CONVERT(
                VARCHAR(10),
                FechaLimite,
                23
              )
            END
              AS fechaLimite,

            CASE
              WHEN FechaLimite
                IS NULL
                THEN NULL

              ELSE CONVERT(
                VARCHAR(5),
                CAST(
                  FechaLimite
                    AS TIME(0)
                ),
                108
              )
            END
              AS horaLimite,

            Estado
              AS estado,

            Origen
              AS origen,

            Observacion
              AS observacion

          FROM dbo.TareasLimpieza

          WHERE
            IdTareaLimpieza =
              @idTareaLimpieza;
        `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  async cambiarEstado(
    idTareaLimpieza,
    estado
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idTareaLimpieza",
        sql.Int,
        Number(
          idTareaLimpieza
        )
      )
      .input(
        "estado",
        sql.NVarChar(30),
        estado
      )
      .query(`
        UPDATE dbo.TareasLimpieza
        SET
          Estado =
            @estado,

          FechaActualizacion =
            SYSDATETIME()

        WHERE
          IdTareaLimpieza =
            @idTareaLimpieza;
      `);

    return this.obtenerPorId(
      idTareaLimpieza
    );
  }

  async obtenerResumen() {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .query(`
          SELECT
            COUNT(*) AS total,

            SUM(
              CASE
                WHEN Estado =
                     N'Pendiente'
                  THEN 1
                ELSE 0
              END
            ) AS pendientes,

            SUM(
              CASE
                WHEN Estado =
                     N'En progreso'
                  THEN 1
                ELSE 0
              END
            ) AS enProgreso,

            SUM(
              CASE
                WHEN Estado =
                     N'Completada'
                  THEN 1
                ELSE 0
              END
            ) AS completadas,

            SUM(
              CASE
                WHEN Estado =
                     N'Cancelada'
                  THEN 1
                ELSE 0
              END
            ) AS canceladas,

            SUM(
              CASE
                WHEN
                  Estado IN (
                    N'Pendiente',
                    N'En progreso'
                  )

                  AND FechaLimite
                      IS NOT NULL

                  AND DATEDIFF(
                    MINUTE,
                    FechaInicio,
                    FechaLimite
                  ) <= 180

                THEN 1
                ELSE 0
              END
            ) AS urgentes

          FROM dbo.TareasLimpieza;
        `);

    const fila =
      resultado.recordset[0] ||
      {};

    return {
      total:
        Number(
          fila.total || 0
        ),

      pendientes:
        Number(
          fila.pendientes || 0
        ),

      enProgreso:
        Number(
          fila.enProgreso || 0
        ),

      completadas:
        Number(
          fila.completadas || 0
        ),

      canceladas:
        Number(
          fila.canceladas || 0
        ),

      urgentes:
        Number(
          fila.urgentes || 0
        ),
    };
  }
}

module.exports =
  new LimpiezaRepository();