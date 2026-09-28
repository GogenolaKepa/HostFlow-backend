const {
  poolPromise,
  sql,
} = require("../config/database");


class RecomendacionRepository {
  // =========================================================
  // CONFLICTOS DE RESERVAS PRÓXIMOS
  // =========================================================

  async obtenerConflictosProximos(
    fechaActual,
    horizonteDias = 30
  ) {
    const dias =
      Math.max(
        1,
        Math.min(
          Number(horizonteDias) || 30,
          365
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
          "horizonteDias",
          sql.Int,
          dias
        )
        .query(`
          DECLARE @fechaHasta DATE =
            DATEADD(
              DAY,
              @horizonteDias,
              @fechaActual
            );

          SELECT TOP (20)
            p.IdPropiedad
              AS idPropiedad,

            p.Nombre
              AS propiedad,

            r1.IdReserva
              AS idReservaA,

            cr1.Nombre
              AS canalA,

            CONVERT(
              VARCHAR(10),
              r1.FechaIngreso,
              23
            ) AS fechaIngresoA,

            CONVERT(
              VARCHAR(5),
              CAST(
                r1.FechaIngreso
                AS TIME(0)
              ),
              108
            ) AS horaIngresoA,

            CONVERT(
              VARCHAR(10),
              r1.FechaEgreso,
              23
            ) AS fechaEgresoA,

            CONVERT(
              VARCHAR(5),
              CAST(
                r1.FechaEgreso
                AS TIME(0)
              ),
              108
            ) AS horaEgresoA,

            r2.IdReserva
              AS idReservaB,

            cr2.Nombre
              AS canalB,

            CONVERT(
              VARCHAR(10),
              r2.FechaIngreso,
              23
            ) AS fechaIngresoB,

            CONVERT(
              VARCHAR(5),
              CAST(
                r2.FechaIngreso
                AS TIME(0)
              ),
              108
            ) AS horaIngresoB,

            CONVERT(
              VARCHAR(10),
              r2.FechaEgreso,
              23
            ) AS fechaEgresoB,

            CONVERT(
              VARCHAR(5),
              CAST(
                r2.FechaEgreso
                AS TIME(0)
              ),
              108
            ) AS horaEgresoB

          FROM dbo.Reservas r1

          INNER JOIN dbo.Reservas r2
            ON r2.IdPropiedad =
               r1.IdPropiedad

           AND r2.IdReserva >
               r1.IdReserva

           /*
            * La disponibilidad de HostFlow
            * sigue siendo por DÍA:
            * [check-in, checkout)
            */
           AND CAST(
                 r1.FechaIngreso
                 AS DATE
               ) <
               CAST(
                 r2.FechaEgreso
                 AS DATE
               )

           AND CAST(
                 r2.FechaIngreso
                 AS DATE
               ) <
               CAST(
                 r1.FechaEgreso
                 AS DATE
               )

          INNER JOIN dbo.Propiedades p
            ON p.IdPropiedad =
               r1.IdPropiedad

          INNER JOIN dbo.EstadosReserva er1
            ON er1.IdEstadoReserva =
               r1.IdEstadoReserva

          INNER JOIN dbo.EstadosReserva er2
            ON er2.IdEstadoReserva =
               r2.IdEstadoReserva

          INNER JOIN dbo.CanalesReserva cr1
            ON cr1.IdCanalReserva =
               r1.IdCanalReserva

          INNER JOIN dbo.CanalesReserva cr2
            ON cr2.IdCanalReserva =
               r2.IdCanalReserva

          WHERE
            er1.Nombre NOT IN (
              N'Cancelada',
              N'No show'
            )

            AND er2.Nombre NOT IN (
              N'Cancelada',
              N'No show'
            )

            AND CAST(
                  r1.FechaEgreso
                  AS DATE
                ) >=
                @fechaActual

            AND CAST(
                  r2.FechaEgreso
                  AS DATE
                ) >=
                @fechaActual

            AND CAST(
                  r1.FechaIngreso
                  AS DATE
                ) <
                @fechaHasta

            AND CAST(
                  r2.FechaIngreso
                  AS DATE
                ) <
                @fechaHasta

          ORDER BY
            CASE
              WHEN CAST(
                     r1.FechaIngreso
                     AS DATE
                   ) <
                   CAST(
                     r2.FechaIngreso
                     AS DATE
                   )
                THEN CAST(
                       r1.FechaIngreso
                       AS DATE
                     )
              ELSE CAST(
                     r2.FechaIngreso
                     AS DATE
                   )
            END ASC,

            p.Nombre ASC,
            r1.IdReserva ASC,
            r2.IdReserva ASC;
        `);

    return resultado.recordset.map(
      (conflicto) => ({
        ...conflicto,

        idPropiedad:
          Number(
            conflicto.idPropiedad
          ),

        idReservaA:
          Number(
            conflicto.idReservaA
          ),

        idReservaB:
          Number(
            conflicto.idReservaB
          ),
      })
    );
  }


  // =========================================================
  // OCUPACIÓN PRÓXIMOS N DÍAS POR PROPIEDAD
  // =========================================================

  async obtenerOcupacionProxima(
    fechaActual,
    horizonteDias = 30
  ) {
    const dias =
      Math.max(
        7,
        Math.min(
          Number(horizonteDias) || 30,
          365
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
          "horizonteDias",
          sql.Int,
          dias
        )
        .query(`
          DECLARE @fechaHasta DATE =
            DATEADD(
              DAY,
              @horizonteDias,
              @fechaActual
            );

          ;WITH Calendario AS (
            SELECT
              CAST(
                @fechaActual
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
              ) < @fechaHasta
          ),

          PropiedadesActivas AS (
            SELECT
              p.IdPropiedad,
              p.Nombre

            FROM dbo.Propiedades p

            INNER JOIN dbo.EstadosPropiedad ep
              ON ep.IdEstadoPropiedad =
                 p.IdEstadoPropiedad

            WHERE
              ep.Nombre =
                N'Activa'
          ),

          ReservasValidas AS (
            SELECT
              r.IdReserva,
              r.IdPropiedad,

              CAST(
                r.FechaIngreso
                AS DATE
              ) AS fechaIngreso,

              CAST(
                r.FechaEgreso
                AS DATE
              ) AS fechaEgreso

            FROM dbo.Reservas r

            INNER JOIN dbo.EstadosReserva er
              ON er.IdEstadoReserva =
                 r.IdEstadoReserva

            WHERE
              er.Nombre NOT IN (
                N'Cancelada',
                N'No show'
              )
          ),

          OcupacionPorDia AS (
            SELECT
              p.IdPropiedad,
              p.Nombre AS propiedad,
              c.dia,

              CASE
                WHEN COUNT(
                       rv.IdReserva
                     ) > 0
                  THEN 1
                ELSE 0
              END AS ocupada

            FROM PropiedadesActivas p

            CROSS JOIN Calendario c

            LEFT JOIN ReservasValidas rv
              ON rv.IdPropiedad =
                 p.IdPropiedad

             AND c.dia >=
                 rv.fechaIngreso

             AND c.dia <
                 rv.fechaEgreso

            GROUP BY
              p.IdPropiedad,
              p.Nombre,
              c.dia
          ),

          ResumenOcupacion AS (
            SELECT
              opd.IdPropiedad,
              opd.propiedad,

              COUNT(*)
                AS nochesDisponibles,

              SUM(
                opd.ocupada
              ) AS nochesOcupadas

            FROM OcupacionPorDia opd

            GROUP BY
              opd.IdPropiedad,
              opd.propiedad
          ),

          ReservasProximas AS (
            SELECT
              p.IdPropiedad,

              COUNT(
                rv.IdReserva
              ) AS reservasProximas

            FROM PropiedadesActivas p

            LEFT JOIN ReservasValidas rv
              ON rv.IdPropiedad =
                 p.IdPropiedad

             AND rv.fechaIngreso <
                 @fechaHasta

             AND rv.fechaEgreso >
                 @fechaActual

            GROUP BY
              p.IdPropiedad
          )

          SELECT
            ro.IdPropiedad
              AS idPropiedad,

            ro.propiedad,

            ro.nochesDisponibles,
            ro.nochesOcupadas,

            COALESCE(
              rp.reservasProximas,
              0
            ) AS reservasProximas

          FROM ResumenOcupacion ro

          LEFT JOIN ReservasProximas rp
            ON rp.IdPropiedad =
               ro.IdPropiedad

          ORDER BY
            ro.propiedad ASC

          OPTION (
            MAXRECURSION 400
          );
        `);

    return resultado.recordset.map(
      (item) => {
        const nochesDisponibles =
          Number(
            item.nochesDisponibles ||
            0
          );

        const nochesOcupadas =
          Number(
            item.nochesOcupadas ||
            0
          );

        const ocupacion =
          nochesDisponibles > 0
            ? Math.round(
                (
                  nochesOcupadas /
                  nochesDisponibles
                ) * 100
              )
            : 0;

        return {
          idPropiedad:
            Number(
              item.idPropiedad
            ),

          propiedad:
            item.propiedad,

          nochesDisponibles,
          nochesOcupadas,
          ocupacion,

          reservasProximas:
            Number(
              item.reservasProximas ||
              0
            ),
        };
      }
    );
  }
}


module.exports =
  new RecomendacionRepository();