const {
  poolPromise,
  sql,
} = require("../config/database");

class ReservaMensajeRepository {
  // =========================================================
  // CREAR MENSAJE
  // =========================================================

  async crearMensaje(datos) {
    const {
      idReserva,
      direccion,
      remitenteTipo,
      remitenteNombre = null,
      mensaje,
      origen = "HostFlow",
      idExterno = null,
      estado = "Registrado",
      fechaMensaje = null,
      metadataJson = null,
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
        "El id de la reserva es obligatorio para registrar el mensaje."
      );
    }

    const direccionesPermitidas = [
      "Entrante",
      "Saliente",
    ];

    if (
      !direccionesPermitidas.includes(
        direccion
      )
    ) {
      throw new Error(
        "La dirección del mensaje no es válida."
      );
    }

    const remitentesPermitidos = [
      "Huesped",
      "Anfitrion",
      "Sistema",
    ];

    if (
      !remitentesPermitidos.includes(
        remitenteTipo
      )
    ) {
      throw new Error(
        "El tipo de remitente no es válido."
      );
    }

    if (
      !mensaje ||
      !String(mensaje).trim()
    ) {
      throw new Error(
        "El mensaje no puede estar vacío."
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
        "El origen del mensaje no es válido."
      );
    }

    const estadosPermitidos = [
      "Registrado",
      "Enviado",
      "Entregado",
      "Leido",
      "Error",
    ];

    if (
      !estadosPermitidos.includes(
        estado
      )
    ) {
      throw new Error(
        "El estado del mensaje no es válido."
      );
    }

    const metadataNormalizada =
      this.normalizarMetadataJson(
        metadataJson
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
          "direccion",
          sql.NVarChar(20),
          direccion
        )
        .input(
          "remitenteTipo",
          sql.NVarChar(30),
          remitenteTipo
        )
        .input(
          "remitenteNombre",
          sql.NVarChar(120),
          remitenteNombre === null ||
          remitenteNombre === undefined ||
          String(remitenteNombre).trim() === ""
            ? null
            : String(remitenteNombre).trim()
        )
        .input(
          "mensaje",
          sql.NVarChar(sql.MAX),
          String(mensaje).trim()
        )
        .input(
          "origen",
          sql.NVarChar(30),
          origen
        )
        .input(
          "idExterno",
          sql.NVarChar(150),
          idExterno === null ||
          idExterno === undefined ||
          String(idExterno).trim() === ""
            ? null
            : String(idExterno).trim()
        )
        .input(
          "estado",
          sql.NVarChar(30),
          estado
        )
        .input(
          "metadataJson",
          sql.NVarChar(sql.MAX),
          metadataNormalizada
        );

    if (fechaMensaje) {
      const fecha =
        fechaMensaje instanceof Date
          ? fechaMensaje
          : new Date(fechaMensaje);

      if (
        Number.isNaN(
          fecha.getTime()
        )
      ) {
        throw new Error(
          "La fecha del mensaje no es válida."
        );
      }

      request.input(
        "fechaMensaje",
        sql.DateTime2,
        fecha
      );
    } else {
      request.input(
        "fechaMensaje",
        sql.DateTime2,
        null
      );
    }

    const resultado =
      await request.query(`
        INSERT INTO dbo.ReservaMensajes
        (
          IdReserva,
          Direccion,
          RemitenteTipo,
          RemitenteNombre,
          Mensaje,
          Origen,
          IdExterno,
          Estado,
          FechaMensaje,
          MetadataJson
        )

        OUTPUT
          INSERTED.IdMensajeReserva
            AS idMensajeReserva,

          INSERTED.IdReserva
            AS idReserva,

          INSERTED.Direccion
            AS direccion,

          INSERTED.RemitenteTipo
            AS remitenteTipo,

          INSERTED.RemitenteNombre
            AS remitenteNombre,

          INSERTED.Mensaje
            AS mensaje,

          INSERTED.Origen
            AS origen,

          INSERTED.IdExterno
            AS idExterno,

          INSERTED.Estado
            AS estado,

          INSERTED.FechaMensaje
            AS fechaMensaje,

          INSERTED.MetadataJson
            AS metadataJson,

          INSERTED.FechaCreacion
            AS fechaCreacion

        VALUES
        (
          @idReserva,
          @direccion,
          @remitenteTipo,
          @remitenteNombre,
          @mensaje,
          @origen,
          @idExterno,
          @estado,
          COALESCE(
            @fechaMensaje,
            SYSUTCDATETIME()
          ),
          @metadataJson
        );
      `);

