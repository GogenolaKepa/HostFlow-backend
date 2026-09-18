const {
  poolPromise,
  sql,
} = require("../config/database");

class HuespedRepository {
  // =========================================================
  // OBTENER TODOS
  // =========================================================

  async obtenerTodos() {
  const pool =
    await poolPromise;

  const resultado =
    await pool
      .request()
      .query(`
        SELECT
          h.IdHuesped AS idHuesped,
          h.Nombre AS nombre,
          h.Apellido AS apellido,
          h.Email AS email,
          h.Telefono AS telefono,
          h.Documento AS dni,
          h.Nacionalidad AS nacionalidad,
          h.OrigenRegistro AS origenRegistro,

          COUNT(r.IdReserva)
            AS cantidadReservas,

          MAX(
            CASE
              WHEN
                er.Nombre NOT IN (
                  N'Cancelada',
                  N'Finalizada',
                  N'No show'
                )
                AND r.FechaIngreso <=
                  CAST(GETDATE() AS DATE)
                AND r.FechaEgreso >
                  CAST(GETDATE() AS DATE)
              THEN 1
              ELSE 0
            END
          ) AS tieneReservaActiva,

          MAX(
            CASE
              WHEN
                er.Nombre NOT IN (
                  N'Cancelada',
                  N'Finalizada',
                  N'No show'
                )
                AND r.FechaIngreso >
                  CAST(GETDATE() AS DATE)
              THEN 1
              ELSE 0
            END
          ) AS tieneReservaFutura

        FROM dbo.Huespedes h

        LEFT JOIN dbo.Reservas r
          ON r.IdHuesped =
             h.IdHuesped

        LEFT JOIN dbo.EstadosReserva er
          ON er.IdEstadoReserva =
             r.IdEstadoReserva

        GROUP BY
          h.IdHuesped,
          h.Nombre,
          h.Apellido,
          h.Email,
          h.Telefono,
          h.Documento,
          h.Nacionalidad,
          h.OrigenRegistro

        ORDER BY
          h.Apellido ASC,
          h.Nombre ASC;
      `);

  return resultado.recordset;
}

  // =========================================================
  // OBTENER POR ID
  // =========================================================

  async obtenerPorId(
    idHuesped
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idHuesped",
          sql.Int,
          Number(idHuesped)
        )
        .query(`
          SELECT
            IdHuesped AS idHuesped,
            Nombre AS nombre,
            Apellido AS apellido,
            Email AS email,
            Telefono AS telefono,
            Documento AS dni,
            Nacionalidad AS nacionalidad,
            OrigenRegistro AS origenRegistro
          FROM dbo.Huespedes
          WHERE IdHuesped = @idHuesped;
        `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  // =========================================================
  // OBTENER POR EMAIL
  // =========================================================

  async obtenerPorEmail(
    email
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "email",
          sql.NVarChar(150),
          email
        )
        .query(`
          SELECT TOP 1
            IdHuesped AS idHuesped,
            Nombre AS nombre,
            Apellido AS apellido,
            Email AS email,
            Telefono AS telefono,
            Documento AS dni,
            Nacionalidad AS nacionalidad,
            OrigenRegistro AS origenRegistro
          FROM dbo.Huespedes
          WHERE Email = @email;
        `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  // =========================================================
  // CREAR
  // =========================================================

  async crear(datos) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "nombre",
          sql.NVarChar(100),
          datos.nombre
        )
        .input(
          "apellido",
          sql.NVarChar(100),
          datos.apellido
        )
        .input(
          "email",
          sql.NVarChar(150),
          datos.email
        )
        .input(
          "telefono",
          sql.NVarChar(50),
          datos.telefono || null
        )
        .input(
          "dni",
          sql.NVarChar(100),
          datos.dni || null
        )
        .input(
          "nacionalidad",
          sql.NVarChar(100),
          datos.nacionalidad || null
        )
        .input(
          "origenRegistro",
          sql.NVarChar(50),
          datos.origenRegistro ||
            "Manual"
        )
        .query(`
          INSERT INTO dbo.Huespedes (
            Nombre,
            Apellido,
            Email,
            Telefono,
            Documento,
            Nacionalidad,
            OrigenRegistro,
            FechaCreacion
          )
          OUTPUT
            INSERTED.IdHuesped AS idHuesped,
            INSERTED.Nombre AS nombre,
            INSERTED.Apellido AS apellido,
            INSERTED.Email AS email,
            INSERTED.Telefono AS telefono,
            INSERTED.Documento AS dni,
            INSERTED.Nacionalidad AS nacionalidad,
            INSERTED.OrigenRegistro AS origenRegistro
          VALUES (
            @nombre,
            @apellido,
            @email,
            @telefono,
            @dni,
            @nacionalidad,
            @origenRegistro,
            SYSDATETIME()
          );
        `);

    return resultado.recordset[0];
  }

  // =========================================================
  // ACTUALIZAR
  // =========================================================

  async actualizar(
    idHuesped,
    datos
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idHuesped",
        sql.Int,
        Number(idHuesped)
      )
      .input(
        "nombre",
        sql.NVarChar(100),
        datos.nombre
      )
      .input(
        "apellido",
        sql.NVarChar(100),
        datos.apellido
      )
      .input(
        "email",
        sql.NVarChar(150),
        datos.email
      )
      .input(
        "telefono",
        sql.NVarChar(50),
        datos.telefono || null
      )
      .input(
        "dni",
        sql.NVarChar(100),
        datos.dni || null
      )
      .input(
        "nacionalidad",
        sql.NVarChar(100),
        datos.nacionalidad || null
      )
      .query(`
        UPDATE dbo.Huespedes
        SET
          Nombre = @nombre,
          Apellido = @apellido,
          Email = @email,
          Telefono = @telefono,
          Documento = @dni,
          Nacionalidad = @nacionalidad
        WHERE IdHuesped = @idHuesped;
      `);

    return this.obtenerPorId(
      idHuesped
    );
  }
}

module.exports =
  new HuespedRepository();