const {
  poolPromise,
  sql,
} = require("../config/database");

class ReservaEventoRepository {
  // =========================================================
  // CREAR EVENTO
  // =========================================================
  //
  // Registra un hecho ocurrido sobre una reserva.
  //
  // fechaEvento es opcional:
  // - si viene informada, se conserva esa fecha;
  // - si no viene, Azure SQL utiliza SYSUTCDATETIME().
  //
  // datosJson puede recibirse como:
  // - objeto / array de JavaScript;
  // - string JSON válido;
  // - null.
  // =========================================================

  async crearEvento(datos) {
    const {
      idReserva,
      tipo,
      titulo,
      descripcion = null,
      origen = "HostFlow",
      fechaEvento = null,
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
        "El id de la reserva es obligatorio para registrar el evento."
      );
    }

    if (
      !tipo ||
      !String(tipo).trim()
    ) {
      throw new Error(
        "El tipo del evento es obligatorio."
      );
    }

    if (
      !titulo ||
      !String(titulo).trim()
    ) {
      throw new Error(
        "El título del evento es obligatorio."
      );
    }

    const origenNormalizado =
      String(origen).trim();

    const origenesPermitidos = [
      "HostFlow",
      "Manual",
      "Airbnb",
      "Booking",
      "Sistema",
    ];

    if (
      !origenesPermitidos.includes(
        origenNormalizado
      )
    ) {
      throw new Error(
        "El origen del evento no es válido."
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
          sql.NVarChar(60),
          String(tipo).trim()
        )
        .input(
          "titulo",
          sql.NVarChar(150),
          String(titulo).trim()
        )
        .input(
          "descripcion",
          sql.NVarChar(500),
          descripcion === null ||
          descripcion === undefined ||
          String(descripcion).trim() === ""
            ? null
            : String(descripcion).trim()
        )
        .input(
          "origen",
          sql.NVarChar(30),
          origenNormalizado
        )
        .input(
          "datosJson",
          sql.NVarChar(sql.MAX),
          datosJsonNormalizados
        );

    if (fechaEvento) {
      const fecha =
        fechaEvento instanceof Date
          ? fechaEvento
          : new Date(fechaEvento);

      if (
        Number.isNaN(
          fecha.getTime()
        )
      ) {
        throw new Error(
          "La fecha del evento no es válida."
        );
      }

      request.input(
        "fechaEvento",
        sql.DateTime2,
        fecha
      );
    } else {
      request.input(
        "fechaEvento",
        sql.DateTime2,
        null
      );
    }

    const resultado =
      await request.query(`
        INSERT INTO dbo.ReservaEventos
        (
          IdReserva,
          Tipo,
          Titulo,
          Descripcion,
          Origen,
          FechaEvento,
          DatosJson
        )

        OUTPUT
          INSERTED.IdEventoReserva
            AS idEventoReserva,

          INSERTED.IdReserva
            AS idReserva,

          INSERTED.Tipo
            AS tipo,

          INSERTED.Titulo
            AS titulo,

          INSERTED.Descripcion
            AS descripcion,

          INSERTED.Origen
            AS origen,

          INSERTED.FechaEvento
            AS fechaEvento,

          INSERTED.DatosJson
            AS datosJson,

          INSERTED.FechaCreacion
            AS fechaCreacion

        VALUES
        (
          @idReserva,
          @tipo,
          @titulo,
          @descripcion,
          @origen,
          COALESCE(
            @fechaEvento,
            SYSUTCDATETIME()
          ),
          @datosJson
        );
      `);

    return this.formatearEvento(
      resultado.recordset[0]
    );
  }

  // =========================================================
  // OBTENER TIMELINE DE UNA RESERVA
  // =========================================================
  //
  // Se devuelve de más antiguo a más reciente porque ese es
  // el orden natural que luego usaremos en el timeline.
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
            re.IdEventoReserva
              AS idEventoReserva,

            re.IdReserva
              AS idReserva,

            re.Tipo
              AS tipo,

            re.Titulo
              AS titulo,

            re.Descripcion
              AS descripcion,

            re.Origen
              AS origen,

            re.FechaEvento
              AS fechaEvento,

            re.DatosJson
              AS datosJson,

            re.FechaCreacion
              AS fechaCreacion

          FROM dbo.ReservaEventos re

          WHERE
            re.IdReserva =
              @idReserva

          ORDER BY
            re.FechaEvento ASC,
            re.IdEventoReserva ASC;
        `);

    return resultado.recordset.map(
      (evento) =>
        this.formatearEvento(
          evento
        )
    );
  }

  // =========================================================
  // OBTENER EVENTO POR ID
  // =========================================================

  async obtenerPorId(
    idEventoReserva
  ) {
    const idEventoNumero =
      Number(idEventoReserva);

    if (
      !Number.isInteger(
        idEventoNumero
      ) ||
      idEventoNumero <= 0
    ) {
      throw new Error(
        "El id del evento no es válido."
      );
    }

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idEventoReserva",
          sql.Int,
          idEventoNumero
        )
        .query(`
          SELECT
            re.IdEventoReserva
              AS idEventoReserva,

            re.IdReserva
              AS idReserva,

            re.Tipo
              AS tipo,

            re.Titulo
              AS titulo,

            re.Descripcion
              AS descripcion,

            re.Origen
              AS origen,

            re.FechaEvento
              AS fechaEvento,

            re.DatosJson
              AS datosJson,

            re.FechaCreacion
              AS fechaCreacion

          FROM dbo.ReservaEventos re

          WHERE
            re.IdEventoReserva =
              @idEventoReserva;
        `);

    const evento =
      resultado.recordset[0];

    return evento
      ? this.formatearEvento(
          evento
        )
      : null;
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
          "No se pudieron serializar los datos adicionales del evento."
        );
      }
    }

    throw new Error(
      "datosJson debe ser un objeto, array, string JSON o null."
    );
  }

  formatearEvento(
    evento
  ) {
    if (!evento) {
      return null;
    }

    let datosJson = null;

    if (evento.datosJson) {
      try {
        datosJson =
          JSON.parse(
            evento.datosJson
          );
      } catch {
        datosJson = null;
      }
    }

    return {
      idEventoReserva:
        evento.idEventoReserva,

      idReserva:
        evento.idReserva,

      tipo:
        evento.tipo,

      titulo:
        evento.titulo,

      descripcion:
        evento.descripcion,

      origen:
        evento.origen,

      fechaEvento:
        evento.fechaEvento,

      datosJson,

      fechaCreacion:
        evento.fechaCreacion,
    };
  }
}

module.exports =
  new ReservaEventoRepository();
