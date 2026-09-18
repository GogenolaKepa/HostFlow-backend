const {
  poolPromise,
  sql,
} = require("../config/database");

class PropiedadRepository {
  // =========================================================
  // OBTENER TODAS
  // =========================================================

  async obtenerTodas() {
    const pool = await poolPromise;

    const resultado = await pool
      .request()
      .query(`
        SELECT
          p.IdPropiedad AS idPropiedad,
          p.Nombre AS nombre,
          p.Tipo AS tipo,
          p.Direccion AS direccion,
          p.Ciudad AS ciudad,
          p.Provincia AS provincia,
          p.CapacidadMaxima AS capacidadMaxima,
          p.PrecioBase AS precioBase,
          ep.Nombre AS estado,
          p.FechaCreacion AS fechaCreacion,

          imagenPrincipal.IdPropiedadImagen
            AS idImagenPrincipal,

          imagenPrincipal.UrlImagen
            AS imagenPrincipal,

          imagenPrincipal.Descripcion
            AS descripcionImagenPrincipal,

          CASE
            WHEN ep.Nombre IN (
              N'Mantenimiento',
              N'Inactiva'
            )
              THEN N'No disponible'

            WHEN reservaActual.IdReserva IS NOT NULL
              THEN N'Ocupada'

            WHEN proximaReserva.IdReserva IS NOT NULL
              THEN N'Reservada'

            ELSE N'Disponible'
          END AS situacion,

          reservaActual.IdReserva
            AS idReservaActual,

          reservaActual.IdHuesped
            AS idHuespedActual,

          reservaActual.Huesped
            AS huespedActual,

          CONVERT(
            VARCHAR(10),
            reservaActual.FechaIngreso,
            23
          ) AS fechaIngresoActual,

          CONVERT(
            VARCHAR(10),
            reservaActual.FechaEgreso,
            23
          ) AS fechaEgresoActual,

          proximaReserva.IdReserva
            AS idProximaReserva,

          proximaReserva.IdHuesped
            AS idProximoHuesped,

          proximaReserva.Huesped
            AS proximoHuesped,

          CONVERT(
            VARCHAR(10),
            proximaReserva.FechaIngreso,
            23
          ) AS proximaFechaIngreso,

          CONVERT(
            VARCHAR(10),
            proximaReserva.FechaEgreso,
            23
          ) AS proximaFechaEgreso

        FROM dbo.Propiedades p

        INNER JOIN dbo.EstadosPropiedad ep
          ON ep.IdEstadoPropiedad =
             p.IdEstadoPropiedad

        OUTER APPLY (
          SELECT TOP 1
            r.IdReserva,
            r.IdHuesped,
            h.Nombre + N' ' + h.Apellido AS Huesped,
            r.FechaIngreso,
            r.FechaEgreso

          FROM dbo.Reservas r

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          INNER JOIN dbo.Huespedes h
            ON h.IdHuesped =
               r.IdHuesped

          WHERE
            r.IdPropiedad =
              p.IdPropiedad

            AND er.Nombre NOT IN (
              N'Cancelada',
              N'Finalizada',
              N'No show'
            )

            AND r.FechaIngreso <=
              CAST(GETDATE() AS DATE)

            AND r.FechaEgreso >
              CAST(GETDATE() AS DATE)

          ORDER BY
            r.FechaIngreso DESC,
            r.IdReserva DESC
        ) reservaActual

        OUTER APPLY (
          SELECT TOP 1
            r.IdReserva,
            r.IdHuesped,
            h.Nombre + N' ' + h.Apellido AS Huesped,
            r.FechaIngreso,
            r.FechaEgreso

          FROM dbo.Reservas r

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          INNER JOIN dbo.Huespedes h
            ON h.IdHuesped =
               r.IdHuesped

          WHERE
            r.IdPropiedad =
              p.IdPropiedad

            AND er.Nombre NOT IN (
              N'Cancelada',
              N'Finalizada',
              N'No show'
            )

            AND r.FechaIngreso >
              CAST(GETDATE() AS DATE)

          ORDER BY
            r.FechaIngreso ASC,
            r.IdReserva ASC
        ) proximaReserva

        OUTER APPLY (
          SELECT TOP 1
            pi.IdPropiedadImagen,
            pi.UrlImagen,
            pi.Descripcion

          FROM dbo.PropiedadImagenes pi

          WHERE
            pi.IdPropiedad =
              p.IdPropiedad

            AND pi.Estado =
              N'Activa'

          ORDER BY
            pi.EsPrincipal DESC,
            pi.Orden ASC,
            pi.IdPropiedadImagen ASC
        ) imagenPrincipal

        ORDER BY
          p.Nombre ASC;
      `);

    return resultado.recordset;
  }

