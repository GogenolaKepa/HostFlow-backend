const {
  poolPromise,
  sql,
} = require("../config/database");

class DashboardRepository {
  // =========================================================
  // RESUMEN GENERAL REAL
  // =========================================================

  async obtenerResumen({
    fechaActual,
    inicioMes,
    finMes,
    diasMes,
  }) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "fechaActual",
          sql.Date,
          fechaActual
        )
        .input(
          "inicioMes",
          sql.Date,
          inicioMes
        )
        .input(
          "finMes",
          sql.Date,
          finMes
        )
        .input(
          "diasMes",
          sql.Int,
          diasMes
        )
        .query(`
          DECLARE
            @PropiedadesActivas INT = 0,
            @ReservasActivas INT = 0,
            @HuespedesRegistrados INT = 0,
            @IngresosMes DECIMAL(18, 2) = 0,
            @NochesDisponibles INT = 0,
            @NochesOcupadas INT = 0;

          -- ===================================================
          -- PROPIEDADES ACTIVAS
          -- ===================================================

          SELECT
            @PropiedadesActivas =
              COUNT(*)
          FROM dbo.Propiedades p

          INNER JOIN dbo.EstadosPropiedad ep
            ON ep.IdEstadoPropiedad =
               p.IdEstadoPropiedad

          WHERE
            ep.Nombre =
              N'Activa';

          -- ===================================================
          -- RESERVAS ACTIVAS / FUTURAS
          -- ===================================================
          --
          -- Una reserva cuenta como activa en el Dashboard si:
          -- - está Pendiente o Confirmada;
          -- - todavía no terminó.
          -- ===================================================

          SELECT
            @ReservasActivas =
              COUNT(*)
          FROM dbo.Reservas r

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          WHERE
            er.Nombre IN (
              N'Pendiente',
              N'Confirmada'
            )

            AND r.FechaEgreso >=
              @fechaActual;

          -- ===================================================
          -- HUÉSPEDES REGISTRADOS
          -- ===================================================

          SELECT
            @HuespedesRegistrados =
              COUNT(*)
          FROM dbo.Huespedes;

          -- ===================================================
          -- INGRESOS DEL MES
          -- ===================================================
          --
          -- Con el modelo actual usamos MontoEstimado.
          -- Se consideran reservas Confirmadas o Finalizadas
          -- cuyo check-in pertenece al mes consultado.
          -- Canceladas, No show y Pendientes no suman ingresos.
          -- ===================================================

          SELECT
            @IngresosMes =
              COALESCE(
                SUM(
                  r.MontoEstimado
                ),
                0
              )
          FROM dbo.Reservas r

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          WHERE
            er.Nombre IN (
              N'Confirmada',
              N'Finalizada'
            )

            AND r.FechaIngreso >=
              @inicioMes

            AND r.FechaIngreso <
              @finMes;

          -- ===================================================
          -- OCUPACIÓN MENSUAL
          -- ===================================================
          --
          -- Fórmula:
          --
          -- noches ocupadas únicas
          -- ---------------------- x 100
          -- noches disponibles
          --
          -- Se calcula por propiedad y día para que un eventual
          -- conflicto de reservas no duplique ocupación.
          --
          -- Solo las propiedades actualmente Activas forman
          -- parte del inventario disponible.
          -- ===================================================

          SET @NochesDisponibles =
            @PropiedadesActivas *
            @diasMes;

          ;WITH Calendario AS (
            SELECT
              CAST(
                @inicioMes
                AS DATE
              ) AS dia

            UNION ALL

            SELECT
              DATEADD(
                DAY,
                1,
                dia
              )
            FROM Calendario

            WHERE
              DATEADD(
                DAY,
                1,
                dia
              ) < @finMes
          ),

          Ocupacion AS (
            SELECT DISTINCT
              p.IdPropiedad,
              c.dia

            FROM dbo.Propiedades p

            INNER JOIN dbo.EstadosPropiedad ep
              ON ep.IdEstadoPropiedad =
                 p.IdEstadoPropiedad

            INNER JOIN dbo.Reservas r
              ON r.IdPropiedad =
                 p.IdPropiedad

            INNER JOIN dbo.EstadosReserva er
              ON er.IdEstadoReserva =
                 r.IdEstadoReserva

            INNER JOIN Calendario c
              ON c.dia >=
                 r.FechaIngreso

             AND c.dia <
                 r.FechaEgreso

            WHERE
              ep.Nombre =
                N'Activa'

              AND er.Nombre IN (
                N'Confirmada',
                N'Finalizada'
              )
          )

          SELECT
            @NochesOcupadas =
              COUNT(*)
          FROM Ocupacion

          OPTION (
            MAXRECURSION 40
          );

          SELECT
            @PropiedadesActivas
              AS propiedadesActivas,

            @ReservasActivas
              AS reservasActivas,

            @HuespedesRegistrados
              AS huespedesRegistrados,

            @IngresosMes
              AS ingresosMes,

            CASE
              WHEN @NochesDisponibles <= 0
                THEN 0

              ELSE
                CAST(
                  ROUND(
                    (
                      CAST(
                        @NochesOcupadas
                        AS DECIMAL(18, 4)
                      )
                      /
                      CAST(
                        @NochesDisponibles
                        AS DECIMAL(18, 4)
                      )
                    ) * 100,
                    0
                  )
                  AS INT
                )
            END
              AS ocupacionMensual,

            @NochesOcupadas
              AS nochesOcupadas,

            @NochesDisponibles
              AS nochesDisponibles;
        `);

    const resumen =
      resultado.recordset[0] || {};

    return {
      propiedadesActivas:
        Number(
          resumen.propiedadesActivas ||
          0
        ),

      reservasActivas:
        Number(
          resumen.reservasActivas ||
          0
        ),

      huespedesRegistrados:
        Number(
          resumen.huespedesRegistrados ||
          0
        ),

      ingresosMes:
        Number(
          resumen.ingresosMes ||
          0
        ),

      ocupacionMensual:
        Number(
          resumen.ocupacionMensual ||
          0
        ),

      nochesOcupadas:
        Number(
          resumen.nochesOcupadas ||
          0
        ),

      nochesDisponibles:
        Number(
          resumen.nochesDisponibles ||
          0
        ),
    };
  }

  // =========================================================
  // PRÓXIMAS RESERVAS REALES
  // =========================================================

  async obtenerProximasReservas(
    fechaActual,
    limite = 5
  ) {
    const limiteNumero =
      Math.max(
        1,
        Math.min(
          Number(limite) || 5,
          20
        )
      );

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "fechaActual",
          sql.Date,
          fechaActual
        )
        .input(
          "limite",
          sql.Int,
          limiteNumero
        )
        .query(`
          SELECT TOP (@limite)
            r.IdReserva
              AS idReserva,

            h.Nombre + N' ' + h.Apellido
              AS huesped,

            p.Nombre
              AS propiedad,

            cr.Nombre
              AS canal,

            er.Nombre
              AS estado,

            CONVERT(
              VARCHAR(10),
              r.FechaIngreso,
              23
            ) AS fechaIngreso,

            CONVERT(
              VARCHAR(10),
              r.FechaEgreso,
              23
            ) AS fechaEgreso,

            r.CantidadHuespedes
              AS cantidadHuespedes,

            r.MontoEstimado
              AS montoEstimado

          FROM dbo.Reservas r

          INNER JOIN dbo.Propiedades p
            ON p.IdPropiedad =
               r.IdPropiedad

          INNER JOIN dbo.Huespedes h
            ON h.IdHuesped =
               r.IdHuesped

          INNER JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               r.IdCanalReserva

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          WHERE
            r.FechaIngreso >=
              @fechaActual

            AND er.Nombre IN (
              N'Pendiente',
              N'Confirmada'
            )

          ORDER BY
            r.FechaIngreso ASC,
            r.IdReserva ASC;
        `);

    return resultado.recordset.map(
      (reserva) => ({
        ...reserva,

        montoEstimado:
          Number(
            reserva.montoEstimado ||
            0
          ),
      })
    );
  }
  // =========================================================
  // HISTÓRICO MENSUAL
  // =========================================================

  async obtenerHistoricoMensual(
    fechaActual,
    meses = 6
  ) {
    const cantidadMeses =
      Math.max(
        1,
        Math.min(
          Number(meses) || 6,
          12
        )
      );

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "fechaActual",
          sql.Date,
          fechaActual
        )
        .input(
          "meses",
          sql.Int,
          cantidadMeses
        )
        .query(`
          ;WITH Meses AS (
            SELECT
              0 AS indice,

              DATEFROMPARTS(
                YEAR(@fechaActual),
                MONTH(@fechaActual),
                1
              ) AS inicioMes

            UNION ALL

            SELECT
              indice + 1,

              DATEADD(
                MONTH,
                -1,
                inicioMes
              )

            FROM Meses

            WHERE
              indice + 1 <
                @meses
          ),

          Limites AS (
            SELECT
              MIN(inicioMes)
                AS fechaDesde,

              DATEADD(
                MONTH,
                1,
                MAX(inicioMes)
              ) AS fechaHasta

            FROM Meses
          ),

          Calendario AS (
            SELECT
              fechaDesde
                AS dia

            FROM Limites

            UNION ALL

            SELECT
              DATEADD(
                DAY,
                1,
                c.dia
              )

            FROM Calendario c

            CROSS JOIN Limites l

            WHERE
              DATEADD(
                DAY,
                1,
                c.dia
              ) <
                l.fechaHasta
          ),

          InventarioPropiedades AS (
            /*
             * No tenemos una tabla histórica de estados de
             * propiedad. Por eso inferimos el inventario de
             * cada mes usando dos evidencias:
             *
             * 1. la propiedad ya existía en HostFlow y hoy
             *    continúa Activa;
             *
             * 2. existe una reserva Confirmada/Finalizada
             *    que se superpone con ese mes.
             *
             * El punto 2 permite contemplar reservas
             * históricas importadas que son anteriores a
             * la FechaCreacion registrada en HostFlow.
             */
            SELECT DISTINCT
              m.indice,
              m.inicioMes,
              p.IdPropiedad

            FROM Meses m

            CROSS JOIN dbo.Propiedades p

            LEFT JOIN dbo.EstadosPropiedad ep
              ON ep.IdEstadoPropiedad =
                 p.IdEstadoPropiedad

            WHERE
              (
                ep.Nombre =
                  N'Activa'

                AND p.FechaCreacion <
                  DATEADD(
                    MONTH,
                    1,
                    m.inicioMes
                  )
              )

              OR EXISTS (
                SELECT
                  1

                FROM dbo.Reservas rh

                INNER JOIN dbo.EstadosReserva erh
                  ON erh.IdEstadoReserva =
                     rh.IdEstadoReserva

                WHERE
                  rh.IdPropiedad =
                    p.IdPropiedad

                  AND erh.Nombre IN (
                    N'Confirmada',
                    N'Finalizada'
                  )

                  AND rh.FechaIngreso <
                    DATEADD(
                      MONTH,
                      1,
                      m.inicioMes
                    )

                  AND rh.FechaEgreso >
                    m.inicioMes
              )
          ),

          Inventario AS (
            SELECT
              ip.indice,

              COUNT(*)
                AS propiedadesDisponibles,

              COUNT(*) *
              DATEDIFF(
                DAY,
                ip.inicioMes,
                DATEADD(
                  MONTH,
                  1,
                  ip.inicioMes
                )
              ) AS nochesDisponibles

            FROM InventarioPropiedades ip

            GROUP BY
              ip.indice,
              ip.inicioMes
          ),

          OcupacionUnica AS (
            /*
             * La reserva histórica es suficiente evidencia
             * de ocupación, aunque la propiedad haya sido
             * cargada en HostFlow con posterioridad.
             */
            SELECT DISTINCT
              m.indice,

              r.IdPropiedad,

              c.dia

            FROM Meses m

            INNER JOIN Calendario c
              ON c.dia >=
                 m.inicioMes

             AND c.dia <
                 DATEADD(
                   MONTH,
                   1,
                   m.inicioMes
                 )

            INNER JOIN dbo.Reservas r
              ON c.dia >=
                 r.FechaIngreso

             AND c.dia <
                 r.FechaEgreso

            INNER JOIN dbo.EstadosReserva er
              ON er.IdEstadoReserva =
                 r.IdEstadoReserva

            WHERE
              er.Nombre IN (
                N'Confirmada',
                N'Finalizada'
              )
          ),

          Ocupacion AS (
            SELECT
              indice,

              COUNT(*)
                AS nochesOcupadas

            FROM OcupacionUnica

            GROUP BY
              indice
          ),

          Ingresos AS (
            SELECT
              m.indice,

              COUNT(
                r.IdReserva
              ) AS cantidadReservas,

              COALESCE(
                SUM(
                  r.MontoEstimado
                ),
                0
              ) AS ingresosMes

            FROM Meses m

            LEFT JOIN dbo.Reservas r
              ON r.FechaIngreso >=
                 m.inicioMes

             AND r.FechaIngreso <
                 DATEADD(
                   MONTH,
                   1,
                   m.inicioMes
                 )

            LEFT JOIN dbo.EstadosReserva er
              ON er.IdEstadoReserva =
                 r.IdEstadoReserva

             AND er.Nombre IN (
                 N'Confirmada',
                 N'Finalizada'
             )

            WHERE
              r.IdReserva IS NULL
              OR er.IdEstadoReserva
                 IS NOT NULL

            GROUP BY
              m.indice
          )

          SELECT
            CONVERT(
              VARCHAR(7),
              m.inicioMes,
              120
            ) AS mes,

            CONVERT(
              VARCHAR(10),
              m.inicioMes,
              23
            ) AS inicioMes,

            COALESCE(
              i.cantidadReservas,
              0
            ) AS cantidadReservas,

            COALESCE(
              i.ingresosMes,
              0
            ) AS ingresosMes,

            COALESCE(
              inv.nochesDisponibles,
              0
            ) AS nochesDisponibles,

            COALESCE(
              o.nochesOcupadas,
              0
            ) AS nochesOcupadas,

            CASE
              WHEN COALESCE(
                inv.nochesDisponibles,
                0
              ) = 0
                THEN 0

              ELSE
                CAST(
                  ROUND(
                    (
                      CAST(
                        COALESCE(
                          o.nochesOcupadas,
                          0
                        )
                        AS DECIMAL(18, 4)
                      )
                      /
                      CAST(
                        inv.nochesDisponibles
                        AS DECIMAL(18, 4)
                      )
                    ) * 100,
                    0
                  )
                  AS INT
                )
            END
              AS ocupacionMensual

          FROM Meses m

          LEFT JOIN Inventario inv
            ON inv.indice =
               m.indice

          LEFT JOIN Ocupacion o
            ON o.indice =
               m.indice

          LEFT JOIN Ingresos i
            ON i.indice =
               m.indice

          ORDER BY
            m.indice ASC

          OPTION (
            MAXRECURSION 400
          );
        `);

    return resultado.recordset.map(
      (mes) => ({
        ...mes,

        cantidadReservas:
          Number(
            mes.cantidadReservas ||
            0
          ),

        ingresosMes:
          Number(
            mes.ingresosMes ||
            0
          ),

        nochesDisponibles:
          Number(
            mes.nochesDisponibles ||
            0
          ),

        nochesOcupadas:
          Number(
            mes.nochesOcupadas ||
            0
          ),

        ocupacionMensual:
          Number(
            mes.ocupacionMensual ||
            0
          ),
      })
    );
  }


  // =========================================================
  // OPCIONES PARA FILTROS DE REPORTES
  // =========================================================

  async obtenerOpcionesReportes() {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .query(`
          SELECT
            IdPropiedad AS idPropiedad,
            Nombre AS nombre
          FROM dbo.Propiedades
          ORDER BY Nombre ASC;

          SELECT
            Nombre AS canal
          FROM dbo.CanalesReserva
          ORDER BY
            CASE Nombre
              WHEN N'Manual' THEN 1
              WHEN N'Airbnb' THEN 2
              WHEN N'Booking' THEN 3
              ELSE 4
            END,
            Nombre ASC;

          SELECT
            Nombre AS estado
          FROM dbo.EstadosReserva
          ORDER BY
            CASE Nombre
              WHEN N'Pendiente' THEN 1
              WHEN N'Confirmada' THEN 2
              WHEN N'Finalizada' THEN 3
              WHEN N'Cancelada' THEN 4
              WHEN N'No show' THEN 5
              ELSE 6
            END,
            Nombre ASC;
        `);

    return {
      propiedades:
        (
          resultado.recordsets?.[0] ||
          []
        ).map(
          (item) => ({
            idPropiedad:
              Number(
                item.idPropiedad
              ),

            nombre:
              item.nombre,
          })
        ),

      canales:
        (
          resultado.recordsets?.[1] ||
          []
        ).map(
          (item) =>
            item.canal
        ),

      estados:
        (
          resultado.recordsets?.[2] ||
          []
        ).map(
          (item) =>
            item.estado
        ),
    };
  }

  // =========================================================
  // REPORTES GENERALES FILTRADOS
  // =========================================================

  async obtenerReportes(
    filtros
  ) {
    const {
      fechaDesde,
      fechaHastaExclusiva,
      idPropiedad = null,
      canal = null,
      estado = null,
    } = filtros;

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
          fechaHastaExclusiva
        )
        .input(
          "idPropiedad",
          sql.Int,
          idPropiedad
        )
        .input(
          "canal",
          sql.NVarChar(50),
          canal
        )
        .input(
          "estado",
          sql.NVarChar(50),
          estado
        )
        .query(`
          -- =================================================
          -- RESUMEN DEL PERÍODO
          -- =================================================

          SELECT
            COUNT(*) AS totalReservasPeriodo,

            COUNT(
              CASE
                WHEN er.Nombre IN (
                  N'Pendiente',
                  N'Confirmada',
                  N'Finalizada'
                )
                THEN 1
              END
            ) AS totalReservasOperativas,

            COUNT(
              CASE
                WHEN er.Nombre IN (
                  N'Confirmada',
                  N'Finalizada'
                )
                THEN 1
              END
            ) AS reservasConIngreso,

            COALESCE(
              SUM(
                CASE
                  WHEN er.Nombre IN (
                    N'Confirmada',
                    N'Finalizada'
                  )
                  THEN r.MontoEstimado
                  ELSE 0
                END
              ),
              0
            ) AS ingresosEstimados

          FROM dbo.Reservas r

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          INNER JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               r.IdCanalReserva

          WHERE
            r.FechaIngreso >=
              @fechaDesde

            AND r.FechaIngreso <
              @fechaHasta

            AND (
              @idPropiedad IS NULL
              OR r.IdPropiedad =
                 @idPropiedad
            )

            AND (
              @canal IS NULL
              OR cr.Nombre =
                 @canal
            )

            AND (
              @estado IS NULL
              OR er.Nombre =
                 @estado
            );

          -- =================================================
          -- RESERVAS POR CANAL
          -- =================================================

          SELECT
            cr.Nombre AS canal,

            COUNT(*) AS cantidad

          FROM dbo.Reservas r

          INNER JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               r.IdCanalReserva

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          WHERE
            r.FechaIngreso >=
              @fechaDesde

            AND r.FechaIngreso <
              @fechaHasta

            AND (
              @idPropiedad IS NULL
              OR r.IdPropiedad =
                 @idPropiedad
            )

            AND (
              @canal IS NULL
              OR cr.Nombre =
                 @canal
            )

            AND (
              @estado IS NULL
              OR er.Nombre =
                 @estado
            )

          GROUP BY
            cr.IdCanalReserva,
            cr.Nombre

          ORDER BY
            cantidad DESC,
            cr.Nombre ASC;

          -- =================================================
          -- RESERVAS POR ESTADO
          -- =================================================

          SELECT
            er.Nombre AS estado,

            COUNT(*) AS cantidad

          FROM dbo.Reservas r

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          INNER JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               r.IdCanalReserva

          WHERE
            r.FechaIngreso >=
              @fechaDesde

            AND r.FechaIngreso <
              @fechaHasta

            AND (
              @idPropiedad IS NULL
              OR r.IdPropiedad =
                 @idPropiedad
            )

            AND (
              @canal IS NULL
              OR cr.Nombre =
                 @canal
            )

            AND (
              @estado IS NULL
              OR er.Nombre =
                 @estado
            )

          GROUP BY
            er.IdEstadoReserva,
            er.Nombre

          ORDER BY
            cantidad DESC,
            er.Nombre ASC;

          -- =================================================
          -- RENDIMIENTO POR PROPIEDAD
          -- =================================================

          SELECT
            p.IdPropiedad AS idPropiedad,
            p.Nombre AS propiedad,

            COUNT(
              r.IdReserva
            ) AS reservas,

            COALESCE(
              SUM(
                CASE
                  WHEN er.Nombre IN (
                    N'Confirmada',
                    N'Finalizada'
                  )
                  THEN r.MontoEstimado
                  ELSE 0
                END
              ),
              0
            ) AS ingresosEstimados,

            COALESCE(
              SUM(
                CASE
                  WHEN er.Nombre IN (
                    N'Confirmada',
                    N'Finalizada'
                  )
                  THEN
                    CASE
                      WHEN DATEDIFF(
                        DAY,
                        r.FechaIngreso,
                        r.FechaEgreso
                      ) > 0
                      THEN DATEDIFF(
                        DAY,
                        r.FechaIngreso,
                        r.FechaEgreso
                      )
                      ELSE 0
                    END
                  ELSE 0
                END
              ),
              0
            ) AS nochesReservadas

          FROM dbo.Propiedades p

          LEFT JOIN dbo.Reservas r
            ON r.IdPropiedad =
               p.IdPropiedad

           AND r.FechaIngreso >=
               @fechaDesde

           AND r.FechaIngreso <
               @fechaHasta

          LEFT JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          LEFT JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               r.IdCanalReserva

          WHERE
            (
              @idPropiedad IS NULL
              OR p.IdPropiedad =
                 @idPropiedad
            )

            AND (
              r.IdReserva IS NULL
              OR (
                (
                  @canal IS NULL
                  OR cr.Nombre =
                     @canal
                )

                AND (
                  @estado IS NULL
                  OR er.Nombre =
                     @estado
                )
              )
            )

          GROUP BY
            p.IdPropiedad,
            p.Nombre

          ORDER BY
            ingresosEstimados DESC,
            reservas DESC,
            p.Nombre ASC;
        `);

    const resumen =
      resultado.recordsets?.[0]?.[0] ||
      {};

    const porCanal =
      resultado.recordsets?.[1] ||
      [];

    const porEstado =
      resultado.recordsets?.[2] ||
      [];

    const porPropiedad =
      resultado.recordsets?.[3] ||
      [];

    return {
      resumen: {
        totalReservasPeriodo:
          Number(
            resumen.totalReservasPeriodo ||
            0
          ),

        totalReservasOperativas:
          Number(
            resumen.totalReservasOperativas ||
            0
          ),

        reservasConIngreso:
          Number(
            resumen.reservasConIngreso ||
            0
          ),

        ingresosEstimados:
          Number(
            resumen.ingresosEstimados ||
            0
          ),
      },

      porCanal:
        porCanal.map(
          (item) => ({
            canal:
              item.canal,

            cantidad:
              Number(
                item.cantidad ||
                0
              ),
          })
        ),

      porEstado:
        porEstado.map(
          (item) => ({
            estado:
              item.estado,

            cantidad:
              Number(
                item.cantidad ||
                0
              ),
          })
        ),

      porPropiedad:
        porPropiedad.map(
          (item) => ({
            idPropiedad:
              Number(
                item.idPropiedad
              ),

            propiedad:
              item.propiedad,

            reservas:
              Number(
                item.reservas ||
                0
              ),

            ingresosEstimados:
              Number(
                item.ingresosEstimados ||
                0
              ),

            nochesReservadas:
              Number(
                item.nochesReservadas ||
                0
              ),
          })
        ),
    };
  }

  // =========================================================
  // HISTÓRICO MENSUAL PARA REPORTES FILTRADOS
  // =========================================================

  async obtenerHistoricoReportes(
    filtros
  ) {
    const {
      fechaDesde,
      fechaHastaExclusiva,
      idPropiedad = null,
      canal = null,
      estado = null,
    } = filtros;

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
          fechaHastaExclusiva
        )
        .input(
          "idPropiedad",
          sql.Int,
          idPropiedad
        )
        .input(
          "canal",
          sql.NVarChar(50),
          canal
        )
        .input(
          "estado",
          sql.NVarChar(50),
          estado
        )
        .query(`
          ;WITH Meses AS (
            SELECT
              0 AS indice,

              DATEFROMPARTS(
                YEAR(@fechaDesde),
                MONTH(@fechaDesde),
                1
              ) AS inicioMes

            UNION ALL

            SELECT
              indice + 1,

              DATEADD(
                MONTH,
                1,
                inicioMes
              )

            FROM Meses

            WHERE
              DATEADD(
                MONTH,
                1,
                inicioMes
              ) <
                @fechaHasta
          ),

          Periodos AS (
            SELECT
              indice,
              inicioMes,

              CASE
                WHEN inicioMes <
                     @fechaDesde
                  THEN @fechaDesde
                ELSE inicioMes
              END AS periodoDesde,

              CASE
                WHEN DATEADD(
                  MONTH,
                  1,
                  inicioMes
                ) >
                  @fechaHasta
                  THEN @fechaHasta
                ELSE DATEADD(
                  MONTH,
                  1,
                  inicioMes
                )
              END AS periodoHasta

            FROM Meses
          ),

          Calendario AS (
            SELECT
              CAST(
                @fechaDesde
                AS DATE
              ) AS dia

            UNION ALL

            SELECT
              DATEADD(
                DAY,
                1,
                dia
              )

            FROM Calendario

            WHERE
              DATEADD(
                DAY,
                1,
                dia
              ) <
                @fechaHasta
          ),

          InventarioPropiedades AS (
            SELECT DISTINCT
              pe.indice,
              pe.inicioMes,
              pe.periodoDesde,
              pe.periodoHasta,
              p.IdPropiedad

            FROM Periodos pe

            CROSS JOIN dbo.Propiedades p

            LEFT JOIN dbo.EstadosPropiedad ep
              ON ep.IdEstadoPropiedad =
                 p.IdEstadoPropiedad

            WHERE
              (
                @idPropiedad IS NULL
                OR p.IdPropiedad =
                   @idPropiedad
              )

              AND (
                (
                  ep.Nombre =
                    N'Activa'

                  AND p.FechaCreacion <
                    pe.periodoHasta
                )

                OR EXISTS (
                  SELECT
                    1

                  FROM dbo.Reservas rh

                  INNER JOIN dbo.EstadosReserva erh
                    ON erh.IdEstadoReserva =
                       rh.IdEstadoReserva

                  WHERE
                    rh.IdPropiedad =
                      p.IdPropiedad

                    AND erh.Nombre IN (
                      N'Confirmada',
                      N'Finalizada'
                    )

                    AND rh.FechaIngreso <
                      pe.periodoHasta

                    AND rh.FechaEgreso >
                      pe.periodoDesde
                )
              )
          ),

          Inventario AS (
            SELECT
              ip.indice,

              COUNT(*)
                AS propiedadesDisponibles,

              COUNT(*) *
              DATEDIFF(
                DAY,
                MIN(
                  ip.periodoDesde
                ),
                MAX(
                  ip.periodoHasta
                )
              ) AS nochesDisponibles

            FROM InventarioPropiedades ip

            GROUP BY
              ip.indice
          ),

          OcupacionUnica AS (
            SELECT DISTINCT
              pe.indice,
              r.IdPropiedad,
              c.dia

            FROM Periodos pe

            INNER JOIN Calendario c
              ON c.dia >=
                 pe.periodoDesde

             AND c.dia <
                 pe.periodoHasta

            INNER JOIN dbo.Reservas r
              ON c.dia >=
                 r.FechaIngreso

             AND c.dia <
                 r.FechaEgreso

            INNER JOIN dbo.EstadosReserva er
              ON er.IdEstadoReserva =
                 r.IdEstadoReserva

            INNER JOIN dbo.CanalesReserva cr
              ON cr.IdCanalReserva =
                 r.IdCanalReserva

            WHERE
              er.Nombre IN (
                N'Confirmada',
                N'Finalizada'
              )

              AND (
                @idPropiedad IS NULL
                OR r.IdPropiedad =
                   @idPropiedad
              )

              AND (
                @canal IS NULL
                OR cr.Nombre =
                   @canal
              )

              AND (
                @estado IS NULL
                OR er.Nombre =
                   @estado
              )
          ),

          Ocupacion AS (
            SELECT
              indice,
              COUNT(*) AS nochesOcupadas

            FROM OcupacionUnica

            GROUP BY
              indice
          ),

          Metricas AS (
            SELECT
              pe.indice,

              (
                SELECT
                  COUNT(*)

                FROM dbo.Reservas r

                INNER JOIN dbo.EstadosReserva er
                  ON er.IdEstadoReserva =
                     r.IdEstadoReserva

                INNER JOIN dbo.CanalesReserva cr
                  ON cr.IdCanalReserva =
                     r.IdCanalReserva

                WHERE
                  r.FechaIngreso >=
                    pe.periodoDesde

                  AND r.FechaIngreso <
                    pe.periodoHasta

                  AND (
                    @idPropiedad IS NULL
                    OR r.IdPropiedad =
                       @idPropiedad
                  )

                  AND (
                    @canal IS NULL
                    OR cr.Nombre =
                       @canal
                  )

                  AND (
                    @estado IS NULL
                    OR er.Nombre =
                       @estado
                  )
              ) AS cantidadReservas,

              (
                SELECT
                  COALESCE(
                    SUM(
                      r.MontoEstimado
                    ),
                    0
                  )

                FROM dbo.Reservas r

                INNER JOIN dbo.EstadosReserva er
                  ON er.IdEstadoReserva =
                     r.IdEstadoReserva

                INNER JOIN dbo.CanalesReserva cr
                  ON cr.IdCanalReserva =
                     r.IdCanalReserva

                WHERE
                  r.FechaIngreso >=
                    pe.periodoDesde

                  AND r.FechaIngreso <
                    pe.periodoHasta

                  AND er.Nombre IN (
                    N'Confirmada',
                    N'Finalizada'
                  )

                  AND (
                    @idPropiedad IS NULL
                    OR r.IdPropiedad =
                       @idPropiedad
                  )

                  AND (
                    @canal IS NULL
                    OR cr.Nombre =
                       @canal
                  )

                  AND (
                    @estado IS NULL
                    OR er.Nombre =
                       @estado
                  )
              ) AS ingresosMes

            FROM Periodos pe
          )

          SELECT
            CONVERT(
              VARCHAR(7),
              pe.inicioMes,
              120
            ) AS mes,

            CONVERT(
              VARCHAR(10),
              pe.inicioMes,
              23
            ) AS inicioMes,

            CONVERT(
              VARCHAR(10),
              pe.periodoDesde,
              23
            ) AS periodoDesde,

            CONVERT(
              VARCHAR(10),
              DATEADD(
                DAY,
                -1,
                pe.periodoHasta
              ),
              23
            ) AS periodoHasta,

            COALESCE(
              m.cantidadReservas,
              0
            ) AS cantidadReservas,

            COALESCE(
              m.ingresosMes,
              0
            ) AS ingresosMes,

            COALESCE(
              inv.nochesDisponibles,
              0
            ) AS nochesDisponibles,

            COALESCE(
              o.nochesOcupadas,
              0
            ) AS nochesOcupadas,

            CASE
              WHEN COALESCE(
                inv.nochesDisponibles,
                0
              ) = 0
                THEN 0

              ELSE
                CAST(
                  ROUND(
                    (
                      CAST(
                        COALESCE(
                          o.nochesOcupadas,
                          0
                        )
                        AS DECIMAL(18, 4)
                      )
                      /
                      CAST(
                        inv.nochesDisponibles
                        AS DECIMAL(18, 4)
                      )
                    ) * 100,
                    0
                  )
                  AS INT
                )
            END
              AS ocupacionMensual

          FROM Periodos pe

          LEFT JOIN Inventario inv
            ON inv.indice =
               pe.indice

          LEFT JOIN Ocupacion o
            ON o.indice =
               pe.indice

          LEFT JOIN Metricas m
            ON m.indice =
               pe.indice

          ORDER BY
            pe.inicioMes DESC

          OPTION (
            MAXRECURSION 0
          );
        `);

    return resultado.recordset.map(
      (mes) => ({
        ...mes,

        cantidadReservas:
          Number(
            mes.cantidadReservas ||
            0
          ),

        ingresosMes:
          Number(
            mes.ingresosMes ||
            0
          ),

        nochesDisponibles:
          Number(
            mes.nochesDisponibles ||
            0
          ),

        nochesOcupadas:
          Number(
            mes.nochesOcupadas ||
            0
          ),

        ocupacionMensual:
          Number(
            mes.ocupacionMensual ||
            0
          ),
      })
    );
  }

}

module.exports =
  new DashboardRepository();
