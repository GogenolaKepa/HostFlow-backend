const {
  poolPromise,
  sql,
} = require("../config/database");

class PropiedadCanalRepository {
  // =========================================================
  // OBTENER CANALES EXTERNOS DE UNA PROPIEDAD
  // =========================================================

  async obtenerPorPropiedad(
    idPropiedad
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idPropiedad",
          sql.Int,
          Number(idPropiedad)
        )
        .query(`
          SELECT
            cr.IdCanalReserva
              AS idCanalReserva,

            cr.Nombre
              AS canal,

            pc.IdPropiedadCanal
              AS idPropiedadCanal,

            pc.IdExterno
              AS idExterno,

            CASE
              WHEN pc.IdPropiedadCanal IS NULL
                THEN N'No publicada'
              ELSE pc.EstadoPublicacion
            END
              AS estadoPublicacion,

            CASE
              WHEN pc.IdPropiedadCanal IS NULL
                THEN N'No aplica'
              ELSE pc.EstadoSincronizacion
            END
              AS estadoSincronizacion,

            pc.UltimaSincronizacion
              AS ultimaSincronizacion,

            pc.MensajeError
              AS mensajeError,

            pc.FechaCreacion
              AS fechaCreacion,

            pc.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.CanalesReserva cr

          LEFT JOIN dbo.PropiedadCanales pc
            ON pc.IdCanalReserva =
               cr.IdCanalReserva
           AND pc.IdPropiedad =
               @idPropiedad

          WHERE
            cr.EsExterno = 1

          ORDER BY
            cr.IdCanalReserva ASC;
        `);

    return resultado.recordset;
  }

  // =========================================================
  // OBTENER VÍNCULO POR PROPIEDAD Y CANAL
  // =========================================================

  async obtenerPorPropiedadYCanal(
    idPropiedad,
    canal
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idPropiedad",
          sql.Int,
          Number(idPropiedad)
        )
        .input(
          "canal",
          sql.NVarChar(50),
          canal
        )
        .query(`
          SELECT
            pc.IdPropiedadCanal
              AS idPropiedadCanal,

            pc.IdPropiedad
              AS idPropiedad,

            cr.IdCanalReserva
              AS idCanalReserva,

            cr.Nombre
              AS canal,

            pc.IdExterno
              AS idExterno,

            pc.EstadoPublicacion
              AS estadoPublicacion,

            pc.EstadoSincronizacion
              AS estadoSincronizacion,

            pc.UltimaSincronizacion
              AS ultimaSincronizacion,

            pc.MensajeError
              AS mensajeError,

            pc.FechaCreacion
              AS fechaCreacion,

            pc.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.PropiedadCanales pc

          INNER JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               pc.IdCanalReserva

          WHERE
            pc.IdPropiedad =
              @idPropiedad

            AND cr.Nombre =
              @canal;
        `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  // =========================================================
  // OBTENER POR CANAL + ID EXTERNO
  // =========================================================

  async obtenerPorCanalEIdExterno(
    canal,
    idExterno
  ) {
    const pool =
      await poolPromise;

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
            pc.IdPropiedadCanal
              AS idPropiedadCanal,

            pc.IdPropiedad
              AS idPropiedad,

            p.Nombre
              AS propiedad,

            cr.IdCanalReserva
              AS idCanalReserva,

            cr.Nombre
              AS canal,

            pc.IdExterno
              AS idExterno,

            pc.EstadoPublicacion
              AS estadoPublicacion,

            pc.EstadoSincronizacion
              AS estadoSincronizacion,

            pc.UltimaSincronizacion
              AS ultimaSincronizacion,

            pc.MensajeError
              AS mensajeError

          FROM dbo.PropiedadCanales pc

          INNER JOIN dbo.Propiedades p
            ON p.IdPropiedad =
               pc.IdPropiedad

          INNER JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               pc.IdCanalReserva

          WHERE
            cr.Nombre = @canal

            AND pc.IdExterno =
              @idExterno;
        `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  // =========================================================
  // INICIAR PUBLICACIÓN / VINCULACIÓN
  // =========================================================

  async iniciarPublicacion(
    idPropiedad,
    canal
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idPropiedad",
          sql.Int,
          Number(idPropiedad)
        )
        .input(
          "canal",
          sql.NVarChar(50),
          canal
        )
        .query(`
          DECLARE @IdCanalReserva INT;

          SELECT
            @IdCanalReserva =
              IdCanalReserva
          FROM dbo.CanalesReserva
          WHERE
            Nombre = @canal
            AND EsExterno = 1;

          IF @IdCanalReserva IS NULL
          BEGIN
            THROW 50001,
              'El canal externo indicado no existe.',
              1;
          END;

          IF EXISTS (
            SELECT 1
            FROM dbo.PropiedadCanales
            WHERE
              IdPropiedad =
                @idPropiedad
              AND IdCanalReserva =
                @IdCanalReserva
          )
          BEGIN
            THROW 50002,
              'La propiedad ya está vinculada con ese canal.',
              1;
          END;

          INSERT INTO dbo.PropiedadCanales (
            IdPropiedad,
            IdCanalReserva,
            IdExterno,
            EstadoPublicacion,
            EstadoSincronizacion,
            UltimaSincronizacion,
            MensajeError,
            FechaCreacion,
            FechaActualizacion
          )
          OUTPUT
            INSERTED.IdPropiedadCanal
              AS idPropiedadCanal
          VALUES (
            @idPropiedad,
            @IdCanalReserva,
            NULL,
            N'Pendiente',
            N'Pendiente',
            NULL,
            NULL,
            SYSDATETIME(),
            SYSDATETIME()
          );
        `);

    const idPropiedadCanal =
      resultado.recordset[0]
        .idPropiedadCanal;

    return idPropiedadCanal;
  }

  // =========================================================
  // CONFIRMAR PUBLICACIÓN
  // =========================================================

  async confirmarPublicacion(
    idPropiedad,
    canal,
    idExterno
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedad",
        sql.Int,
        Number(idPropiedad)
      )
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
        UPDATE pc
        SET
          pc.IdExterno =
            @idExterno,

          pc.EstadoPublicacion =
            N'Publicada',

          pc.EstadoSincronizacion =
            N'Sincronizada',

          pc.UltimaSincronizacion =
            SYSDATETIME(),

          pc.MensajeError =
            NULL,

          pc.FechaActualizacion =
            SYSDATETIME()

        FROM dbo.PropiedadCanales pc

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pc.IdCanalReserva

        WHERE
          pc.IdPropiedad =
            @idPropiedad

          AND cr.Nombre =
            @canal;
      `);

    return this.obtenerPorPropiedadYCanal(
      idPropiedad,
      canal
    );
  }

  // =========================================================
  // MARCAR SINCRONIZACIÓN PENDIENTE
  // =========================================================

  async marcarPendiente(
    idPropiedad,
    canal
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedad",
        sql.Int,
        Number(idPropiedad)
      )
      .input(
        "canal",
        sql.NVarChar(50),
        canal
      )
      .query(`
        UPDATE pc
        SET
          pc.EstadoSincronizacion =
            N'Pendiente',

          pc.MensajeError =
            NULL,

          pc.FechaActualizacion =
            SYSDATETIME()

        FROM dbo.PropiedadCanales pc

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pc.IdCanalReserva

        WHERE
          pc.IdPropiedad =
            @idPropiedad

          AND cr.Nombre =
            @canal;
      `);

    return this.obtenerPorPropiedadYCanal(
      idPropiedad,
      canal
    );
  }
