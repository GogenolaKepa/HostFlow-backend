const {fechaOperativa}=require('../utils/fechaOperativa');
const {
  poolPromise,
  sql,
} = require("../config/database");
const {estadoMonedas}=require('../config/monedas');
const {proyectarPrecios}=require('./precioPropiedad');
const {ErrorSeguridad}=require('../security/seguridadUsuarios');
async function conexionPropiedad(conexion){
 if(conexion===undefined||conexion===null)return poolPromise;
 if(typeof conexion.request!=='function')throw new TypeError('Contexto de Propiedades inválido.');
 return conexion;
}

class PropiedadRepository {
  async conEscrituraAtomica(ejecutar) {
    const { transaccionOperativa } = require('./transaccionOperativa');
    return transaccionOperativa('HostFlow:Operaciones:FinalizacionReservas', tx => ejecutar(Object.freeze({
      obtenerPorId: id => this.obtenerPorId(id, tx),
      obtenerEstadoPorNombre: estado => this.obtenerEstadoPorNombre(estado, tx),
      crear: (datos, estado) => this.crear(datos, estado, tx),
      actualizar: (id, datos, estado) => this.actualizar(id, datos, estado, tx),
      cambiarEstado: (id, estado) => this.cambiarEstado(id, estado, tx),
    })));
  }

  // =========================================================
  // OBTENER TODAS
  // =========================================================

  async obtenerTodas(conexion) {
    const pool = await conexionPropiedad(conexion);

    const resultado = await pool
      .request()
      .input('fechaHoy',sql.Date,fechaOperativa())
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

            AND CAST(r.FechaIngreso AS DATE) <=
              @fechaHoy

            AND CAST(r.FechaEgreso AS DATE) >
              @fechaHoy

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

            AND CAST(r.FechaIngreso AS DATE) >
              @fechaHoy

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

    return proyectarPrecios(resultado.recordset,pool);
  }

  // =========================================================
  // OBTENER POR ID
  // =========================================================

  async obtenerPorId(
    idPropiedad, conexion
  ) {
    const pool = await conexionPropiedad(conexion);

    const resultado = await pool
      .request()
      .input('fechaHoy',sql.Date,fechaOperativa())
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

        FROM dbo.Propiedades p ${conexion ? 'WITH (UPDLOCK, HOLDLOCK)' : ''}

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

            AND CAST(r.FechaIngreso AS DATE) <=
              @fechaHoy

            AND CAST(r.FechaEgreso AS DATE) >
              @fechaHoy

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

            AND CAST(r.FechaIngreso AS DATE) >
              @fechaHoy

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

    return (await proyectarPrecios(resultado.recordset,pool))[0]||null;
  }

  // =========================================================
  // OBTENER ESTADO POR NOMBRE
  // =========================================================

  async obtenerEstadoPorNombre(
    estado, conexion
  ) {
    const pool = await conexionPropiedad(conexion);

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
    idEstadoPropiedad, conexion
  ) {
    const pool = await conexionPropiedad(conexion);

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
        sql.VarChar(40),
        String(datos.precioBase)
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
          CONVERT(decimal(18,2),@precioBase),
          @idEstadoPropiedad,
          SYSDATETIME()
        );
      `);

    const idPropiedad =
      resultado.recordset[0]
        .idPropiedad;

    return this.obtenerPorId(
      idPropiedad, conexion
    );
  }

  // =========================================================
  // ACTUALIZAR
  // =========================================================

  async actualizar(
    idPropiedad,
    datos,
    idEstadoPropiedad, conexion
  ) {
    const pool = await conexionPropiedad(conexion);

    const resultado = await pool
      .request()
      .input('preservarPrecio',sql.Bit,datos.preservarPrecio===true)
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
        sql.VarChar(40),
        String(datos.precioBase)
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
          PrecioBase = CASE WHEN @preservarPrecio=1 THEN PrecioBase ELSE CONVERT(decimal(18,2),@precioBase) END,
          IdEstadoPropiedad = @idEstadoPropiedad

        WHERE
          IdPropiedad =
            @idPropiedad
            ${estadoMonedas().activado?'AND (@preservarPrecio=1 OR NOT EXISTS(SELECT 1 FROM dbo.TarifasPropiedad t WHERE t.IdPropiedad=@idPropiedad))':''};
      `);

    if(estadoMonedas().activado&&resultado.rowsAffected?.reduce((a,b)=>a+b,0)!==1)
      throw new ErrorSeguridad(409,'MONEDAS_PRECIO_AUTORITATIVO','La tarifa declarada se modifica únicamente desde Monedas y cotizaciones. Recargá los datos.');

    return this.obtenerPorId(
      idPropiedad, conexion
    );
  }

  // =========================================================
  // CAMBIAR ESTADO
  // =========================================================

  async cambiarEstado(
    idPropiedad,
    idEstadoPropiedad, conexion
  ) {
    const pool = await conexionPropiedad(conexion);

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
      idPropiedad, conexion
    );
  }
}

module.exports =
  new PropiedadRepository();
