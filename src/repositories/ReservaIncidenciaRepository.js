const {
  poolPromise,
  sql,
} = require("../config/database");

class ReservaIncidenciaRepository {
  // =========================================================
  // CREAR INCIDENCIA
  // =========================================================

  async crearIncidencia(datos) {
    const {
      idReserva,
      tipo,
      titulo,
      descripcion,
      severidad = "Baja",
      estado = "Abierta",
      resolucion = null,
      origen = "HostFlow",
      fechaIncidencia = null,
      fechaResolucion = null,
      datosJson = null,
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
        "El id de la reserva es obligatorio para registrar la incidencia."
      );
    }

    if (
      !tipo ||
      !String(tipo).trim()
    ) {
      throw new Error(
        "El tipo de incidencia es obligatorio."
      );
    }

    if (
      !titulo ||
      !String(titulo).trim()
    ) {
      throw new Error(
        "El título de la incidencia es obligatorio."
      );
    }

    if (
      !descripcion ||
      !String(descripcion).trim()
    ) {
      throw new Error(
        "La descripción de la incidencia es obligatoria."
      );
    }

    const severidadesPermitidas = [
      "Baja",
      "Media",
      "Alta",
      "Critica",
    ];

    if (
      !severidadesPermitidas.includes(
        severidad
      )
    ) {
      throw new Error(
        "La severidad de la incidencia no es válida."
      );
    }

    const estadosPermitidos = [
      "Abierta",
      "En seguimiento",
      "Resuelta",
    ];

    if (
      !estadosPermitidos.includes(
        estado
      )
    ) {
      throw new Error(
        "El estado de la incidencia no es válido."
      );
    }

    const origenesPermitidos = [
      "HostFlow",
      "Manual",
      "Airbnb",
      "Booking",
      "Sistema",
    ];

    if (
      !origenesPermitidos.includes(
        origen
      )
    ) {
      throw new Error(
        "El origen de la incidencia no es válido."
      );
    }

    if (
      estado === "Resuelta" &&
      (
        !resolucion ||
        !String(resolucion).trim()
      )
    ) {
      throw new Error(
        "Una incidencia resuelta debe indicar su resolución."
      );
    }

    const datosJsonNormalizados =
      this.normalizarDatosJson(
        datosJson
      );

    const pool =
      await poolPromise;

    const request =
      pool
        .request()
        .input(
          "idReserva",
          sql.Int,
          idReservaNumero
        )
        .input(
          "tipo",
          sql.NVarChar(50),
          String(tipo).trim()
        )
        .input(
          "titulo",
          sql.NVarChar(150),
          String(titulo).trim()
        )
        .input(
          "descripcion",
          sql.NVarChar(sql.MAX),
          String(descripcion).trim()
        )
        .input(
          "severidad",
          sql.NVarChar(20),
          severidad
        )
        .input(
          "estado",
          sql.NVarChar(20),
          estado
        )
        .input(
          "resolucion",
          sql.NVarChar(sql.MAX),
          resolucion === null ||
          resolucion === undefined ||
          String(resolucion).trim() === ""
            ? null
            : String(resolucion).trim()
        )
        .input(
          "origen",
          sql.NVarChar(30),
          origen
        )
        .input(
          "datosJson",
          sql.NVarChar(sql.MAX),
          datosJsonNormalizados
        );

    if (fechaIncidencia) {
      const fecha =
        fechaIncidencia instanceof Date
          ? fechaIncidencia
          : new Date(
              fechaIncidencia
            );

      if (
        Number.isNaN(
          fecha.getTime()
        )
      ) {
        throw new Error(
          "La fecha de incidencia no es válida."
        );
      }

      request.input(
        "fechaIncidencia",
        sql.DateTime2,
        fecha
      );
    } else {
      request.input(
        "fechaIncidencia",
        sql.DateTime2,
        null
      );
    }

    if (fechaResolucion) {
      const fecha =
        fechaResolucion instanceof Date
          ? fechaResolucion
          : new Date(
              fechaResolucion
            );

      if (
        Number.isNaN(
          fecha.getTime()
        )
      ) {
        throw new Error(
          "La fecha de resolución no es válida."
        );
      }

      request.input(
        "fechaResolucion",
        sql.DateTime2,
        fecha
      );
    } else {
      request.input(
        "fechaResolucion",
        sql.DateTime2,
        estado === "Resuelta"
          ? new Date()
          : null
      );
    }

