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

async obtenerPropiedadPorId(idPropiedad) {
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
        p.CapacidadMaxima AS capacidadMaxima,
        ep.Nombre AS estado

      FROM dbo.Propiedades p

      INNER JOIN dbo.EstadosPropiedad ep
        ON p.IdEstadoPropiedad =
           ep.IdEstadoPropiedad

      WHERE p.IdPropiedad = @idPropiedad;
    `);

  return resultado.recordset[0] || null;
}

async obtenerHuespedPorId(idHuesped) {
  const pool = await poolPromise;

  const resultado = await pool
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
        Telefono AS telefono

      FROM dbo.Huespedes

      WHERE IdHuesped = @idHuesped;
    `);

  return resultado.recordset[0] || null;
}
async obtenerHuespedPorNombreYApellido(
  nombre,
  apellido
) {
  const pool = await poolPromise;

  const resultado =
    await pool
      .request()
      .input(
        "nombre",
        sql.NVarChar(100),
        nombre
      )
      .input(
        "apellido",
        sql.NVarChar(100),
        apellido
      )
      .query(`
        SELECT TOP 1
          IdHuesped AS idHuesped,
          Nombre AS nombre,
          Apellido AS apellido,
          Email AS email,
          Telefono AS telefono,
          Documento AS documento,
          Nacionalidad AS nacionalidad

        FROM dbo.Huespedes

        WHERE
          Nombre = @nombre
          AND
          Apellido = @apellido

        ORDER BY IdHuesped ASC;
      `);

  return (
    resultado.recordset[0] ||
    null
  );
}
async existeConflictoFechas(
  idPropiedad,
  fechaIngreso,
  fechaEgreso,
  idReservaIgnorada = null
) {
  const pool = await poolPromise;

  const request = pool
    .request()
    .input(
      "idPropiedad",
      sql.Int,
      Number(idPropiedad)
    )
    .input(
      "fechaIngreso",
      sql.Date,
      fechaIngreso
    )
    .input(
      "fechaEgreso",
      sql.Date,
      fechaEgreso
    );

  let condicionReservaIgnorada = "";

  if (idReservaIgnorada !== null) {
    request.input(
      "idReservaIgnorada",
      sql.Int,
      Number(idReservaIgnorada)
    );

    condicionReservaIgnorada = `
      AND r.IdReserva <> @idReservaIgnorada
    `;
  }

  const resultado =
    await request.query(`
      SELECT COUNT(*) AS cantidad

      FROM dbo.Reservas r

      INNER JOIN dbo.EstadosReserva er
        ON r.IdEstadoReserva =
           er.IdEstadoReserva

      WHERE
        r.IdPropiedad = @idPropiedad

        AND er.Nombre <> N'Cancelada'

        ${condicionReservaIgnorada}

        AND @fechaIngreso < r.FechaEgreso
        AND @fechaEgreso > r.FechaIngreso;
    `);

  return (
    Number(
      resultado.recordset[0].cantidad
    ) > 0
  );
}
async crearHuespedExterno(datos) {
  const pool = await poolPromise;

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
        datos.email || null
      )
      .input(
        "telefono",
        sql.NVarChar(50),
        datos.telefono || null
      )
      .input(
        "documento",
        sql.NVarChar(100),
        datos.documento || null
      )
      .input(
        "nacionalidad",
        sql.NVarChar(100),
        datos.nacionalidad || null
      )
      .query(`
        INSERT INTO dbo.Huespedes (
          Nombre,
          Apellido,
          Email,
          Telefono,
          Documento,
          Nacionalidad,
          FechaCreacion
        )
        OUTPUT
          INSERTED.IdHuesped
            AS idHuesped,
          INSERTED.Nombre
            AS nombre,
          INSERTED.Apellido
            AS apellido,
          INSERTED.Email
            AS email,
          INSERTED.Telefono
            AS telefono,
          INSERTED.Documento
            AS documento,
          INSERTED.Nacionalidad
            AS nacionalidad

        VALUES (
          @nombre,
          @apellido,
          @email,
          @telefono,
          @documento,
          @nacionalidad,
          SYSDATETIME()
        );
      `);

  return resultado.recordset[0];
}
async crearReservaManual(datos) {
  const pool = await poolPromise;

  const resultado = await pool
    .request()
    .input(
      "idPropiedad",
      sql.Int,
      Number(datos.idPropiedad)
    )
    .input(
      "idHuesped",
      sql.Int,
      Number(datos.idHuesped)
    )
    .input(
      "fechaIngreso",
      sql.Date,
      datos.fechaIngreso
    )
    .input(
      "fechaEgreso",
      sql.Date,
      datos.fechaEgreso
    )
    .input(
      "cantidadHuespedes",
      sql.Int,
      Number(datos.cantidadHuespedes)
    )
    .input(
      "montoEstimado",
      sql.Decimal(18, 2),
      Number(datos.montoEstimado)
    )
    .query(`
      DECLARE @IdCanalManual INT;

      DECLARE @IdEstadoConfirmada INT;

      SELECT
        @IdCanalManual =
          IdCanalReserva
      FROM dbo.CanalesReserva
      WHERE Nombre = N'Manual';

      SELECT
        @IdEstadoConfirmada =
          IdEstadoReserva
      FROM dbo.EstadosReserva
      WHERE Nombre = N'Confirmada';

      INSERT INTO dbo.Reservas (
        IdPropiedad,
        IdHuesped,
        IdCanalReserva,
        IdEstadoReserva,
        FechaIngreso,
        FechaEgreso,
        CantidadHuespedes,
        MontoEstimado,
        IdExterno,
        EstadoSincronizacion
      )
      OUTPUT
        INSERTED.IdReserva AS idReserva
      VALUES (
        @idPropiedad,
        @idHuesped,
        @IdCanalManual,
        @IdEstadoConfirmada,
        @fechaIngreso,
        @fechaEgreso,
        @cantidadHuespedes,
        @montoEstimado,
        NULL,
        N'Solo HostFlow'
      );
    `);

  const idReserva =
    resultado.recordset[0].idReserva;

  return this.obtenerPorId(idReserva);
}

