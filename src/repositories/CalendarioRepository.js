const {
  poolPromise,
  sql,
} = require("../config/database");

class CalendarioRepository {
  // =========================================================
  // OBTENER PROPIEDADES DEL CALENDARIO
  // =========================================================
  //
  // Devuelve también propiedades sin reservas para que el
  // calendario pueda mostrar correctamente los días libres.
  //
  // Si idPropiedad viene informado, devuelve solamente esa
  // propiedad.
  //
  // =========================================================

  async obtenerPropiedades(
    idPropiedad = null
  ) {
    const pool =
      await poolPromise;

    const request =
      pool.request();

    let filtroPropiedad = "";

    if (
      idPropiedad !== null &&
      idPropiedad !== undefined &&
      idPropiedad !== ""
    ) {
      request.input(
        "idPropiedad",
        sql.Int,
        Number(idPropiedad)
      );

      filtroPropiedad = `
        WHERE
          p.IdPropiedad = @idPropiedad
      `;
    }

    const resultado =
      await request.query(`
        SELECT
          p.IdPropiedad
            AS idPropiedad,

          p.Nombre
            AS nombre,

          p.Tipo
            AS tipo,

          p.Ciudad
            AS ciudad,

          p.Provincia
            AS provincia,

          p.CapacidadMaxima
            AS capacidadMaxima,

          ep.Nombre
            AS estado

        FROM dbo.Propiedades p

        INNER JOIN dbo.EstadosPropiedad ep
          ON ep.IdEstadoPropiedad =
             p.IdEstadoPropiedad

        ${filtroPropiedad}

        ORDER BY
          p.Nombre ASC,
          p.IdPropiedad ASC;
      `);

    return resultado.recordset;
  }

  // =========================================================
  // OBTENER RESERVAS DE UN PERÍODO
  // =========================================================
  //
  // fechaDesde:
  //   inclusive
  //
  // fechaHasta:
  //   exclusive
  //
  // Ejemplo para septiembre:
  //
  //   fechaDesde = 2026-09-01
  //   fechaHasta = 2026-10-01
  //
  // Una reserva pertenece al período cuando:
  //
  //   ingreso < fechaHasta
  //   egreso  > fechaDesde
  //
  // Esto también incluye reservas que comenzaron en el mes
  // anterior o terminan durante el mes siguiente.
  //
  // =========================================================

  async obtenerReservas(
    fechaDesde,
    fechaHasta,
    idPropiedad = null
  ) {
    const pool =
      await poolPromise;

    const request =
      pool
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
        );

    let filtroPropiedad = "";

    if (
      idPropiedad !== null &&
      idPropiedad !== undefined &&
      idPropiedad !== ""
    ) {
      request.input(
        "idPropiedad",
        sql.Int,
        Number(idPropiedad)
      );

      filtroPropiedad = `
        AND r.IdPropiedad =
            @idPropiedad
      `;
    }

    const resultado =
      await request.query(`
        SELECT
          r.IdReserva
            AS idReserva,

          r.IdPropiedad
            AS idPropiedad,

          p.Nombre
            AS propiedad,

          r.IdHuesped
            AS idHuesped,

          CONCAT(
            h.Nombre,
            N' ',
            h.Apellido
          ) AS huesped,

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
            AS montoEstimado,

          r.IdExterno
            AS idExterno,

          r.EstadoSincronizacion
            AS estadoSincronizacion,

          CASE
            WHEN er.Nombre IN (
              N'Cancelada',
              N'No show'
            )
              THEN CAST(0 AS BIT)

            ELSE
              CAST(1 AS BIT)
          END
            AS bloqueaDisponibilidad

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
          r.FechaIngreso <
            @fechaHasta

          AND
          r.FechaEgreso >
            @fechaDesde

          ${filtroPropiedad}

        ORDER BY
          r.IdPropiedad ASC,
          r.FechaIngreso ASC,
          r.FechaEgreso ASC,
          r.IdReserva ASC;
      `);