// =========================================================
// MARCAR SINCRONIZADA
// =========================================================

async marcarSincronizada(
  idPropiedad,
  canal
) {
  const pool =
    await poolPromise;

  await pool
    .request()
    .input(
      "idPropiedad",
      sql.Int,
      Number(idPropiedad)
    )
    .input(
      "canal",
      sql.NVarChar(50),
      canal
    )
    .query(`
      UPDATE pc
      SET
        pc.EstadoSincronizacion =
          N'Sincronizada',

        pc.UltimaSincronizacion =
          SYSDATETIME(),

        pc.MensajeError =
          NULL,

        pc.FechaActualizacion =
          SYSDATETIME()

      FROM dbo.PropiedadCanales pc

      INNER JOIN dbo.CanalesReserva cr
        ON cr.IdCanalReserva =
           pc.IdCanalReserva

      WHERE
        pc.IdPropiedad =
          @idPropiedad

        AND cr.Nombre =
          @canal

        AND pc.EstadoPublicacion =
          N'Publicada';
    `);

  return this.obtenerPorPropiedadYCanal(
    idPropiedad,
    canal
  );
}
  // =========================================================
  // MARCAR ERROR DE SINCRONIZACIÓN
  // =========================================================

  async marcarError(
    idPropiedad,
    canal,
    mensajeError
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedad",
        sql.Int,
        Number(idPropiedad)
      )
      .input(
        "canal",
        sql.NVarChar(50),
        canal
      )
      .input(
        "mensajeError",
        sql.NVarChar(500),
        mensajeError
      )
      .query(`
        UPDATE pc
        SET
          pc.EstadoSincronizacion =
            N'Error',

          pc.MensajeError =
            @mensajeError,

          pc.FechaActualizacion =
            SYSDATETIME()

        FROM dbo.PropiedadCanales pc

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pc.IdCanalReserva

        WHERE
          pc.IdPropiedad =
            @idPropiedad

          AND cr.Nombre =
            @canal;
      `);

    return this.obtenerPorPropiedadYCanal(
      idPropiedad,
      canal
    );
  }

  // =========================================================
  // DESPUBLICAR
  // =========================================================

  async despublicar(
    idPropiedad,
    canal
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedad",
        sql.Int,
        Number(idPropiedad)
      )
      .input(
        "canal",
        sql.NVarChar(50),
        canal
      )
      .query(`
        UPDATE pc
        SET
          pc.EstadoPublicacion =
            N'Despublicada',

          pc.EstadoSincronizacion =
            N'Sincronizada',

          pc.UltimaSincronizacion =
            SYSDATETIME(),

          pc.MensajeError =
            NULL,

          pc.FechaActualizacion =
            SYSDATETIME()

        FROM dbo.PropiedadCanales pc

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pc.IdCanalReserva

        WHERE
          pc.IdPropiedad =
            @idPropiedad

          AND cr.Nombre =
            @canal;
      `);

    return this.obtenerPorPropiedadYCanal(
      idPropiedad,
      canal
    );
  }
}

module.exports =
  new PropiedadCanalRepository();