    const resultado =
      await request.query(`
        INSERT INTO dbo.ReservaIncidencias
        (
          IdReserva,
          Tipo,
          Titulo,
          Descripcion,
          Severidad,
          Estado,
          Resolucion,
          Origen,
          FechaIncidencia,
          FechaResolucion,
          DatosJson
        )

        OUTPUT
          INSERTED.IdIncidenciaReserva
            AS idIncidenciaReserva,

          INSERTED.IdReserva
            AS idReserva,

          INSERTED.Tipo
            AS tipo,

          INSERTED.Titulo
            AS titulo,

          INSERTED.Descripcion
            AS descripcion,

          INSERTED.Severidad
            AS severidad,

          INSERTED.Estado
            AS estado,

          INSERTED.Resolucion
            AS resolucion,

          INSERTED.Origen
            AS origen,

          INSERTED.FechaIncidencia
            AS fechaIncidencia,

          INSERTED.FechaResolucion
            AS fechaResolucion,

          INSERTED.DatosJson
            AS datosJson,

          INSERTED.FechaCreacion
            AS fechaCreacion,

          INSERTED.FechaActualizacion
            AS fechaActualizacion

        VALUES
        (
          @idReserva,
          @tipo,
          @titulo,
          @descripcion,
          @severidad,
          @estado,
          @resolucion,
          @origen,
          COALESCE(
            @fechaIncidencia,
            SYSUTCDATETIME()
          ),
          @fechaResolucion,
          @datosJson
        );
      `);