async actualizarReservaManual(
  idReserva,
  datos
) {
  const pool = await poolPromise;

  await pool
    .request()
    .input(
      "idReserva",
      sql.Int,
      Number(idReserva)
    )
    .input(
      "fechaIngreso",
      sql.Date,
      datos.fechaIngreso
    )
    .input(
      "fechaEgreso",
      sql.Date,
      datos.fechaEgreso
    )
    .input(
      "estado",
      sql.NVarChar(50),
      datos.estado
    )
    .input(
      "montoEstimado",
      sql.Decimal(18, 2),
      Number(datos.montoEstimado)
    )
    .query(`
      DECLARE @IdEstadoReserva INT;

      SELECT
        @IdEstadoReserva =
          IdEstadoReserva
      FROM dbo.EstadosReserva
      WHERE Nombre = @estado;

      IF @IdEstadoReserva IS NULL
      BEGIN
        THROW 50001,
          'El estado indicado no existe.',
          1;
      END;

      UPDATE dbo.Reservas
      SET
        FechaIngreso = @fechaIngreso,
        FechaEgreso = @fechaEgreso,
        IdEstadoReserva = @IdEstadoReserva,
        MontoEstimado = @montoEstimado,
        FechaActualizacion = SYSDATETIME()

      WHERE IdReserva = @idReserva;
    `);

  return this.obtenerPorId(idReserva);
}
async cancelarReservaManual(idReserva) {
  const pool = await poolPromise;

  await pool
    .request()
    .input(
      "idReserva",
      sql.Int,
      Number(idReserva)
    )
    .query(`
      DECLARE @IdEstadoCancelada INT;

      SELECT
        @IdEstadoCancelada =
          IdEstadoReserva
      FROM dbo.EstadosReserva
      WHERE Nombre = N'Cancelada';

      IF @IdEstadoCancelada IS NULL
      BEGIN
        THROW 50001,
          'No existe el estado Cancelada.',
          1;
      END;

      UPDATE dbo.Reservas
      SET
        IdEstadoReserva = @IdEstadoCancelada,
        FechaActualizacion = SYSDATETIME()

      WHERE IdReserva = @idReserva;
    `);

  return this.obtenerPorId(idReserva);
}
async sincronizarCambioExterno(
  idReserva,
  datos
) {
  const pool = await poolPromise;

  await pool
    .request()
    .input(
      "idReserva",
      sql.Int,
      Number(idReserva)
    )
    .input(
      "fechaIngreso",
      sql.Date,
      datos.fechaIngreso
    )
    .input(
      "fechaEgreso",
      sql.Date,
      datos.fechaEgreso
    )
    .input(
      "cantidadHuespedes",
      sql.Int,
      Number(datos.cantidadHuespedes)
    )
    .input(
      "montoEstimado",
      sql.Decimal(18, 2),
      Number(datos.montoEstimado)
    )
    .input(
      "estadoSincronizacion",
      sql.NVarChar(50),
      "Sincronizada"
    )
    .query(`
      UPDATE dbo.Reservas
      SET
        FechaIngreso = @fechaIngreso,
        FechaEgreso = @fechaEgreso,
        CantidadHuespedes = @cantidadHuespedes,
        MontoEstimado = @montoEstimado,
        EstadoSincronizacion = @estadoSincronizacion,
        FechaActualizacion = SYSDATETIME()
      WHERE IdReserva = @idReserva;
    `);

  return this.obtenerPorId(idReserva);
}
async actualizarEstadoSincronizacion(
  idReserva,
  estadoSincronizacion
) {
  const pool = await poolPromise;

  await pool
    .request()
    .input(
      "idReserva",
      sql.Int,
      Number(idReserva)
    )
    .input(
      "estadoSincronizacion",
      sql.NVarChar(50),
      estadoSincronizacion
    )
    .query(`
      UPDATE dbo.Reservas
      SET
        EstadoSincronizacion =
          @estadoSincronizacion,
        FechaActualizacion =
          SYSDATETIME()
      WHERE IdReserva = @idReserva;
    `);

  return this.obtenerPorId(idReserva);
}
async sincronizarEstadoExterno(
  idReserva,
  estado
) {
  const pool = await poolPromise;

  await pool
    .request()
    .input(
      "idReserva",
      sql.Int,
      Number(idReserva)
    )
    .input(
      "estado",
      sql.NVarChar(50),
      estado
    )
    .query(`
      DECLARE @IdEstadoReserva INT;

      SELECT
        @IdEstadoReserva =
          IdEstadoReserva
      FROM dbo.EstadosReserva
      WHERE Nombre = @estado;

      IF @IdEstadoReserva IS NULL
      BEGIN
        THROW 50001,
          'El estado indicado no existe.',
          1;
      END;

      UPDATE dbo.Reservas
      SET
        IdEstadoReserva =
          @IdEstadoReserva,

        EstadoSincronizacion =
          N'Sincronizada',

        FechaActualizacion =
          SYSDATETIME()

      WHERE IdReserva = @idReserva;
    `);

  return this.obtenerPorId(
    idReserva
  );
}
async obtenerPorCanalEIdExterno(
  canal,
  idExterno
) {
  const pool = await poolPromise;

  const resultado =
    await pool
      .request()
      .input(
        "canal",
        sql.NVarChar(50),
        canal
      )
      .input(
        "idExterno",
        sql.NVarChar(150),
        idExterno
      )
      .query(`
        SELECT
          r.IdReserva AS idReserva,
          r.IdPropiedad AS idPropiedad,
          p.Nombre AS propiedad,

          r.IdHuesped AS idHuesped,
          CONCAT(
            h.Nombre,
            ' ',
            h.Apellido
          ) AS huesped,

          cr.Nombre AS canal,
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
          cr.Nombre = @canal
          AND
          r.IdExterno = @idExterno;
      `);

  return (
    resultado.recordset[0] ||
    null
  );
}
async crearReservaExterna(datos) {
  const pool = await poolPromise;

  const resultado =
    await pool
      .request()
      .input(
        "idPropiedad",
        sql.Int,
        Number(datos.idPropiedad)
      )
      .input(
        "idHuesped",
        sql.Int,
        Number(datos.idHuesped)
      )
      .input(
        "canal",
        sql.NVarChar(50),
        datos.canal
      )
      .input(
        "estado",
        sql.NVarChar(50),
        datos.estado || "Confirmada"
      )
      .input(
        "fechaIngreso",
        sql.Date,
        datos.fechaIngreso
      )
      .input(
        "fechaEgreso",
        sql.Date,
        datos.fechaEgreso
      )
      .input(
        "cantidadHuespedes",
        sql.Int,
        Number(datos.cantidadHuespedes) || 1
      )
      .input(
        "montoEstimado",
        sql.Decimal(18, 2),
        Number(datos.montoEstimado) || 0
      )
      .input(
        "idExterno",
        sql.NVarChar(150),
        datos.idExterno
      )
      .query(`
        DECLARE @IdCanalReserva INT;
        DECLARE @IdEstadoReserva INT;

        SELECT
          @IdCanalReserva =
            IdCanalReserva
        FROM dbo.CanalesReserva
        WHERE Nombre = @canal;

        IF @IdCanalReserva IS NULL
        BEGIN
          THROW 50001,
            'El canal indicado no existe.',
            1;
        END;

        SELECT
          @IdEstadoReserva =
            IdEstadoReserva
        FROM dbo.EstadosReserva
        WHERE Nombre = @estado;

        IF @IdEstadoReserva IS NULL
        BEGIN
          THROW 50002,
            'El estado indicado no existe.',
            1;
        END;

        INSERT INTO dbo.Reservas (
          IdPropiedad,
          IdHuesped,
          IdCanalReserva,
          IdEstadoReserva,
          FechaIngreso,
          FechaEgreso,
          CantidadHuespedes,
          MontoEstimado,
          IdExterno,
          EstadoSincronizacion,
          FechaCreacion
        )
        OUTPUT INSERTED.IdReserva
        VALUES (
          @idPropiedad,
          @idHuesped,
          @IdCanalReserva,
          @IdEstadoReserva,
          @fechaIngreso,
          @fechaEgreso,
          @cantidadHuespedes,
          @montoEstimado,
          @idExterno,
          N'Sincronizada',
          SYSDATETIME()
        );
      `);

  const idReserva =
    resultado.recordset[0].IdReserva;

  return this.obtenerPorId(
    idReserva
  );
}
}

module.exports = new ReservaRepository();