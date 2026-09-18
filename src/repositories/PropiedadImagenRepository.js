const {
  poolPromise,
  sql,
} = require("../config/database");

class PropiedadImagenRepository {
  // =========================================================
  // OBTENER IMÁGENES ACTIVAS DE UNA PROPIEDAD
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
            IdPropiedadImagen
              AS idPropiedadImagen,

            IdPropiedad
              AS idPropiedad,

            UrlImagen
              AS urlImagen,

            Descripcion
              AS descripcion,

            Orden
              AS orden,

            EsPrincipal
              AS esPrincipal,

            Origen
              AS origen,

            Estado
              AS estado,

            FechaCreacion
              AS fechaCreacion,

            FechaActualizacion
              AS fechaActualizacion

          FROM dbo.PropiedadImagenes

          WHERE
            IdPropiedad = @idPropiedad

            AND Estado = N'Activa'

          ORDER BY
            EsPrincipal DESC,
            Orden ASC,
            IdPropiedadImagen ASC;
        `);

    return resultado.recordset;
  }

  // =========================================================
  // OBTENER TODAS LAS IMÁGENES
  // INCLUYE PENDIENTES Y ELIMINADAS
  // =========================================================

  async obtenerTodasPorPropiedad(
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
            IdPropiedadImagen
              AS idPropiedadImagen,

            IdPropiedad
              AS idPropiedad,

            UrlImagen
              AS urlImagen,

            Descripcion
              AS descripcion,

            Orden
              AS orden,

            EsPrincipal
              AS esPrincipal,

            Origen
              AS origen,

            Estado
              AS estado,

            FechaCreacion
              AS fechaCreacion,

            FechaActualizacion
              AS fechaActualizacion

          FROM dbo.PropiedadImagenes

          WHERE
            IdPropiedad = @idPropiedad

          ORDER BY
            Orden ASC,
            IdPropiedadImagen ASC;
        `);

    return resultado.recordset;
  }

  // =========================================================
  // OBTENER IMAGEN POR ID
  // =========================================================

  async obtenerPorId(
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
            IdPropiedadImagen
              AS idPropiedadImagen,

            IdPropiedad
              AS idPropiedad,

            UrlImagen
              AS urlImagen,

            Descripcion
              AS descripcion,

            Orden
              AS orden,

            EsPrincipal
              AS esPrincipal,

            Origen
              AS origen,

            Estado
              AS estado,

            FechaCreacion
              AS fechaCreacion,

            FechaActualizacion
              AS fechaActualizacion

          FROM dbo.PropiedadImagenes

          WHERE
            IdPropiedadImagen =
              @idPropiedadImagen;
        `);

    return (
      resultado.recordset[0] ||
      null
    );
  }

  // =========================================================
  // CREAR IMAGEN
  // =========================================================

  async crear(
    datos
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idPropiedad",
          sql.Int,
          Number(datos.idPropiedad)
        )
        .input(
          "urlImagen",
          sql.NVarChar(1000),
          datos.urlImagen
        )
        .input(
          "descripcion",
          sql.NVarChar(250),
          datos.descripcion || null
        )
        .input(
          "orden",
          sql.Int,
          Number(datos.orden) || 0
        )
        .input(
          "esPrincipal",
          sql.Bit,
          datos.esPrincipal === true
        )
        .input(
          "origen",
          sql.NVarChar(50),
          datos.origen || "Manual"
        )
        .query(`
          INSERT INTO dbo.PropiedadImagenes (
            IdPropiedad,
            UrlImagen,
            Descripcion,
            Orden,
            EsPrincipal,
            Origen,
            Estado
          )

          OUTPUT
            INSERTED.IdPropiedadImagen
              AS idPropiedadImagen

          VALUES (
            @idPropiedad,
            @urlImagen,
            @descripcion,
            @orden,
            @esPrincipal,
            @origen,
            N'Activa'
          );
        `);

    const idPropiedadImagen =
      resultado.recordset[0]
        .idPropiedadImagen;

    return this.obtenerPorId(
      idPropiedadImagen
    );
  }

  // =========================================================
  // ACTUALIZAR IMAGEN
  // =========================================================

  async actualizar(
    idPropiedadImagen,
    datos
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
        "urlImagen",
        sql.NVarChar(1000),
        datos.urlImagen
      )
      .input(
        "descripcion",
        sql.NVarChar(250),
        datos.descripcion || null
      )
      .input(
        "orden",
        sql.Int,
        Number(datos.orden) || 0
      )
      .query(`
        UPDATE dbo.PropiedadImagenes

        SET
          UrlImagen =
            @urlImagen,

          Descripcion =
            @descripcion,

          Orden =
            @orden,

          FechaActualizacion =
            SYSDATETIME()

        WHERE
          IdPropiedadImagen =
            @idPropiedadImagen

          AND Estado =
            N'Activa';
      `);

    return this.obtenerPorId(
      idPropiedadImagen
    );
  }

  // =========================================================
  // ESTABLECER IMAGEN PRINCIPAL
  // =========================================================

  async establecerPrincipal(
    idPropiedad,
    idPropiedadImagen
  ) {
    const pool =
      await poolPromise;

    const transaction =
      new sql.Transaction(
        pool
      );

    await transaction.begin();

    try {
      /*
       * Quitamos primero la principal actual,
       * pero solamente entre imágenes activas.
       */
      await new sql.Request(
        transaction
      )
        .input(
          "idPropiedad",
          sql.Int,
          Number(idPropiedad)
        )
        .query(`
          UPDATE dbo.PropiedadImagenes

          SET
            EsPrincipal = 0,
            FechaActualizacion =
              SYSDATETIME()

          WHERE
            IdPropiedad =
              @idPropiedad

            AND Estado =
              N'Activa'

            AND EsPrincipal = 1;
        `);

      /*
       * La nueva principal también debe estar
       * activa y pertenecer a la propiedad.
       */
      const resultado =
        await new sql.Request(
          transaction
        )
          .input(
            "idPropiedad",
            sql.Int,
            Number(idPropiedad)
          )
          .input(
            "idPropiedadImagen",
            sql.Int,
            Number(
              idPropiedadImagen
            )
          )
          .query(`
            UPDATE dbo.PropiedadImagenes

            SET
              EsPrincipal = 1,
              FechaActualizacion =
                SYSDATETIME()

            WHERE
              IdPropiedadImagen =
                @idPropiedadImagen

              AND IdPropiedad =
                @idPropiedad

              AND Estado =
                N'Activa';

            SELECT
              @@ROWCOUNT
                AS filasAfectadas;
          `);

      const filasAfectadas =
        resultado.recordset[0]
          .filasAfectadas;

      if (
        filasAfectadas === 0
      ) {
        throw new Error(
          "La imagen no pertenece a la propiedad o no se encuentra activa."
        );
      }

      await transaction.commit();

      return this.obtenerPorId(
        idPropiedadImagen
      );
    } catch (error) {
      await transaction.rollback();

      throw error;
    }
  }

  // =========================================================
  // CAMBIAR ORDEN
  // =========================================================

  async cambiarOrden(
    idPropiedadImagen,
    orden
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
        "orden",
        sql.Int,
        Number(orden)
      )
      .query(`
        UPDATE dbo.PropiedadImagenes

        SET
          Orden =
            @orden,

          FechaActualizacion =
            SYSDATETIME()

        WHERE
          IdPropiedadImagen =
            @idPropiedadImagen

          AND Estado =
            N'Activa';
      `);

    return this.obtenerPorId(
      idPropiedadImagen
    );
  }

  // =========================================================
  // MARCAR PENDIENTE DE ELIMINACIÓN
  // =========================================================

  async marcarPendienteEliminacion(
    idPropiedadImagen
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
      .query(`
        UPDATE dbo.PropiedadImagenes

        SET
          Estado =
            N'PendienteEliminacion',

          EsPrincipal =
            0,

          FechaActualizacion =
            SYSDATETIME()

        WHERE
          IdPropiedadImagen =
            @idPropiedadImagen

          AND Estado =
            N'Activa';
      `);

    return this.obtenerPorId(
      idPropiedadImagen
    );
  }

  // =========================================================
  // MARCAR ELIMINADA
  // =========================================================

  async marcarEliminada(
    idPropiedadImagen
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
      .query(`
        UPDATE dbo.PropiedadImagenes

        SET
          Estado =
            N'Eliminada',

          EsPrincipal =
            0,

          FechaActualizacion =
            SYSDATETIME()

        WHERE
          IdPropiedadImagen =
            @idPropiedadImagen

          AND Estado IN (
            N'Activa',
            N'PendienteEliminacion'
          );
      `);

    return this.obtenerPorId(
      idPropiedadImagen
    );
  }

  // =========================================================
  // RESTAURAR IMAGEN
  // =========================================================

  async restaurar(
    idPropiedadImagen
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
      .query(`
        UPDATE dbo.PropiedadImagenes

        SET
          Estado =
            N'Activa',

          /*
           * Restaurar una imagen no la vuelve
           * principal automáticamente.
           */
          EsPrincipal =
            0,

          FechaActualizacion =
            SYSDATETIME()

        WHERE
          IdPropiedadImagen =
            @idPropiedadImagen

          AND Estado IN (
            N'PendienteEliminacion',
            N'Eliminada'
          );
      `);

    return this.obtenerPorId(
      idPropiedadImagen
    );
  }
}

module.exports =
  new PropiedadImagenRepository();