  // =========================================================
  // OBTENER POR ID
  // =========================================================

  async obtenerPorId(
    idPropiedad
  ) {
    const pool = await poolPromise;

    const resultado = await pool
      .request()
      .input(
        "idPropiedad",
        sql.Int,
        Number(idPropiedad)
      )
      .query(`
        SELECT
          p.IdPropiedad AS idPropiedad,
          p.Nombre AS nombre,
          p.Tipo AS tipo,
          p.Direccion AS direccion,
          p.Ciudad AS ciudad,
          p.Provincia AS provincia,
          p.CapacidadMaxima AS capacidadMaxima,
          p.PrecioBase AS precioBase,
          ep.Nombre AS estado,
          p.FechaCreacion AS fechaCreacion,

          imagenPrincipal.IdPropiedadImagen
            AS idImagenPrincipal,

          imagenPrincipal.UrlImagen
            AS imagenPrincipal,

          imagenPrincipal.Descripcion
            AS descripcionImagenPrincipal,

          CASE
            WHEN ep.Nombre IN (
              N'Mantenimiento',
              N'Inactiva'
            )
              THEN N'No disponible'

            WHEN reservaActual.IdReserva IS NOT NULL
              THEN N'Ocupada'

            WHEN proximaReserva.IdReserva IS NOT NULL
              THEN N'Reservada'

            ELSE N'Disponible'
          END AS situacion,

          reservaActual.IdReserva
            AS idReservaActual,

          reservaActual.IdHuesped
            AS idHuespedActual,

          reservaActual.Huesped
            AS huespedActual,

          CONVERT(
            VARCHAR(10),
            reservaActual.FechaIngreso,
            23
          ) AS fechaIngresoActual,

          CONVERT(
            VARCHAR(10),
            reservaActual.FechaEgreso,
            23
          ) AS fechaEgresoActual,

          proximaReserva.IdReserva
            AS idProximaReserva,

          proximaReserva.IdHuesped
            AS idProximoHuesped,

          proximaReserva.Huesped
            AS proximoHuesped,

          CONVERT(
            VARCHAR(10),
            proximaReserva.FechaIngreso,
            23
          ) AS proximaFechaIngreso,

          CONVERT(
            VARCHAR(10),
            proximaReserva.FechaEgreso,
            23
          ) AS proximaFechaEgreso

        FROM dbo.Propiedades p

        INNER JOIN dbo.EstadosPropiedad ep
          ON ep.IdEstadoPropiedad =
             p.IdEstadoPropiedad

        OUTER APPLY (
          SELECT TOP 1
            r.IdReserva,
            r.IdHuesped,
            h.Nombre + N' ' + h.Apellido AS Huesped,
            r.FechaIngreso,
            r.FechaEgreso

          FROM dbo.Reservas r

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          INNER JOIN dbo.Huespedes h
            ON h.IdHuesped =
               r.IdHuesped

          WHERE
            r.IdPropiedad =
              p.IdPropiedad

            AND er.Nombre NOT IN (
              N'Cancelada',
              N'Finalizada',
              N'No show'
            )

            AND r.FechaIngreso <=
              CAST(GETDATE() AS DATE)

            AND r.FechaEgreso >
              CAST(GETDATE() AS DATE)

          ORDER BY
            r.FechaIngreso DESC,
            r.IdReserva DESC
        ) reservaActual

        OUTER APPLY (
          SELECT TOP 1
            r.IdReserva,
            r.IdHuesped,
            h.Nombre + N' ' + h.Apellido AS Huesped,
            r.FechaIngreso,
            r.FechaEgreso

          FROM dbo.Reservas r

          INNER JOIN dbo.EstadosReserva er
            ON er.IdEstadoReserva =
               r.IdEstadoReserva

          INNER JOIN dbo.Huespedes h
            ON h.IdHuesped =
               r.IdHuesped

          WHERE
            r.IdPropiedad =
              p.IdPropiedad

            AND er.Nombre NOT IN (
              N'Cancelada',
              N'Finalizada',
              N'No show'
            )

            AND r.FechaIngreso >
              CAST(GETDATE() AS DATE)

          ORDER BY
            r.FechaIngreso ASC,
            r.IdReserva ASC
        ) proximaReserva

        OUTER APPLY (
          SELECT TOP 1
            pi.IdPropiedadImagen,
            pi.UrlImagen,
            pi.Descripcion

          FROM dbo.PropiedadImagenes pi

          WHERE
            pi.IdPropiedad =
              p.IdPropiedad

            AND pi.Estado =
              N'Activa'

          ORDER BY
            pi.EsPrincipal DESC,
            pi.Orden ASC,
            pi.IdPropiedadImagen ASC
        ) imagenPrincipal

        WHERE
          p.IdPropiedad =
            @idPropiedad;
      `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  // =========================================================
  // OBTENER ESTADO POR NOMBRE
  // =========================================================

  async obtenerEstadoPorNombre(
    estado
  ) {
    const pool = await poolPromise;

    const resultado = await pool
      .request()
      .input(
        "estado",
        sql.NVarChar(50),
        estado
      )
      .query(`
        SELECT
          IdEstadoPropiedad
            AS idEstadoPropiedad,

          Nombre
            AS nombre,

          Descripcion
            AS descripcion

        FROM dbo.EstadosPropiedad

        WHERE
          Nombre = @estado;
      `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  // =========================================================
  // CREAR
  // =========================================================

  async crear(
    datos,
    idEstadoPropiedad
  ) {
    const pool = await poolPromise;

    const resultado = await pool
      .request()
      .input(
        "nombre",
        sql.NVarChar(100),
        datos.nombre
      )
      .input(
        "tipo",
        sql.NVarChar(50),
        datos.tipo
      )
      .input(
        "direccion",
        sql.NVarChar(200),
        datos.direccion
      )
      .input(
        "ciudad",
        sql.NVarChar(100),
        datos.ciudad
      )
      .input(
        "provincia",
        sql.NVarChar(100),
        datos.provincia
      )
      .input(
        "capacidadMaxima",
        sql.Int,
        Number(
          datos.capacidadMaxima
        )
      )
      .input(
        "precioBase",
        sql.Decimal(18, 2),
        Number(
          datos.precioBase
        )
      )
      .input(
        "idEstadoPropiedad",
        sql.Int,
        Number(
          idEstadoPropiedad
        )
      )
      .query(`
        INSERT INTO dbo.Propiedades (
          Nombre,
          Tipo,
          Direccion,
          Ciudad,
          Provincia,
          CapacidadMaxima,
          PrecioBase,
          IdEstadoPropiedad,
          FechaCreacion
        )

        OUTPUT
          INSERTED.IdPropiedad
            AS idPropiedad

        VALUES (
          @nombre,
          @tipo,
          @direccion,
          @ciudad,
          @provincia,
          @capacidadMaxima,
          @precioBase,
          @idEstadoPropiedad,
          SYSDATETIME()
        );
      `);

    const idPropiedad =
      resultado.recordset[0]
        .idPropiedad;

    return this.obtenerPorId(
      idPropiedad
    );
  }

  // =========================================================
  // ACTUALIZAR
  // =========================================================

  async actualizar(
    idPropiedad,
    datos,
    idEstadoPropiedad
  ) {
    const pool = await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedad",
        sql.Int,
        Number(
          idPropiedad
        )
      )
      .input(
        "nombre",
        sql.NVarChar(100),
        datos.nombre
      )
      .input(
        "tipo",
        sql.NVarChar(50),
        datos.tipo
      )
      .input(
        "direccion",
        sql.NVarChar(200),
        datos.direccion
      )
      .input(
        "ciudad",
        sql.NVarChar(100),
        datos.ciudad
      )
      .input(
        "provincia",
        sql.NVarChar(100),
        datos.provincia
      )
      .input(
        "capacidadMaxima",
        sql.Int,
        Number(
          datos.capacidadMaxima
        )
      )
      .input(
        "precioBase",
        sql.Decimal(18, 2),
        Number(
          datos.precioBase
        )
      )
      .input(
        "idEstadoPropiedad",
        sql.Int,
        Number(
          idEstadoPropiedad
        )
      )
      .query(`
        UPDATE dbo.Propiedades

        SET
          Nombre = @nombre,
          Tipo = @tipo,
          Direccion = @direccion,
          Ciudad = @ciudad,
          Provincia = @provincia,
          CapacidadMaxima = @capacidadMaxima,
          PrecioBase = @precioBase,
          IdEstadoPropiedad = @idEstadoPropiedad

        WHERE
          IdPropiedad =
            @idPropiedad;
      `);

    return this.obtenerPorId(
      idPropiedad
    );
  }

  // =========================================================
  // CAMBIAR ESTADO
  // =========================================================

  async cambiarEstado(
    idPropiedad,
    idEstadoPropiedad
  ) {
    const pool = await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedad",
        sql.Int,
        Number(
          idPropiedad
        )
      )
      .input(
        "idEstadoPropiedad",
        sql.Int,
        Number(
          idEstadoPropiedad
        )
      )
      .query(`
        UPDATE dbo.Propiedades

        SET
          IdEstadoPropiedad =
            @idEstadoPropiedad

        WHERE
          IdPropiedad =
            @idPropiedad;
      `);

    return this.obtenerPorId(
      idPropiedad
    );
  }
}

module.exports =
  new PropiedadRepository();