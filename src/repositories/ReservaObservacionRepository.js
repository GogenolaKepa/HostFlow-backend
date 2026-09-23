const {
  poolPromise,
  sql,
} = require("../config/database");

class ReservaObservacionRepository {
  // =========================================================
  // CREAR OBSERVACIÓN
  // =========================================================

  async crearObservacion(datos) {
    const {
      idReserva,
      categoria = "General",
      observacion,
      fijada = false,
      autorNombre = null,
    } = datos || {};

    const idReservaNumero =
      Number(idReserva);

    if (
      !Number.isInteger(
        idReservaNumero
      ) ||
      idReservaNumero <= 0
    ) {
      throw new Error(
        "El id de la reserva es obligatorio para registrar la observación."
      );
    }

    const categoriasPermitidas = [
      "General",
      "Check-in",
      "Check-out",
      "Cobro",
      "Limpieza",
      "Mantenimiento",
      "Huesped",
      "Otro",
    ];

    if (
      !categoriasPermitidas.includes(
        categoria
      )
    ) {
      throw new Error(
        "La categoría de la observación no es válida."
      );
    }

    if (
      !observacion ||
      !String(observacion).trim()
    ) {
      throw new Error(
        "La observación no puede estar vacía."
      );
    }

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idReserva",
          sql.Int,
          idReservaNumero
        )
        .input(
          "categoria",
          sql.NVarChar(30),
          categoria
        )
        .input(
          "observacion",
          sql.NVarChar(sql.MAX),
          String(
            observacion
          ).trim()
        )
        .input(
          "fijada",
          sql.Bit,
          fijada === true
        )
        .input(
          "autorNombre",
          sql.NVarChar(120),
          autorNombre === null ||
          autorNombre === undefined ||
          String(
            autorNombre
          ).trim() === ""
            ? null
            : String(
                autorNombre
              ).trim()
        )
        .query(`
          INSERT INTO dbo.ReservaObservaciones
          (
            IdReserva,
            Categoria,
            Observacion,
            Fijada,
            AutorNombre
          )

          OUTPUT
            INSERTED.IdObservacionReserva
              AS idObservacionReserva,

            INSERTED.IdReserva
              AS idReserva,

            INSERTED.Categoria
              AS categoria,

            INSERTED.Observacion
              AS observacion,

            INSERTED.Fijada
              AS fijada,

            INSERTED.AutorNombre
              AS autorNombre,

            INSERTED.FechaCreacion
              AS fechaCreacion,

            INSERTED.FechaActualizacion
              AS fechaActualizacion

          VALUES
          (
            @idReserva,
            @categoria,
            @observacion,
            @fijada,
            @autorNombre
          );
        `);

