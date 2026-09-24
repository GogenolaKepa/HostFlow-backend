const {
  poolPromise,
  sql,
} = require("../config/database");

class AlertaRepository {
  // =========================================================
  // FUENTES OPERATIVAS
  // =========================================================

  async obtenerIncidenciasAlertables() {
    const pool =
      await poolPromise;

    const resultado =
      await pool.request().query(`
        SELECT
          ri.IdIncidenciaReserva
            AS idIncidenciaReserva,

          ri.IdReserva
            AS idReserva,

          ri.Tipo
            AS tipoIncidencia,

          ri.Titulo
            AS tituloIncidencia,

          ri.Descripcion
            AS descripcion,

          ri.Severidad
            AS severidad,

          ri.Estado
            AS estadoIncidencia,

          ri.FechaIncidencia
            AS fechaIncidencia,

          r.IdPropiedad
            AS idPropiedad,

          p.Nombre
            AS propiedad,

          h.Nombre + N' ' + h.Apellido
            AS huesped

        FROM dbo.ReservaIncidencias ri

        INNER JOIN dbo.Reservas r
          ON r.IdReserva =
             ri.IdReserva

        INNER JOIN dbo.Propiedades p
          ON p.IdPropiedad =
             r.IdPropiedad

        INNER JOIN dbo.Huespedes h
          ON h.IdHuesped =
             r.IdHuesped

        WHERE
          ri.Estado IN (
            N'Abierta',
            N'En seguimiento'
          )

        ORDER BY
          ri.FechaIncidencia DESC;
      `);

    return resultado.recordset;
  }

  async obtenerSincronizacionesConError() {
    const pool =
      await poolPromise;

    const resultado =
      await pool.request().query(`
        SELECT
          pc.IdPropiedadCanal
            AS idPropiedadCanal,

          pc.IdPropiedad
            AS idPropiedad,

          p.Nombre
            AS propiedad,

          cr.Nombre
            AS canal,

          pc.EstadoPublicacion
            AS estadoPublicacion,

          pc.EstadoSincronizacion
            AS estadoSincronizacion,

          pc.MensajeError
            AS mensajeError,

          pc.FechaActualizacion
            AS fechaActualizacion

        FROM dbo.PropiedadCanales pc

        INNER JOIN dbo.Propiedades p
          ON p.IdPropiedad =
             pc.IdPropiedad

        INNER JOIN dbo.CanalesReserva cr
          ON cr.IdCanalReserva =
             pc.IdCanalReserva

        WHERE
          pc.EstadoSincronizacion =
            N'Error'

        ORDER BY
          pc.FechaActualizacion DESC;
      `);

    return resultado.recordset;
  }

  async obtenerCheckinsProximos(
    fechaDesde,
    fechaHasta
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "fechaDesde",
          sql.Date,
          fechaDesde
        )
        .input(
          "fechaHasta",
          sql.Date,
          fechaHasta
        )
        .query(`
          SELECT
            r.IdReserva
              AS idReserva,

            r.IdPropiedad
              AS idPropiedad,

            p.Nombre
              AS propiedad,

            h.Nombre + N' ' + h.Apellido
              AS huesped,

            cr.Nombre
              AS canal,

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

            er.Nombre
              AS estado

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
            r.FechaIngreso >=
              @fechaDesde

            AND r.FechaIngreso <=
              @fechaHasta

            AND er.Nombre NOT IN (
              N'Cancelada',
              N'Finalizada',
              N'No show'
            )

          ORDER BY
            r.FechaIngreso ASC,
            r.IdReserva ASC;
        `);