    return this.formatearIncidencia(
      resultado.recordset[0]
    );
  }

  // =========================================================
  // OBTENER INCIDENCIAS POR RESERVA
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
            ri.IdIncidenciaReserva
              AS idIncidenciaReserva,

            ri.IdReserva
              AS idReserva,

            ri.Tipo
              AS tipo,

            ri.Titulo
              AS titulo,

            ri.Descripcion
              AS descripcion,

            ri.Severidad
              AS severidad,

            ri.Estado
              AS estado,

            ri.Resolucion
              AS resolucion,

            ri.Origen
              AS origen,

            ri.FechaIncidencia
              AS fechaIncidencia,

            ri.FechaResolucion
              AS fechaResolucion,

            ri.DatosJson
              AS datosJson,

            ri.FechaCreacion
              AS fechaCreacion,

            ri.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.ReservaIncidencias ri

          WHERE
            ri.IdReserva =
              @idReserva

          ORDER BY
            CASE
              WHEN ri.Estado =
                N'Resuelta'
                THEN 1
              ELSE 0
            END ASC,

            ri.FechaIncidencia DESC,
            ri.IdIncidenciaReserva DESC;
        `);

    return resultado.recordset.map(
      (incidencia) =>
        this.formatearIncidencia(
          incidencia
        )
    );
  }

  // =========================================================
  // OBTENER INCIDENCIA POR ID
  // =========================================================

  async obtenerPorId(
    idIncidenciaReserva
  ) {
    const idIncidenciaNumero =
      Number(
        idIncidenciaReserva
      );

    if (
      !Number.isInteger(
        idIncidenciaNumero
      ) ||
      idIncidenciaNumero <= 0
    ) {
      throw new Error(
        "El id de la incidencia no es válido."
      );
    }

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idIncidenciaReserva",
          sql.Int,
          idIncidenciaNumero
        )
        .query(`
          SELECT
            ri.IdIncidenciaReserva
              AS idIncidenciaReserva,

            ri.IdReserva
              AS idReserva,

            ri.Tipo
              AS tipo,

            ri.Titulo
              AS titulo,

            ri.Descripcion
              AS descripcion,

            ri.Severidad
              AS severidad,

            ri.Estado
              AS estado,

            ri.Resolucion
              AS resolucion,

            ri.Origen
              AS origen,

            ri.FechaIncidencia
              AS fechaIncidencia,

            ri.FechaResolucion
              AS fechaResolucion,

            ri.DatosJson
              AS datosJson,

            ri.FechaCreacion
              AS fechaCreacion,

            ri.FechaActualizacion
              AS fechaActualizacion

          FROM dbo.ReservaIncidencias ri

          WHERE
            ri.IdIncidenciaReserva =
              @idIncidenciaReserva;
        `);

    const incidencia =
      resultado.recordset[0];

    return incidencia
      ? this.formatearIncidencia(
          incidencia
        )
      : null;
  }

  // =========================================================
  // ACTUALIZAR INCIDENCIA
  // =========================================================

  async actualizarIncidencia(
    idIncidenciaReserva,
    datos
  ) {
    const incidenciaActual =
      await this.obtenerPorId(
        idIncidenciaReserva
      );

    if (!incidenciaActual) {
      return null;
    }

    const tipo =
      datos.tipo !== undefined
        ? String(
            datos.tipo
          ).trim()
        : incidenciaActual.tipo;

    const titulo =
      datos.titulo !== undefined
        ? String(
            datos.titulo
          ).trim()
        : incidenciaActual.titulo;

    const descripcion =
      datos.descripcion !== undefined
        ? String(
            datos.descripcion
          ).trim()
        : incidenciaActual.descripcion;

    const severidad =
      datos.severidad ||
      incidenciaActual.severidad;

    const estado =
      datos.estado ||
      incidenciaActual.estado;

    const resolucion =
      datos.resolucion !== undefined
        ? (
            datos.resolucion === null ||
            String(
              datos.resolucion
            ).trim() === ""
              ? null
              : String(
                  datos.resolucion
                ).trim()
          )
        : incidenciaActual.resolucion;

    const origen =
      datos.origen ||
      incidenciaActual.origen;

    const severidadesPermitidas = [
      "Baja",
      "Media",
      "Alta",
      "Critica",
    ];

    const estadosPermitidos = [
      "Abierta",
      "En seguimiento",
      "Resuelta",
    ];

    const origenesPermitidos = [
      "HostFlow",
      "Manual",
      "Airbnb",
      "Booking",
      "Sistema",
    ];

    if (!tipo) {
      throw new Error(
        "El tipo de incidencia es obligatorio."
      );
    }

    if (!titulo) {
      throw new Error(
        "El título de la incidencia es obligatorio."
      );
    }

    if (!descripcion) {
      throw new Error(
        "La descripción de la incidencia es obligatoria."
      );
    }

    if (
      !severidadesPermitidas.includes(
        severidad
      )
    ) {
      throw new Error(
        "La severidad de la incidencia no es válida."
      );
    }

    if (
      !estadosPermitidos.includes(
        estado
      )
    ) {
      throw new Error(
        "El estado de la incidencia no es válido."
      );
    }

    if (
      !origenesPermitidos.includes(
        origen
      )
    ) {
      throw new Error(
        "El origen de la incidencia no es válido."
      );
    }

    if (
      estado === "Resuelta" &&
      !resolucion
    ) {
      throw new Error(
        "Una incidencia resuelta debe indicar su resolución."
      );
    }

    const datosJson =
      datos.datosJson !== undefined
        ? this.normalizarDatosJson(
            datos.datosJson
          )
        : this.normalizarDatosJson(
            incidenciaActual.datosJson
          );

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idIncidenciaReserva",
          sql.Int,
          Number(
            idIncidenciaReserva
          )
        )
        .input(
          "tipo",
          sql.NVarChar(50),
          tipo
        )
        .input(
          "titulo",
          sql.NVarChar(150),
          titulo
        )
        .input(
          "descripcion",
          sql.NVarChar(sql.MAX),
          descripcion
        )
        .input(
          "severidad",
          sql.NVarChar(20),
          severidad
        )
        .input(
          "estado",
          sql.NVarChar(20),
          estado
        )
        .input(
          "resolucion",
          sql.NVarChar(sql.MAX),
          resolucion
        )
        .input(
          "origen",
          sql.NVarChar(30),
          origen
        )
        .input(
          "datosJson",
          sql.NVarChar(sql.MAX),
          datosJson
        )
        .query(`
          UPDATE dbo.ReservaIncidencias

          SET
            Tipo =
              @tipo,

            Titulo =
              @titulo,

            Descripcion =
              @descripcion,

            Severidad =
              @severidad,

            Estado =
              @estado,

            Resolucion =
              @resolucion,

            Origen =
              @origen,

            FechaResolucion =
              CASE
                WHEN
                  @estado =
                    N'Resuelta'
                  AND
                  FechaResolucion
                    IS NULL
                  THEN
                    SYSUTCDATETIME()

                WHEN
                  @estado <>
                    N'Resuelta'
                  THEN
                    NULL

                ELSE
                  FechaResolucion
              END,

            DatosJson =
              @datosJson,

            FechaActualizacion =
              SYSUTCDATETIME()

          OUTPUT
            INSERTED.IdIncidenciaReserva
              AS idIncidenciaReserva,

            INSERTED.IdReserva
              AS idReserva,

            INSERTED.Tipo
              AS tipo,

            INSERTED.Titulo
              AS titulo,

            INSERTED.Descripcion
              AS descripcion,

            INSERTED.Severidad
              AS severidad,

            INSERTED.Estado
              AS estado,

            INSERTED.Resolucion
              AS resolucion,

            INSERTED.Origen
              AS origen,

            INSERTED.FechaIncidencia
              AS fechaIncidencia,

            INSERTED.FechaResolucion
              AS fechaResolucion,

            INSERTED.DatosJson
              AS datosJson,

            INSERTED.FechaCreacion
              AS fechaCreacion,

            INSERTED.FechaActualizacion
              AS fechaActualizacion

          WHERE
            IdIncidenciaReserva =
              @idIncidenciaReserva;
        `);

    const incidencia =
      resultado.recordset[0];

    return incidencia
      ? this.formatearIncidencia(
          incidencia
        )
      : null;
  }

  // =========================================================
  // RESOLVER INCIDENCIA
  // =========================================================

  async resolverIncidencia(
    idIncidenciaReserva,
    resolucion
  ) {
    if (
      !resolucion ||
      !String(
        resolucion
      ).trim()
    ) {
      throw new Error(
        "Debe indicar cómo se resolvió la incidencia."
      );
    }

    return await this.actualizarIncidencia(
      idIncidenciaReserva,
      {
        estado:
          "Resuelta",

        resolucion:
          String(
            resolucion
          ).trim(),
      }
    );
  }

  // =========================================================
  // HELPERS
  // =========================================================

  normalizarDatosJson(
    datosJson
  ) {
    if (
      datosJson === null ||
      datosJson === undefined
    ) {
      return null;
    }

    if (
      typeof datosJson ===
      "string"
    ) {
      const valor =
        datosJson.trim();

      if (!valor) {
        return null;
      }

      try {
        const parseado =
          JSON.parse(valor);

        if (
          typeof parseado !==
            "object" ||
          parseado === null
        ) {
          throw new Error();
        }

        return JSON.stringify(
          parseado
        );
      } catch {
        throw new Error(
          "datosJson debe contener un objeto o array JSON válido."
        );
      }
    }

    if (
      typeof datosJson ===
      "object"
    ) {
      try {
        return JSON.stringify(
          datosJson
        );
      } catch {
        throw new Error(
          "No se pudieron serializar los datos adicionales de la incidencia."
        );
      }
    }

    throw new Error(
      "datosJson debe ser un objeto, array, string JSON o null."
    );
  }

  formatearIncidencia(
    incidencia
  ) {
    if (!incidencia) {
      return null;
    }

    let datosJson = null;

    if (incidencia.datosJson) {
      if (
        typeof incidencia.datosJson ===
        "object"
      ) {
        datosJson =
          incidencia.datosJson;
      } else {
        try {
          datosJson =
            JSON.parse(
              incidencia.datosJson
            );
        } catch {
          datosJson = null;
        }
      }
    }

    return {
      idIncidenciaReserva:
        incidencia.idIncidenciaReserva,

      idReserva:
        incidencia.idReserva,

      tipo:
        incidencia.tipo,

      titulo:
        incidencia.titulo,

      descripcion:
        incidencia.descripcion,

      severidad:
        incidencia.severidad,

      estado:
        incidencia.estado,

      resolucion:
        incidencia.resolucion,

      origen:
        incidencia.origen,

      fechaIncidencia:
        incidencia.fechaIncidencia,

      fechaResolucion:
        incidencia.fechaResolucion,

      datosJson,

      fechaCreacion:
        incidencia.fechaCreacion,

      fechaActualizacion:
        incidencia.fechaActualizacion,
    };
  }
}

module.exports =
  new ReservaIncidenciaRepository();