    return resultado.recordset;
  }

  // =========================================================
  // OBTENER CONFLICTOS DE RESERVAS
  // =========================================================
  //
  // Detecta dos reservas que:
  //
  // - pertenecen a la misma propiedad;
  // - bloquean disponibilidad;
  // - se superponen entre sí;
  // - afectan al período solicitado.
  //
  // Canceladas y No show no generan conflicto.
  //
  // =========================================================

  async obtenerConflictos(
    fechaDesde,
    fechaHasta,
    idPropiedad = null
  ) {
    const pool =
      await poolPromise;

    const request =
      pool
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
        );

    let filtroPropiedad = "";

    if (
      idPropiedad !== null &&
      idPropiedad !== undefined &&
      idPropiedad !== ""
    ) {
      request.input(
        "idPropiedad",
        sql.Int,
        Number(idPropiedad)
      );

      filtroPropiedad = `
        AND r1.IdPropiedad =
            @idPropiedad
      `;
    }

    const resultado =
      await request.query(`
        SELECT
          r1.IdPropiedad
            AS idPropiedad,

          p.Nombre
            AS propiedad,

          r1.IdReserva
            AS idReservaA,

          CONCAT(
            h1.Nombre,
            N' ',
            h1.Apellido
          ) AS huespedA,

          c1.Nombre
            AS canalA,

          e1.Nombre
            AS estadoA,

          CONVERT(
            VARCHAR(10),
            r1.FechaIngreso,
            23
          ) AS fechaIngresoA,

          CONVERT(
            VARCHAR(10),
            r1.FechaEgreso,
            23
          ) AS fechaEgresoA,

          r2.IdReserva
            AS idReservaB,

          CONCAT(
            h2.Nombre,
            N' ',
            h2.Apellido
          ) AS huespedB,

          c2.Nombre
            AS canalB,

          e2.Nombre
            AS estadoB,

          CONVERT(
            VARCHAR(10),
            r2.FechaIngreso,
            23
          ) AS fechaIngresoB,

          CONVERT(
            VARCHAR(10),
            r2.FechaEgreso,
            23
          ) AS fechaEgresoB,

          CONVERT(
            VARCHAR(10),
            CASE
              WHEN r1.FechaIngreso >
                   r2.FechaIngreso
                THEN r1.FechaIngreso
              ELSE r2.FechaIngreso
            END,
            23
          ) AS fechaConflictoDesde,

          CONVERT(
            VARCHAR(10),
            CASE
              WHEN r1.FechaEgreso <
                   r2.FechaEgreso
                THEN r1.FechaEgreso
              ELSE r2.FechaEgreso
            END,
            23
          ) AS fechaConflictoHasta

        FROM dbo.Reservas r1

        INNER JOIN dbo.Reservas r2
          ON r2.IdPropiedad =
             r1.IdPropiedad

          AND r1.IdReserva <
              r2.IdReserva

          AND r1.FechaIngreso <
              r2.FechaEgreso

          AND r1.FechaEgreso >
              r2.FechaIngreso

        INNER JOIN dbo.Propiedades p
          ON p.IdPropiedad =
             r1.IdPropiedad

        INNER JOIN dbo.Huespedes h1
          ON h1.IdHuesped =
             r1.IdHuesped

        INNER JOIN dbo.Huespedes h2
          ON h2.IdHuesped =
             r2.IdHuesped

        INNER JOIN dbo.CanalesReserva c1
          ON c1.IdCanalReserva =
             r1.IdCanalReserva

        INNER JOIN dbo.CanalesReserva c2
          ON c2.IdCanalReserva =
             r2.IdCanalReserva

        INNER JOIN dbo.EstadosReserva e1
          ON e1.IdEstadoReserva =
             r1.IdEstadoReserva

        INNER JOIN dbo.EstadosReserva e2
          ON e2.IdEstadoReserva =
             r2.IdEstadoReserva

        WHERE
          e1.Nombre NOT IN (
            N'Cancelada',
            N'No show'
          )

          AND
          e2.Nombre NOT IN (
            N'Cancelada',
            N'No show'
          )

          AND
          r1.FechaIngreso <
            @fechaHasta

          AND
          r1.FechaEgreso >
            @fechaDesde

          AND
          r2.FechaIngreso <
            @fechaHasta

          AND
          r2.FechaEgreso >
            @fechaDesde

          ${filtroPropiedad}

        ORDER BY
          p.Nombre ASC,
          fechaConflictoDesde ASC,
          r1.IdReserva ASC,
          r2.IdReserva ASC;
      `);

    return resultado.recordset;
  }
}

module.exports =
  new CalendarioRepository();