    return resultado.recordset;
  }

  async obtenerConflictosActivos(
    fechaActual
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "fechaActual",
          sql.Date,
          fechaActual
        )
        .query(`
          SELECT
            r1.IdReserva
              AS idReservaA,

            r2.IdReserva
              AS idReservaB,

            r1.IdPropiedad
              AS idPropiedad,

            p.Nombre
              AS propiedad,

            CONVERT(
              VARCHAR(10),
              CASE
                WHEN r1.FechaIngreso >
                     r2.FechaIngreso
                  THEN r1.FechaIngreso
                ELSE r2.FechaIngreso
              END,
              23
            ) AS fechaInicioConflicto,

            CONVERT(
              VARCHAR(10),
              CASE
                WHEN r1.FechaEgreso <
                     r2.FechaEgreso
                  THEN r1.FechaEgreso
                ELSE r2.FechaEgreso
              END,
              23
            ) AS fechaFinConflicto,

            cr1.Nombre
              AS canalA,

            cr2.Nombre
              AS canalB,

            h1.Nombre + N' ' + h1.Apellido
              AS huespedA,

            h2.Nombre + N' ' + h2.Apellido
              AS huespedB

          FROM dbo.Reservas r1

          INNER JOIN dbo.Reservas r2
            ON r2.IdPropiedad =
               r1.IdPropiedad

           AND r1.IdReserva <
               r2.IdReserva

           AND r1.FechaIngreso <
               r2.FechaEgreso

           AND r2.FechaIngreso <
               r1.FechaEgreso

          INNER JOIN dbo.EstadosReserva er1
            ON er1.IdEstadoReserva =
               r1.IdEstadoReserva

          INNER JOIN dbo.EstadosReserva er2
            ON er2.IdEstadoReserva =
               r2.IdEstadoReserva

          INNER JOIN dbo.Propiedades p
            ON p.IdPropiedad =
               r1.IdPropiedad

          INNER JOIN dbo.CanalesReserva cr1
            ON cr1.IdCanalReserva =
               r1.IdCanalReserva

          INNER JOIN dbo.CanalesReserva cr2
            ON cr2.IdCanalReserva =
               r2.IdCanalReserva

          INNER JOIN dbo.Huespedes h1
            ON h1.IdHuesped =
               r1.IdHuesped

          INNER JOIN dbo.Huespedes h2
            ON h2.IdHuesped =
               r2.IdHuesped

          WHERE
            er1.Nombre NOT IN (
              N'Cancelada',
              N'Finalizada',
              N'No show'
            )

            AND er2.Nombre NOT IN (
              N'Cancelada',
              N'Finalizada',
              N'No show'
            )

            AND r1.FechaEgreso >=
              @fechaActual

            AND r2.FechaEgreso >=
              @fechaActual

          ORDER BY
            p.Nombre,
            fechaInicioConflicto;
        `);

    return resultado.recordset;
  }

  // =========================================================
  // CREAR / ACTUALIZAR POR CLAVE
  // =========================================================

  async crearOActualizarPorClave(
    alerta
  ) {
    const pool =
      await poolPromise;

    const datosJson =
      alerta.datos === undefined ||
      alerta.datos === null
        ? null
        : JSON.stringify(
            alerta.datos
          );

    const resultado =
      await pool
        .request()
        .input(
          "claveAlerta",
          sql.NVarChar(180),
          alerta.claveAlerta
        )
        .input(
          "tipo",
          sql.NVarChar(50),
          alerta.tipo
        )
        .input(
          "categoria",
          sql.NVarChar(30),
          alerta.categoria
        )
        .input(
          "titulo",
          sql.NVarChar(150),
          alerta.titulo
        )
        .input(
          "mensaje",
          sql.NVarChar(500),
          alerta.mensaje
        )
        .input(
          "severidad",
          sql.NVarChar(20),
          alerta.severidad
        )
        .input(
          "idReserva",
          sql.Int,
          alerta.idReserva ??
            null
        )
        .input(
          "idPropiedad",
          sql.Int,
          alerta.idPropiedad ??
            null
        )
        .input(
          "idIncidenciaReserva",
          sql.Int,
          alerta.idIncidenciaReserva ??
            null
        )
        .input(
          "idPropiedadCanal",
          sql.Int,
          alerta.idPropiedadCanal ??
            null
        )
        .input(
          "origen",
          sql.NVarChar(30),
          alerta.origen ||
            "Sistema"
        )
        .input(
          "datosJson",
          sql.NVarChar(sql.MAX),
          datosJson
        )
        .query(`
          IF EXISTS (
            SELECT 1
            FROM dbo.Alertas
            WHERE ClaveAlerta =
              @claveAlerta
          )
          BEGIN
            UPDATE dbo.Alertas
            SET
              Tipo =
                @tipo,

              Categoria =
                @categoria,

              Titulo =
                @titulo,

              Mensaje =
                @mensaje,

              Severidad =
                @severidad,

              IdReserva =
                @idReserva,

              IdPropiedad =
                @idPropiedad,

              IdIncidenciaReserva =
                @idIncidenciaReserva,

              IdPropiedadCanal =
                @idPropiedadCanal,

              Origen =
                @origen,

              DatosJson =
                @datosJson,

              Estado =
                CASE
                  WHEN Estado =
                    N'Resuelta'
                    THEN N'Nueva'
                  ELSE Estado
                END,

              FechaLectura =
                CASE
                  WHEN Estado =
                    N'Resuelta'
                    THEN NULL
                  ELSE FechaLectura
                END,

              FechaResolucion =
                CASE
                  WHEN Estado =
                    N'Resuelta'
                    THEN NULL
                  ELSE FechaResolucion
                END,

              FechaActualizacion =
                SYSUTCDATETIME()

            WHERE
              ClaveAlerta =
                @claveAlerta;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.Alertas
            (
              ClaveAlerta,
              Tipo,
              Categoria,
              Titulo,
              Mensaje,
              Severidad,
              Estado,
              IdReserva,
              IdPropiedad,
              IdIncidenciaReserva,
              IdPropiedadCanal,
              Origen,
              FechaAlerta,
              DatosJson,
              FechaCreacion,
              FechaActualizacion
            )
            VALUES
            (
              @claveAlerta,
              @tipo,
              @categoria,
              @titulo,
              @mensaje,
              @severidad,
              N'Nueva',
              @idReserva,
              @idPropiedad,
              @idIncidenciaReserva,
              @idPropiedadCanal,
              @origen,
              SYSUTCDATETIME(),
              @datosJson,
              SYSUTCDATETIME(),
              SYSUTCDATETIME()
            );
          END;

          SELECT TOP 1
            IdAlerta AS idAlerta,
            ClaveAlerta AS claveAlerta,
            Tipo AS tipo,
            Categoria AS categoria,
            Titulo AS titulo,
            Mensaje AS mensaje,
            Severidad AS severidad,
            Estado AS estado,
            IdReserva AS idReserva,
            IdPropiedad AS idPropiedad,
            IdIncidenciaReserva
              AS idIncidenciaReserva,
            IdPropiedadCanal
              AS idPropiedadCanal,
            Origen AS origen,
            FechaAlerta AS fechaAlerta,
            FechaLectura AS fechaLectura,
            FechaResolucion AS fechaResolucion,
            DatosJson AS datosJson,
            FechaCreacion AS fechaCreacion,
            FechaActualizacion
              AS fechaActualizacion
          FROM dbo.Alertas
          WHERE
            ClaveAlerta =
              @claveAlerta;
        `);

    return this.formatearAlerta(
      resultado.recordset[0]
    );
  }

  // =========================================================
  // LISTADOS
  // =========================================================

  async obtenerTodas(
    filtros = {}
  ) {
    const pool =
      await poolPromise;

    const estado =
      filtros.estado &&
      filtros.estado !== "Todas"
        ? filtros.estado
        : null;

    const categoria =
      filtros.categoria &&
      filtros.categoria !==
        "Todas"
        ? filtros.categoria
        : null;

    const severidad =
      filtros.severidad &&
      filtros.severidad !==
        "Todas"
        ? filtros.severidad
        : null;

    const resultado =
      await pool
        .request()
        .input(
          "estado",
          sql.NVarChar(20),
          estado
        )
        .input(
          "categoria",
          sql.NVarChar(30),
          categoria
        )
        .input(
          "severidad",
          sql.NVarChar(20),
          severidad
        )
        .query(`
          SELECT
            a.IdAlerta
              AS idAlerta,

            a.ClaveAlerta
              AS claveAlerta,

            a.Tipo
              AS tipo,

            a.Categoria
              AS categoria,

            a.Titulo
              AS titulo,

            a.Mensaje
              AS mensaje,

            a.Severidad
              AS severidad,

            a.Estado
              AS estado,

            a.IdReserva
              AS idReserva,

            a.IdPropiedad
              AS idPropiedad,

            a.IdIncidenciaReserva
              AS idIncidenciaReserva,

            a.IdPropiedadCanal
              AS idPropiedadCanal,

            a.Origen
              AS origen,

            a.FechaAlerta
              AS fechaAlerta,

            a.FechaLectura
              AS fechaLectura,

            a.FechaResolucion
              AS fechaResolucion,

            a.DatosJson
              AS datosJson,

            a.FechaCreacion
              AS fechaCreacion,

            a.FechaActualizacion
              AS fechaActualizacion,

            p.Nombre
              AS propiedad

          FROM dbo.Alertas a

          LEFT JOIN dbo.Propiedades p
            ON p.IdPropiedad =
               a.IdPropiedad

          WHERE
            (
              @estado IS NULL
              OR a.Estado =
                @estado
            )

            AND (
              @categoria IS NULL
              OR a.Categoria =
                @categoria
            )

            AND (
              @severidad IS NULL
              OR a.Severidad =
                @severidad
            )

          ORDER BY
            CASE a.Estado
              WHEN N'Nueva' THEN 1
              WHEN N'Leida' THEN 2
              ELSE 3
            END,

            CASE a.Severidad
              WHEN N'Critica' THEN 1
              WHEN N'Alta' THEN 2
              WHEN N'Media' THEN 3
              ELSE 4
            END,

            a.FechaAlerta DESC,
            a.IdAlerta DESC;
        `);

    return resultado.recordset.map(
      (alerta) =>
        this.formatearAlerta(
          alerta
        )
    );
  }

  async obtenerPorId(
    idAlerta
  ) {
    const pool =
      await poolPromise;

    const resultado =
      await pool
        .request()
        .input(
          "idAlerta",
          sql.Int,
          Number(idAlerta)
        )
        .query(`
          SELECT
            IdAlerta AS idAlerta,
            ClaveAlerta AS claveAlerta,
            Tipo AS tipo,
            Categoria AS categoria,
            Titulo AS titulo,
            Mensaje AS mensaje,
            Severidad AS severidad,
            Estado AS estado,
            IdReserva AS idReserva,
            IdPropiedad AS idPropiedad,
            IdIncidenciaReserva
              AS idIncidenciaReserva,
            IdPropiedadCanal
              AS idPropiedadCanal,
            Origen AS origen,
            FechaAlerta AS fechaAlerta,
            FechaLectura AS fechaLectura,
            FechaResolucion AS fechaResolucion,
            DatosJson AS datosJson,
            FechaCreacion AS fechaCreacion,
            FechaActualizacion
              AS fechaActualizacion
          FROM dbo.Alertas
          WHERE
            IdAlerta =
              @idAlerta;
        `);

    return this.formatearAlerta(
      resultado.recordset[0] ||
      null
    );
  }

  async obtenerGeneradasActivas() {
    const pool =
      await poolPromise;

    const resultado =
      await pool.request().query(`
        SELECT
          IdAlerta AS idAlerta,
          ClaveAlerta AS claveAlerta,
          Tipo AS tipo,
          Estado AS estado
        FROM dbo.Alertas
        WHERE
          Estado IN (
            N'Nueva',
            N'Leida'
          )
          AND Tipo IN (
            N'INCIDENCIA_ABIERTA',
            N'SINCRONIZACION_ERROR',
            N'CHECKIN_PROXIMO',
            N'CONFLICTO_RESERVAS'
          );
      `);

    return resultado.recordset;
  }

  async obtenerResumen() {
    const pool =
      await poolPromise;

    const resultado =
      await pool.request().query(`
        SELECT
          COUNT(*) AS total,

          SUM(
            CASE
              WHEN Estado =
                N'Nueva'
                THEN 1
              ELSE 0
            END
          ) AS nuevas,

          SUM(
            CASE
              WHEN Estado =
                N'Leida'
                THEN 1
              ELSE 0
            END
          ) AS leidas,

          SUM(
            CASE
              WHEN Estado =
                N'Resuelta'
                THEN 1
              ELSE 0
            END
          ) AS resueltas,

          SUM(
            CASE
              WHEN Estado <> N'Resuelta'
               AND Severidad =
                 N'Critica'
                THEN 1
              ELSE 0
            END
          ) AS criticas,

          SUM(
            CASE
              WHEN Estado <> N'Resuelta'
               AND Severidad =
                 N'Alta'
                THEN 1
              ELSE 0
            END
          ) AS altas

        FROM dbo.Alertas;
      `);

    const resumen =
      resultado.recordset[0] || {};

    return {
      total:
        Number(
          resumen.total || 0
        ),

      nuevas:
        Number(
          resumen.nuevas || 0
        ),

      leidas:
        Number(
          resumen.leidas || 0
        ),

      resueltas:
        Number(
          resumen.resueltas || 0
        ),

      criticas:
        Number(
          resumen.criticas || 0
        ),

      altas:
        Number(
          resumen.altas || 0
        ),
    };
  }

  // =========================================================
  // ESTADOS
  // =========================================================

  async marcarLeida(
    idAlerta
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idAlerta",
        sql.Int,
        Number(idAlerta)
      )
      .query(`
        UPDATE dbo.Alertas
        SET
          Estado =
            CASE
              WHEN Estado =
                N'Nueva'
                THEN N'Leida'
              ELSE Estado
            END,

          FechaLectura =
            CASE
              WHEN Estado =
                N'Nueva'
                THEN SYSUTCDATETIME()
              ELSE FechaLectura
            END,

          FechaActualizacion =
            SYSUTCDATETIME()

        WHERE
          IdAlerta =
            @idAlerta;
      `);

    return this.obtenerPorId(
      idAlerta
    );
  }

  async resolver(
    idAlerta
  ) {
    const pool =
      await poolPromise;

    await pool
      .request()
      .input(
        "idAlerta",
        sql.Int,
        Number(idAlerta)
      )
      .query(`
        UPDATE dbo.Alertas
        SET
          Estado =
            N'Resuelta',

          FechaLectura =
            COALESCE(
              FechaLectura,
              SYSUTCDATETIME()
            ),

          FechaResolucion =
            COALESCE(
              FechaResolucion,
              SYSUTCDATETIME()
            ),

          FechaActualizacion =
            SYSUTCDATETIME()

        WHERE
          IdAlerta =
            @idAlerta;
      `);

    return this.obtenerPorId(
      idAlerta
    );
  }

  async resolverPorId(
    idAlerta
  ) {
    return this.resolver(
      idAlerta
    );
  }

  // =========================================================
  // HELPER
  // =========================================================

  formatearAlerta(
    alerta
  ) {
    if (!alerta) {
      return null;
    }

    let datos =
      alerta.datosJson ??
      alerta.datos ??
      null;

    if (
      typeof datos ===
      "string"
    ) {
      try {
        datos =
          JSON.parse(datos);
      } catch {
        // Conservamos el valor si viniera texto inválido.
      }
    }

    return {
      ...alerta,
      datos,
      datosJson:
        undefined,
    };
  }
}

module.exports =
  new AlertaRepository();