    return this.formatearMensaje(
      resultado.recordset[0]
    );
  }

  // =========================================================
  // OBTENER MENSAJES POR RESERVA
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
            rm.IdMensajeReserva
              AS idMensajeReserva,

            rm.IdReserva
              AS idReserva,

            rm.Direccion
              AS direccion,

            rm.RemitenteTipo
              AS remitenteTipo,

            rm.RemitenteNombre
              AS remitenteNombre,

            rm.Mensaje
              AS mensaje,

            rm.Origen
              AS origen,

            rm.IdExterno
              AS idExterno,

            rm.Estado
              AS estado,

            rm.FechaMensaje
              AS fechaMensaje,

            rm.MetadataJson
              AS metadataJson,

            rm.FechaCreacion
              AS fechaCreacion

          FROM dbo.ReservaMensajes rm

          WHERE
            rm.IdReserva =
              @idReserva

          ORDER BY
            rm.FechaMensaje ASC,
            rm.IdMensajeReserva ASC;
        `);

    return resultado.recordset.map(
      (mensaje) =>
        this.formatearMensaje(
          mensaje
        )
    );
  }

  // =========================================================
  // OBTENER MENSAJE POR ID
  // =========================================================

  async obtenerPorId(
    idMensajeReserva
  ) {
    const idMensajeNumero =
      Number(idMensajeReserva);

    if (
      !Number.isInteger(
        idMensajeNumero
      ) ||
      idMensajeNumero <= 0
    ) {
      throw new Error(
        "El id del mensaje no es válido."
      );
    }

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idMensajeReserva",
          sql.Int,
          idMensajeNumero
        )
        .query(`
          SELECT
            rm.IdMensajeReserva
              AS idMensajeReserva,

            rm.IdReserva
              AS idReserva,

            rm.Direccion
              AS direccion,

            rm.RemitenteTipo
              AS remitenteTipo,

            rm.RemitenteNombre
              AS remitenteNombre,

            rm.Mensaje
              AS mensaje,

            rm.Origen
              AS origen,

            rm.IdExterno
              AS idExterno,

            rm.Estado
              AS estado,

            rm.FechaMensaje
              AS fechaMensaje,

            rm.MetadataJson
              AS metadataJson,

            rm.FechaCreacion
              AS fechaCreacion

          FROM dbo.ReservaMensajes rm

          WHERE
            rm.IdMensajeReserva =
              @idMensajeReserva;
        `);

    const mensaje =
      resultado.recordset[0];

    return mensaje
      ? this.formatearMensaje(
          mensaje
        )
      : null;
  }

  // =========================================================
  // ACTUALIZAR ESTADO
  // =========================================================

  async actualizarEstado(
    idMensajeReserva,
    estado
  ) {
    const idMensajeNumero =
      Number(idMensajeReserva);

    if (
      !Number.isInteger(
        idMensajeNumero
      ) ||
      idMensajeNumero <= 0
    ) {
      throw new Error(
        "El id del mensaje no es válido."
      );
    }

    const estadosPermitidos = [
      "Registrado",
      "Enviado",
      "Entregado",
      "Leido",
      "Error",
    ];

    if (
      !estadosPermitidos.includes(
        estado
      )
    ) {
      throw new Error(
        "El estado del mensaje no es válido."
      );
    }

    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idMensajeReserva",
          sql.Int,
          idMensajeNumero
        )
        .input(
          "estado",
          sql.NVarChar(30),
          estado
        )
        .query(`
          UPDATE dbo.ReservaMensajes

          SET
            Estado =
              @estado

          OUTPUT
            INSERTED.IdMensajeReserva
              AS idMensajeReserva,

            INSERTED.IdReserva
              AS idReserva,

            INSERTED.Direccion
              AS direccion,

            INSERTED.RemitenteTipo
              AS remitenteTipo,

            INSERTED.RemitenteNombre
              AS remitenteNombre,

            INSERTED.Mensaje
              AS mensaje,

            INSERTED.Origen
              AS origen,

            INSERTED.IdExterno
              AS idExterno,

            INSERTED.Estado
              AS estado,

            INSERTED.FechaMensaje
              AS fechaMensaje,

            INSERTED.MetadataJson
              AS metadataJson,

            INSERTED.FechaCreacion
              AS fechaCreacion

          WHERE
            IdMensajeReserva =
              @idMensajeReserva;
        `);

    const mensaje =
      resultado.recordset[0];

    return mensaje
      ? this.formatearMensaje(
          mensaje
        )
      : null;
  }

  // =========================================================
  // HELPERS
  // =========================================================

  normalizarMetadataJson(
    metadataJson
  ) {
    if (
      metadataJson === null ||
      metadataJson === undefined
    ) {
      return null;
    }

    if (
      typeof metadataJson ===
      "string"
    ) {
      const valor =
        metadataJson.trim();

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
          "metadataJson debe contener un objeto o array JSON válido."
        );
      }
    }

    if (
      typeof metadataJson ===
      "object"
    ) {
      try {
        return JSON.stringify(
          metadataJson
        );
      } catch {
        throw new Error(
          "No se pudieron serializar los metadatos del mensaje."
        );
      }
    }

    throw new Error(
      "metadataJson debe ser un objeto, array, string JSON o null."
    );
  }

  formatearMensaje(
    mensaje
  ) {
    if (!mensaje) {
      return null;
    }

    let metadataJson = null;

    if (mensaje.metadataJson) {
      try {
        metadataJson =
          JSON.parse(
            mensaje.metadataJson
          );
      } catch {
        metadataJson = null;
      }
    }

    return {
      idMensajeReserva:
        mensaje.idMensajeReserva,

      idReserva:
        mensaje.idReserva,

      direccion:
        mensaje.direccion,

      remitenteTipo:
        mensaje.remitenteTipo,

      remitenteNombre:
        mensaje.remitenteNombre,

      mensaje:
        mensaje.mensaje,

      origen:
        mensaje.origen,

      idExterno:
        mensaje.idExterno,

      estado:
        mensaje.estado,

      fechaMensaje:
        mensaje.fechaMensaje,

      metadataJson,

      fechaCreacion:
        mensaje.fechaCreacion,
    };
  }
}

module.exports =
  new ReservaMensajeRepository();
