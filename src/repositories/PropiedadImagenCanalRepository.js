const {
  poolPromise,
  sql,
} = require("../config/database");

class PropiedadImagenCanalRepository {
  // =========================================================
  // OBTENER VINCULACIONES DE UNA IMAGEN
  // =========================================================

  async obtenerPorImagen(
    idPropiedadImagen
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idPropiedadImagen",
          sql.Int,
          Number(idPropiedadImagen)
        )
        .query(`
          SELECT
            pic.IdPropiedadImagenCanal
              AS idPropiedadImagenCanal,

            pic.IdPropiedadImagen
              AS idPropiedadImagen,

            pic.IdCanalReserva
              AS idCanalReserva,

            cr.Nombre
              AS canal,

            pic.IdExterno
              AS idExterno,

            pic.EstadoSincronizacion
              AS estadoSincronizacion,

            pic.UltimaSincronizacion
              AS ultimaSincronizacion,

            pic.MensajeError
              AS mensajeError,

            pic.FechaCreacion
              AS fechaCreacion,

            pic.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.PropiedadImagenCanales pic

          INNER JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               pic.IdCanalReserva

          WHERE
            pic.IdPropiedadImagen =
              @idPropiedadImagen

          ORDER BY
            cr.Nombre;
        `);

    return resultado.recordset;
  }

  // =========================================================
  // OBTENER VINCULACIÓN IMAGEN + CANAL
  // =========================================================

  async obtenerPorImagenYCanal(
    idPropiedadImagen,
    canal
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idPropiedadImagen",
          sql.Int,
          Number(idPropiedadImagen)
        )
        .input(
          "canal",
          sql.NVarChar(50),
          canal
        )
        .query(`
          SELECT
            pic.IdPropiedadImagenCanal
              AS idPropiedadImagenCanal,

            pic.IdPropiedadImagen
              AS idPropiedadImagen,

            pic.IdCanalReserva
              AS idCanalReserva,

            cr.Nombre
              AS canal,

            pic.IdExterno
              AS idExterno,

            pic.EstadoSincronizacion
              AS estadoSincronizacion,

            pic.UltimaSincronizacion
              AS ultimaSincronizacion,

            pic.MensajeError
              AS mensajeError,

            pic.FechaCreacion
              AS fechaCreacion,

            pic.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.PropiedadImagenCanales pic

          INNER JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               pic.IdCanalReserva

          WHERE
            pic.IdPropiedadImagen =
              @idPropiedadImagen

            AND cr.Nombre =
              @canal;
        `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  // =========================================================
  // BUSCAR POR CANAL + ID EXTERNO
  // =========================================================
  //
  // Esto será fundamental para:
  //
  // Airbnb → HostFlow
  // Booking → HostFlow
  //
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
            pic.IdPropiedadImagenCanal
              AS idPropiedadImagenCanal,

            pic.IdPropiedadImagen
              AS idPropiedadImagen,

            pic.IdCanalReserva
              AS idCanalReserva,

            cr.Nombre
              AS canal,

            pic.IdExterno
              AS idExterno,

            pic.EstadoSincronizacion
              AS estadoSincronizacion,

            pic.UltimaSincronizacion
              AS ultimaSincronizacion,

            pic.MensajeError
              AS mensajeError,

            pic.FechaCreacion
              AS fechaCreacion,

            pic.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.PropiedadImagenCanales pic

          INNER JOIN dbo.CanalesReserva cr
            ON cr.IdCanalReserva =
               pic.IdCanalReserva

          WHERE
            cr.Nombre =
              @canal

            AND pic.IdExterno =
              @idExterno;
        `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  // =========================================================
  // INICIAR SINCRONIZACIÓN
  // =========================================================

  async iniciarSincronizacion(
    idPropiedadImagen,
    canal
  ) {
    /*
     * Si ya existe la vinculación,
     * simplemente la devolvemos.
     */
    const existente =
      await this.obtenerPorImagenYCanal(
        idPropiedadImagen,
        canal
      );

    if (existente) {
      return existente;
    }

    const pool =
      await poolPromise;

    const canalResultado =
      await pool
        .request()
        .input(
          "canal",
          sql.NVarChar(50),
          canal
        )
        .query(`
          SELECT
            IdCanalReserva
              AS idCanalReserva

          FROM dbo.CanalesReserva

          WHERE
            Nombre = @canal

            AND EsExterno = 1;
        `);

    const canalEncontrado =
      canalResultado.recordset[0];

    if (!canalEncontrado) {
      throw new Error(
        "El canal indicado no existe o no es un canal externo."
      );
    }

    await pool
      .request()
      .input(
        "idPropiedadImagen",
        sql.Int,
        Number(idPropiedadImagen)
      )
      .input(
        "idCanalReserva",
        sql.Int,
        canalEncontrado
          .idCanalReserva
      )
      .query(`
        INSERT INTO dbo.PropiedadImagenCanales (
          IdPropiedadImagen,
          IdCanalReserva,
          EstadoSincronizacion
        )

        VALUES (
          @idPropiedadImagen,
          @idCanalReserva,
          N'Pendiente'
        );
      `);

    return this.obtenerPorImagenYCanal(
      idPropiedadImagen,
      canal
    );
  }

  // =========================================================
  // CONFIRMAR SINCRONIZACIÓN
  // =========================================================
  //
  // Se utiliza después de que Airbnb/Booking
  // confirma que recibió la imagen.
  //
  // =========================================================

  async confirmarSincronizacion(
    idPropiedadImagen,
    canal,
    idExterno
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedadImagen",
        sql.Int,
        Number(idPropiedadImagen)
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
        UPDATE pic

        SET
          pic.IdExterno =
            @idExterno,

          pic.EstadoSincronizacion =
            N'Sincronizada',

          pic.UltimaSincronizacion =
            SYSDATETIME(),

          pic.MensajeError =
            NULL,

          pic.FechaActualizacion =
            SYSDATETIME()

        FROM dbo.PropiedadImagenCanales pic

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pic.IdCanalReserva

        WHERE
          pic.IdPropiedadImagen =
            @idPropiedadImagen

          AND cr.Nombre =
            @canal;
      `);

    return this.obtenerPorImagenYCanal(
      idPropiedadImagen,
      canal
    );
  }

  // =========================================================
  // MARCAR PENDIENTE
  // =========================================================

  async marcarPendiente(
    idPropiedadImagen,
    canal
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedadImagen",
        sql.Int,
        Number(idPropiedadImagen)
      )
      .input(
        "canal",
        sql.NVarChar(50),
        canal
      )
      .query(`
        UPDATE pic

        SET
          pic.EstadoSincronizacion =
            N'Pendiente',

          pic.MensajeError =
            NULL,

          pic.FechaActualizacion =
            SYSDATETIME()

        FROM dbo.PropiedadImagenCanales pic

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pic.IdCanalReserva

        WHERE
          pic.IdPropiedadImagen =
            @idPropiedadImagen

          AND cr.Nombre =
            @canal;
      `);

    return this.obtenerPorImagenYCanal(
      idPropiedadImagen,
      canal
    );
  }

  // =========================================================
  // MARCAR SINCRONIZADA
  // =========================================================

  async marcarSincronizada(
    idPropiedadImagen,
    canal
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedadImagen",
        sql.Int,
        Number(idPropiedadImagen)
      )
      .input(
        "canal",
        sql.NVarChar(50),
        canal
      )
      .query(`
        UPDATE pic

        SET
          pic.EstadoSincronizacion =
            N'Sincronizada',

          pic.UltimaSincronizacion =
            SYSDATETIME(),

          pic.MensajeError =
            NULL,

          pic.FechaActualizacion =
            SYSDATETIME()

        FROM dbo.PropiedadImagenCanales pic

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pic.IdCanalReserva

        WHERE
          pic.IdPropiedadImagen =
            @idPropiedadImagen

          AND cr.Nombre =
            @canal;
      `);

    return this.obtenerPorImagenYCanal(
      idPropiedadImagen,
      canal
    );
  }

  // =========================================================
  // MARCAR ERROR
  // =========================================================

  async marcarError(
    idPropiedadImagen,
    canal,
    mensajeError
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedadImagen",
        sql.Int,
        Number(idPropiedadImagen)
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
        UPDATE pic

        SET
          pic.EstadoSincronizacion =
            N'Error',

          pic.MensajeError =
            @mensajeError,

          pic.FechaActualizacion =
            SYSDATETIME()

        FROM dbo.PropiedadImagenCanales pic

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pic.IdCanalReserva

        WHERE
          pic.IdPropiedadImagen =
            @idPropiedadImagen

          AND cr.Nombre =
            @canal;
      `);

    return this.obtenerPorImagenYCanal(
      idPropiedadImagen,
      canal
    );
  }

  // =========================================================
  // MARCAR PENDIENTE DE ELIMINACIÓN
  // =========================================================

  async marcarPendienteEliminacion(
    idPropiedadImagen,
    canal
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedadImagen",
        sql.Int,
        Number(idPropiedadImagen)
      )
      .input(
        "canal",
        sql.NVarChar(50),
        canal
      )
      .query(`
        UPDATE pic

        SET
          pic.EstadoSincronizacion =
            N'PendienteEliminacion',

          pic.MensajeError =
            NULL,

          pic.FechaActualizacion =
            SYSDATETIME()

        FROM dbo.PropiedadImagenCanales pic

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pic.IdCanalReserva

        WHERE
          pic.IdPropiedadImagen =
            @idPropiedadImagen

          AND cr.Nombre =
            @canal;
      `);

    return this.obtenerPorImagenYCanal(
      idPropiedadImagen,
      canal
    );
  }

  // =========================================================
  // ELIMINAR VINCULACIÓN
  // =========================================================
  //
  // Solamente se utilizará cuando el proveedor
  // haya confirmado que la imagen fue eliminada
  // correctamente en ese canal.
  //
  // A diferencia de PropiedadImagenes, acá sí
  // podemos borrar la vinculación porque el recurso
  // externo ya dejó de existir.
  // =========================================================

  async eliminarVinculacion(
    idPropiedadImagen,
    canal
  ) {
    const vinculacion =
      await this.obtenerPorImagenYCanal(
        idPropiedadImagen,
        canal
      );

    if (!vinculacion) {
      return null;
    }

    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idPropiedadImagen",
        sql.Int,
        Number(idPropiedadImagen)
      )
      .input(
        "canal",
        sql.NVarChar(50),
        canal
      )
      .query(`
        DELETE pic

        FROM dbo.PropiedadImagenCanales pic

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pic.IdCanalReserva

        WHERE
          pic.IdPropiedadImagen =
            @idPropiedadImagen

          AND cr.Nombre =
            @canal;
      `);

    return vinculacion;
  }
}

module.exports =
  new PropiedadImagenCanalRepository();