    return this.formatearObservacion(
      resultado.recordset[0]
    );
  }

  // =========================================================
  // OBTENER OBSERVACIONES POR RESERVA
  // =========================================================

  async obtenerPorReserva(
    idReserva
  ) {
    const idReservaNumero =
      Number(idReserva);

    if (
      !Number.isInteger(
        idReservaNumero
      ) ||
      idReservaNumero <= 0
    ) {
      throw new Error(
        "El id de la reserva no es válido."
      );
    }

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idReserva",
          sql.Int,
          idReservaNumero
        )
        .query(`
          SELECT
            ro.IdObservacionReserva
              AS idObservacionReserva,

            ro.IdReserva
              AS idReserva,

            ro.Categoria
              AS categoria,

            ro.Observacion
              AS observacion,

            ro.Fijada
              AS fijada,

            ro.AutorNombre
              AS autorNombre,

            ro.FechaCreacion
              AS fechaCreacion,

            ro.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.ReservaObservaciones ro

          WHERE
            ro.IdReserva =
              @idReserva

          ORDER BY
            ro.Fijada DESC,
            ro.FechaCreacion DESC,
            ro.IdObservacionReserva DESC;
        `);

    return resultado.recordset.map(
      (observacion) =>
        this.formatearObservacion(
          observacion
        )
    );
  }

  // =========================================================
  // OBTENER OBSERVACIÓN POR ID
  // =========================================================

  async obtenerPorId(
    idObservacionReserva
  ) {
    const idObservacionNumero =
      Number(
        idObservacionReserva
      );

    if (
      !Number.isInteger(
        idObservacionNumero
      ) ||
      idObservacionNumero <= 0
    ) {
      throw new Error(
        "El id de la observación no es válido."
      );
    }

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idObservacionReserva",
          sql.Int,
          idObservacionNumero
        )
        .query(`
          SELECT
            ro.IdObservacionReserva
              AS idObservacionReserva,

            ro.IdReserva
              AS idReserva,

            ro.Categoria
              AS categoria,

            ro.Observacion
              AS observacion,

            ro.Fijada
              AS fijada,

            ro.AutorNombre
              AS autorNombre,

            ro.FechaCreacion
              AS fechaCreacion,

            ro.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.ReservaObservaciones ro

          WHERE
            ro.IdObservacionReserva =
              @idObservacionReserva;
        `);

    const observacion =
      resultado.recordset[0];

    return observacion
      ? this.formatearObservacion(
          observacion
        )
      : null;
  }

  // =========================================================
  // ACTUALIZAR OBSERVACIÓN
  // =========================================================

  async actualizarObservacion(
    idObservacionReserva,
    datos = {}
  ) {
    const observacionActual =
      await this.obtenerPorId(
        idObservacionReserva
      );

    if (!observacionActual) {
      return null;
    }

    const categoria =
      datos.categoria !== undefined
        ? datos.categoria
        : observacionActual.categoria;

    const observacion =
      datos.observacion !== undefined
        ? String(
            datos.observacion
          ).trim()
        : observacionActual.observacion;

    const fijada =
      datos.fijada !== undefined
        ? datos.fijada === true
        : observacionActual.fijada;

    const autorNombre =
      datos.autorNombre !== undefined
        ? (
            datos.autorNombre === null ||
            String(
              datos.autorNombre
            ).trim() === ""
              ? null
              : String(
                  datos.autorNombre
                ).trim()
          )
        : observacionActual.autorNombre;

    const categoriasPermitidas = [
      "General",
      "Check-in",
      "Check-out",
      "Cobro",
      "Limpieza",
      "Mantenimiento",
      "Huesped",
      "Otro",
    ];

    if (
      !categoriasPermitidas.includes(
        categoria
      )
    ) {
      throw new Error(
        "La categoría de la observación no es válida."
      );
    }

    if (!observacion) {
      throw new Error(
        "La observación no puede estar vacía."
      );
    }

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idObservacionReserva",
          sql.Int,
          Number(
            idObservacionReserva
          )
        )
        .input(
          "categoria",
          sql.NVarChar(30),
          categoria
        )
        .input(
          "observacion",
          sql.NVarChar(sql.MAX),
          observacion
        )
        .input(
          "fijada",
          sql.Bit,
          fijada
        )
        .input(
          "autorNombre",
          sql.NVarChar(120),
          autorNombre
        )
        .query(`
          UPDATE dbo.ReservaObservaciones

          SET
            Categoria =
              @categoria,

            Observacion =
              @observacion,

            Fijada =
              @fijada,

            AutorNombre =
              @autorNombre,

            FechaActualizacion =
              SYSUTCDATETIME()

          OUTPUT
            INSERTED.IdObservacionReserva
              AS idObservacionReserva,

            INSERTED.IdReserva
              AS idReserva,

            INSERTED.Categoria
              AS categoria,

            INSERTED.Observacion
              AS observacion,

            INSERTED.Fijada
              AS fijada,

            INSERTED.AutorNombre
              AS autorNombre,

            INSERTED.FechaCreacion
              AS fechaCreacion,

            INSERTED.FechaActualizacion
              AS fechaActualizacion

          WHERE
            IdObservacionReserva =
              @idObservacionReserva;
        `);

    const observacionActualizada =
      resultado.recordset[0];

    return observacionActualizada
      ? this.formatearObservacion(
          observacionActualizada
        )
      : null;
  }

  // =========================================================
  // CAMBIAR ESTADO FIJADA
  // =========================================================

  async cambiarFijada(
    idObservacionReserva,
    fijada
  ) {
    return await this.actualizarObservacion(
      idObservacionReserva,
      {
        fijada:
          fijada === true,
      }
    );
  }

  // =========================================================
  // ELIMINAR OBSERVACIÓN
  // =========================================================

  async eliminarObservacion(
    idObservacionReserva
  ) {
    const idObservacionNumero =
      Number(
        idObservacionReserva
      );

    if (
      !Number.isInteger(
        idObservacionNumero
      ) ||
      idObservacionNumero <= 0
    ) {
      throw new Error(
        "El id de la observación no es válido."
      );
    }

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idObservacionReserva",
          sql.Int,
          idObservacionNumero
        )
        .query(`
          DELETE FROM dbo.ReservaObservaciones

          OUTPUT
            DELETED.IdObservacionReserva
              AS idObservacionReserva,

            DELETED.IdReserva
              AS idReserva,

            DELETED.Categoria
              AS categoria,

            DELETED.Observacion
              AS observacion,

            DELETED.Fijada
              AS fijada,

            DELETED.AutorNombre
              AS autorNombre,

            DELETED.FechaCreacion
              AS fechaCreacion,

            DELETED.FechaActualizacion
              AS fechaActualizacion

          WHERE
            IdObservacionReserva =
              @idObservacionReserva;
        `);

    const observacionEliminada =
      resultado.recordset[0];

    return observacionEliminada
      ? this.formatearObservacion(
          observacionEliminada
        )
      : null;
  }

  // =========================================================
  // HELPER
  // =========================================================

  formatearObservacion(
    observacion
  ) {
    if (!observacion) {
      return null;
    }

    return {
      idObservacionReserva:
        observacion.idObservacionReserva,

      idReserva:
        observacion.idReserva,

      categoria:
        observacion.categoria,

      observacion:
        observacion.observacion,

      fijada:
        Boolean(
          observacion.fijada
        ),

      autorNombre:
        observacion.autorNombre,

      fechaCreacion:
        observacion.fechaCreacion,

      fechaActualizacion:
        observacion.fechaActualizacion,
    };
  }
}

module.exports =
  new ReservaObservacionRepository();
