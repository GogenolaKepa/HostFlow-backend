const {
  poolPromise,
  sql,
} = require("../config/database");

class ReservaRepository {
  async obtenerTodas() {
    const pool = await poolPromise;

    const resultado = await pool.request().query(`
      SELECT
        r.IdReserva AS idReserva,

        p.IdPropiedad AS idPropiedad,
        p.Nombre AS propiedad,

        h.IdHuesped AS idHuesped,
        h.Nombre + N' ' + h.Apellido AS huesped,

        c.Nombre AS canal,
        er.Nombre AS estado,

        CONVERT(VARCHAR(10), r.FechaIngreso, 23) AS fechaIngreso,
        CONVERT(VARCHAR(10), r.FechaEgreso, 23) AS fechaEgreso,

        r.CantidadHuespedes AS cantidadHuespedes,
        r.MontoEstimado AS montoEstimado,

        r.IdExterno AS idExterno,
        r.EstadoSincronizacion AS estadoSincronizacion

      FROM dbo.Reservas r

      INNER JOIN dbo.Propiedades p
        ON r.IdPropiedad = p.IdPropiedad

      INNER JOIN dbo.Huespedes h
        ON r.IdHuesped = h.IdHuesped

      INNER JOIN dbo.CanalesReserva c
        ON r.IdCanalReserva = c.IdCanalReserva

      INNER JOIN dbo.EstadosReserva er
        ON r.IdEstadoReserva = er.IdEstadoReserva

      ORDER BY r.IdReserva;
    `);

    return resultado.recordset;
  }
  async obtenerPorId(idReserva) {
  const pool = await poolPromise;

  const resultado =
    await pool
      .request()
      .input(
        "idReserva",
        sql.Int,
        Number(idReserva)
      )
      .query(`
        SELECT
          r.IdReserva AS idReserva,

          p.IdPropiedad AS idPropiedad,
          p.Nombre AS propiedad,

          h.IdHuesped AS idHuesped,
          h.Nombre + N' ' + h.Apellido AS huesped,

          c.Nombre AS canal,
          er.Nombre AS estado,

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
            AS estadoSincronizacion

        FROM dbo.Reservas r

        INNER JOIN dbo.Propiedades p
          ON r.IdPropiedad =
             p.IdPropiedad

        INNER JOIN dbo.Huespedes h
          ON r.IdHuesped =
             h.IdHuesped

        INNER JOIN dbo.CanalesReserva c
          ON r.IdCanalReserva =
             c.IdCanalReserva

        INNER JOIN dbo.EstadosReserva er
          ON r.IdEstadoReserva =
             er.IdEstadoReserva

        WHERE r.IdReserva = @idReserva;
      `);

  return resultado.recordset[0] || null;
}
}

module.exports = new ReservaRepository();