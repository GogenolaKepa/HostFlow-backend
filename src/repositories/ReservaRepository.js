const {

  poolPromise,

  sql,

} = require("../config/database");



// La fachada reutiliza la conexión recibida sin administrar su ciclo de vida.
function validarConexion(conexion) {
  if (!conexion || typeof conexion.request !== "function") {
    throw new TypeError("El contexto transaccional requiere una conexión con request().");
  }
  return conexion;
}

async function conexionPara(conexion) {
  // Solo la ausencia explícita de contexto conserva el acceso histórico al pool.
  return conexion === null || conexion === undefined
    ? await poolPromise
    : validarConexion(conexion);
}

class ReservaRepository {
  async conAltaInboundBookingAtomica(ejecutar) {
    const { transaccionOperativa } = require('./transaccionOperativa');
    // Mismo protocolo cooperante; identidad externa y disponibilidad se leen después del lock.
    return transaccionOperativa('HostFlow:Operaciones:FinalizacionReservas', tx =>
      ejecutar(this.conContextoTransaccional(tx)));
  }

  async conCreacionManualAtomica(ejecutar) {
    const { transaccionOperativa } = require('./transaccionOperativa');
    // Antes de comprobar disponibilidad; no hay aún ID de reserva que bloquear.
    return transaccionOperativa('HostFlow:Operaciones:FinalizacionReservas', tx =>
      ejecutar(this.conContextoTransaccional(tx)));
  }

  async conCancelacionManualAtomica(idReserva, ejecutar) {
    return this.conReservaManualAtomica(idReserva, ejecutar);
  }

  async conEdicionManualAtomica(idReserva, ejecutar) {
    return this.conReservaManualAtomica(idReserva, ejecutar);
  }

  async conReservaManualAtomica(idReserva, ejecutar) {
    const { transaccionOperativa } = require('./transaccionOperativa');
    // Puente con el protocolo ya usado por finalización: mismo recurso, sin cambiarlo.
    // No coordina todavía los escritores legacy que no adquieren este applock.
    return transaccionOperativa('HostFlow:Operaciones:FinalizacionReservas', async tx => {
      await tx.request()
        .input('idReserva', sql.Int, Number(idReserva))
        .query(`SELECT IdReserva FROM dbo.Reservas WITH (UPDLOCK, HOLDLOCK)
          WHERE IdReserva = @idReserva;`);
      return ejecutar(this.conContextoTransaccional(tx));
    });
  }

  conContextoTransaccional(conexion) {
    validarConexion(conexion);
    // Fachada por operación, sin conexión mutable en el singleton ni transacción anidada.
    // conexion también se puede pasar a ReservaEventoRepository.crearEvento.
    return Object.freeze({
      conexion,
      obtenerPorId: id => this.obtenerPorId(id, conexion),
      obtenerPropiedadPorId: id => this.obtenerPropiedadPorId(id, conexion),
      obtenerHuespedPorId: id => this.obtenerHuespedPorId(id, conexion),
      obtenerControlEdicion: id => this.obtenerControlEdicion(id, conexion),
      existeConflictoFechas: (idPropiedad, ingreso, egreso, ignorada = null) =>
        this.existeConflictoFechas(idPropiedad, ingreso, egreso, ignorada, conexion),
      crearReservaManual: datos => this.crearReservaManual(datos, conexion),
      actualizarReservaManual: (id, datos) => this.actualizarReservaManual(id, datos, conexion),
      actualizarReservaManualCondicionada: (id, datos, control) =>
        this.actualizarReservaManualCondicionada(id, datos, control, conexion),
      cancelarReservaManual: id => this.cancelarReservaManual(id, conexion),
      // Preparación de altas externas: no activa una unidad de trabajo ni acusa colas.
      obtenerPorCanalEIdExterno: (canal, idExterno) =>
        this.obtenerPorCanalEIdExterno(canal, idExterno, conexion),
      obtenerHuespedPorNombreYApellido: (nombre, apellido) =>
        this.obtenerHuespedPorNombreYApellido(nombre, apellido, conexion),
      crearHuespedExterno: datos => this.crearHuespedExterno(datos, conexion),
      crearReservaExterna: datos => this.crearReservaExterna(datos, conexion),
    });
  }

  async obtenerControlEdicion(idReserva, conexion) {
    const { recordset } = await validarConexion(conexion).request()
      .input('idReserva', sql.Int, Number(idReserva))
      .query(`SELECT IdReserva AS idReserva, IdEstadoReserva AS idEstadoReserva
        FROM dbo.Reservas WHERE IdReserva = @idReserva;`);
    const control = recordset[0];
    if (!control || control.idReserva !== Number(idReserva) || !Number.isInteger(control.idEstadoReserva)) {
      throw this.conflictoEdicion();
    }
    // Estado persistido leído bajo el lock de fila; no es una revisión de formulario.
    return Object.freeze(control);
  }

  conflictoEdicion() {
    return Object.assign(new Error('La reserva cambió y no se pudo modificar. Recargá los datos antes de reintentar.'),
      { codigo: 'RESERVA_CONFLICTO_CONCURRENCIA' });
  }

  async actualizarReservaManualCondicionada(idReserva, datos, control, conexion) {
    const tx = validarConexion(conexion);
    if (!control || control.idReserva !== Number(idReserva) || !Number.isInteger(control.idEstadoReserva)) {
      throw this.conflictoEdicion();
    }
    const { recordset } = await tx.request()
      .input('idReserva', sql.Int, Number(idReserva))
      .input('idEstadoEsperado', sql.Int, control.idEstadoReserva)
      .input('fechaIngreso', sql.Date, datos.fechaIngreso)
      .input('horaIngreso', sql.VarChar(5), datos.horaIngreso || '00:00')
      .input('fechaEgreso', sql.Date, datos.fechaEgreso)
      .input('horaEgreso', sql.VarChar(5), datos.horaEgreso || '00:00')
      .input('estado', sql.NVarChar(50), datos.estado)
      .input('montoEstimado', sql.Decimal(18, 2), Number(datos.montoEstimado))
      .query(`DECLARE @IdEstadoReserva INT;
        DECLARE @Actualizadas TABLE (idReserva INT NOT NULL);
        SELECT @IdEstadoReserva = IdEstadoReserva FROM dbo.EstadosReserva WHERE Nombre = @estado;
        IF @IdEstadoReserva IS NULL
          THROW 50001, 'El estado indicado no existe.', 1;

        UPDATE dbo.Reservas
        SET FechaIngreso = CAST(CONCAT(CONVERT(CHAR(10), @fechaIngreso, 23), 'T', @horaIngreso, ':00') AS DATETIME2(0)),
            FechaEgreso = CAST(CONCAT(CONVERT(CHAR(10), @fechaEgreso, 23), 'T', @horaEgreso, ':00') AS DATETIME2(0)),
            IdEstadoReserva = @IdEstadoReserva,
            MontoEstimado = @montoEstimado,
            FechaActualizacion = SYSDATETIME()
        OUTPUT INSERTED.IdReserva INTO @Actualizadas (idReserva)
        WHERE IdReserva = @idReserva AND IdEstadoReserva = @idEstadoEsperado
          AND IdEstadoReserva IN (SELECT IdEstadoReserva FROM dbo.EstadosReserva
            WHERE Nombre NOT IN (N'Cancelada', N'Finalizada'))
          AND IdCanalReserva IN (SELECT IdCanalReserva FROM dbo.CanalesReserva WHERE Nombre = N'Manual');
        SELECT idReserva FROM @Actualizadas;`);
    // OUTPUT acreditado por ID, sin depender de rowsAffected/NOCOUNT o sumar efectos de triggers.
    if (!Array.isArray(recordset) || recordset.length !== 1 || recordset[0].idReserva !== Number(idReserva)) {
      throw this.conflictoEdicion();
    }
    return recordset[0];
  }

  async finalizarConEventos(fechaActual) {
    const { transaccionOperativa } = require('./transaccionOperativa');
    const eventos = require('./ReservaEventoRepository');
    return transaccionOperativa('HostFlow:Operaciones:FinalizacionReservas', async tx => {
      const resultado = await this.finalizarReservasVencidas(fechaActual, tx);
      for (const idReserva of resultado.idsReservas) {
        const reserva = await this.obtenerPorId(idReserva, tx);
        await eventos.crearEvento({ idReserva, tipo: 'RESERVA_FINALIZADA',
          titulo: 'Reserva finalizada automáticamente',
          descripcion: 'HostFlow marcó la reserva como finalizada porque la fecha de egreso ya había pasado.',
          origen: 'Sistema', datosJson: { estadoAnterior: 'Confirmada', estadoNuevo: 'Finalizada',
            fechaEgreso: reserva?.fechaEgreso || null, canal: reserva?.canal || null,
            propiedad: reserva?.propiedad || null, huesped: reserva?.huesped || null } }, tx);
      }
      return resultado;
    });
  }


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



        CONVERT(VARCHAR(5), CAST(r.FechaIngreso AS TIME(0)), 108) AS horaIngreso,

        CONVERT(VARCHAR(10), r.FechaEgreso, 23) AS fechaEgreso,

        CONVERT(VARCHAR(5), CAST(r.FechaEgreso AS TIME(0)), 108) AS horaEgreso,



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



  // =========================================================

  // FINALIZAR RESERVAS VENCIDAS

  // =========================================================

  //

  // Una reserva Confirmada pasa a Finalizada cuando su fecha

  // de egreso es anterior a la fecha actual de negocio.

  //

  // La fecha se recibe desde el Service para no depender de la

  // zona horaria configurada en Azure SQL.

  // =========================================================



  async finalizarReservasVencidas(fechaActual, conexion = null) {

    if (!fechaActual) {

      throw new Error(

        "La fecha actual es obligatoria para finalizar reservas vencidas."

      );

    }



    const pool = conexion || await poolPromise;



    const resultado =

      await pool

        .request()

        .input(

          "fechaActual",

          sql.Date,

          fechaActual

        )

        .query(`

          DECLARE @IdEstadoConfirmada INT;

          DECLARE @IdEstadoFinalizada INT;



          SELECT

            @IdEstadoConfirmada =

              IdEstadoReserva

          FROM dbo.EstadosReserva

          WHERE Nombre = N'Confirmada';



          SELECT

            @IdEstadoFinalizada =

              IdEstadoReserva

          FROM dbo.EstadosReserva

          WHERE Nombre = N'Finalizada';



          IF @IdEstadoConfirmada IS NULL

          BEGIN

            THROW 50001,

              'No existe el estado Confirmada.',

              1;

          END;



          IF @IdEstadoFinalizada IS NULL

          BEGIN

            THROW 50002,

              'No existe el estado Finalizada.',

              1;

          END;



          UPDATE dbo.Reservas

          SET

            IdEstadoReserva =

              @IdEstadoFinalizada,



            FechaActualizacion =

              SYSDATETIME()



          OUTPUT

            INSERTED.IdReserva

              AS idReserva



          WHERE

            IdEstadoReserva =

              @IdEstadoConfirmada



            AND FechaEgreso <

              @fechaActual;

        `);



    return {

      cantidadFinalizadas:

        resultado.recordset.length,



      idsReservas:

        resultado.recordset.map(

          (reserva) =>

            reserva.idReserva

        ),

    };

  }



  async obtenerPorId(idReserva, conexion = null) {

  const pool = await conexionPara(conexion);



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

          CONVERT(VARCHAR(5), CAST(r.FechaIngreso AS TIME(0)), 108) AS horaIngreso,



          CONVERT(

            VARCHAR(10),

            r.FechaEgreso,

            23

          ) AS fechaEgreso,

          CONVERT(VARCHAR(5), CAST(r.FechaEgreso AS TIME(0)), 108) AS horaEgreso,



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



async obtenerPropiedadPorId(idPropiedad, conexion = null) {

  const pool = await conexionPara(conexion);



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



async obtenerHuespedPorId(idHuesped, conexion = null) {

  const pool = await conexionPara(conexion);



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

  apellido,

  conexion = null

) {

  const pool = await conexionPara(conexion);



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

  idReservaIgnorada = null,

  conexion = null

) {

  const pool = await conexionPara(conexion);



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

      SELECT COUNT(\*) AS cantidad



      FROM dbo.Reservas r



      INNER JOIN dbo.EstadosReserva er

        ON r.IdEstadoReserva =

           er.IdEstadoReserva



      WHERE

        r.IdPropiedad = @idPropiedad



        AND er.Nombre NOT IN (

          N'Cancelada',

          N'No show'

        )

        ${condicionReservaIgnorada}



        AND @fechaIngreso < CAST(r.FechaEgreso AS DATE)

        AND @fechaEgreso > CAST(r.FechaIngreso AS DATE);

    `);



  return (

    Number(

      resultado.recordset[0].cantidad

    ) > 0

  );

}

async crearHuespedExterno(datos, conexion = null) {

  const pool =

    await conexionPara(conexion);



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

      .input(

        "origenRegistro",

        sql.NVarChar(50),

        datos.origenRegistro

      )

      .query(`

        INSERT INTO dbo.Huespedes (

          Nombre,

          Apellido,

          Email,

          Telefono,

          Documento,

          Nacionalidad,

          OrigenRegistro,

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

            AS nacionalidad,

          INSERTED.OrigenRegistro

            AS origenRegistro

        VALUES (

          @nombre,

          @apellido,

          @email,

          @telefono,

          @documento,

          @nacionalidad,

          @origenRegistro,

          SYSDATETIME()

        );

      `);



  return resultado.recordset[0];

}

async crearReservaManual(datos, conexion = null) {

  const pool = await conexionPara(conexion);



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

      "horaIngreso",

      sql.VarChar(5),

      datos.horaIngreso || "00:00"

    )

    .input(

      "fechaEgreso",

      sql.Date,

      datos.fechaEgreso

    )

    .input(

      "horaEgreso",

      sql.VarChar(5),

      datos.horaEgreso || "00:00"

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

        CAST(
          CONCAT(
            CONVERT(CHAR(10), @fechaIngreso, 23),
            'T',
            @horaIngreso,
            ':00'
          ) AS DATETIME2(0)
        ),

        CAST(
          CONCAT(
            CONVERT(CHAR(10), @fechaEgreso, 23),
            'T',
            @horaEgreso,
            ':00'
          ) AS DATETIME2(0)
        ),

        @cantidadHuespedes,

        @montoEstimado,

        NULL,

        N'Solo HostFlow'

      );

    `);



  const idReserva =

    resultado.recordset[0].idReserva;



  return this.obtenerPorId(idReserva, conexion);

}



async actualizarReservaManual(

  idReserva,

  datos,

  conexion = null

) {

  const pool = await conexionPara(conexion);



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

      "horaIngreso",

      sql.VarChar(5),

      datos.horaIngreso || "00:00"

    )

    .input(

      "fechaEgreso",

      sql.Date,

      datos.fechaEgreso

    )

    .input(

      "horaEgreso",

      sql.VarChar(5),

      datos.horaEgreso || "00:00"

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

        FechaIngreso = CAST(
          CONCAT(
            CONVERT(CHAR(10), @fechaIngreso, 23),
            'T',
            @horaIngreso,
            ':00'
          ) AS DATETIME2(0)
        ),

        FechaEgreso = CAST(
          CONCAT(
            CONVERT(CHAR(10), @fechaEgreso, 23),
            'T',
            @horaEgreso,
            ':00'
          ) AS DATETIME2(0)
        ),

        IdEstadoReserva = @IdEstadoReserva,

        MontoEstimado = @montoEstimado,

        FechaActualizacion = SYSDATETIME()



      WHERE IdReserva = @idReserva;

    `);



  return this.obtenerPorId(idReserva, conexion);

}

async cancelarReservaManual(idReserva, conexion = null) {

  const pool = await conexionPara(conexion);



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



  return this.obtenerPorId(idReserva, conexion);

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

      "horaIngreso",

      sql.VarChar(5),

      datos.horaIngreso || "00:00"

    )

    .input(

      "fechaEgreso",

      sql.Date,

      datos.fechaEgreso

    )

    .input(

      "horaEgreso",

      sql.VarChar(5),

      datos.horaEgreso || "00:00"

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

        FechaIngreso = CAST(
          CONCAT(
            CONVERT(CHAR(10), @fechaIngreso, 23),
            'T',
            @horaIngreso,
            ':00'
          ) AS DATETIME2(0)
        ),

        FechaEgreso = CAST(
          CONCAT(
            CONVERT(CHAR(10), @fechaEgreso, 23),
            'T',
            @horaEgreso,
            ':00'
          ) AS DATETIME2(0)
        ),

        CantidadHuespedes = @cantidadHuespedes,

        MontoEstimado = @montoEstimado,

        EstadoSincronizacion = @estadoSincronizacion,

        FechaActualizacion = SYSDATETIME()

      WHERE IdReserva = @idReserva;

    `);



  return this.obtenerPorId(idReserva);

}

async sincronizarReservaExterna(

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

      "horaIngreso",

      sql.VarChar(5),

      datos.horaIngreso || "00:00"

    )

    .input(

      "fechaEgreso",

      sql.Date,

      datos.fechaEgreso

    )

    .input(

      "horaEgreso",

      sql.VarChar(5),

      datos.horaEgreso || "00:00"

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

      "estado",

      sql.NVarChar(50),

      datos.estado || null

    )

    .query(`

      DECLARE @IdEstadoReserva INT = NULL;



      IF @estado IS NOT NULL

      BEGIN

        SELECT

          @IdEstadoReserva = IdEstadoReserva

        FROM dbo.EstadosReserva

        WHERE Nombre = @estado;



        IF @IdEstadoReserva IS NULL

        BEGIN

          THROW 50001,

            'El estado indicado no existe.',

            1;

        END;

      END;



      UPDATE dbo.Reservas

      SET

        FechaIngreso = CAST(
          CONCAT(
            CONVERT(CHAR(10), @fechaIngreso, 23),
            'T',
            @horaIngreso,
            ':00'
          ) AS DATETIME2(0)
        ),

        FechaEgreso = CAST(
          CONCAT(
            CONVERT(CHAR(10), @fechaEgreso, 23),
            'T',
            @horaEgreso,
            ':00'
          ) AS DATETIME2(0)
        ),

        CantidadHuespedes = @cantidadHuespedes,

        MontoEstimado = @montoEstimado,



        IdEstadoReserva =

          CASE

            WHEN @estado IS NULL

              THEN IdEstadoReserva

            ELSE @IdEstadoReserva

          END,



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

  idExterno,

  conexion = null

) {

  const pool = await conexionPara(conexion);



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

          CONVERT(VARCHAR(5), CAST(r.FechaIngreso AS TIME(0)), 108) AS horaIngreso,



          CONVERT(

            VARCHAR(10),

            r.FechaEgreso,

            23

          ) AS fechaEgreso,

          CONVERT(VARCHAR(5), CAST(r.FechaEgreso AS TIME(0)), 108) AS horaEgreso,



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

async crearReservaExterna(datos, conexion = null) {

  const pool = await conexionPara(conexion);



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

        "horaIngreso",

        sql.VarChar(5),

        datos.horaIngreso || "00:00"

      )

      .input(

        "fechaEgreso",

        sql.Date,

        datos.fechaEgreso

      )

      .input(

        "horaEgreso",

        sql.VarChar(5),

        datos.horaEgreso || "00:00"

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

          CAST(
            CONCAT(
              CONVERT(CHAR(10), @fechaIngreso, 23),
              'T',
              @horaIngreso,
              ':00'
            ) AS DATETIME2(0)
          ),

          CAST(
            CONCAT(
              CONVERT(CHAR(10), @fechaEgreso, 23),
              'T',
              @horaEgreso,
              ':00'
            ) AS DATETIME2(0)
          ),

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

    idReserva,

    conexion

  );

}

async obtenerPorHuesped(

  idHuesped

) {

  const pool =

    await poolPromise;



  const resultado =

    await pool

      .request()

      .input(

        "idHuesped",

        sql.Int,

        Number(idHuesped)

      )

      .query(`

        SELECT

          r.IdReserva AS idReserva,



          r.IdPropiedad AS idPropiedad,

          p.Nombre AS propiedad,



          r.IdHuesped AS idHuesped,



          cr.Nombre AS canal,



          er.Nombre AS estado,



          CONVERT(

            VARCHAR(10),

            r.FechaIngreso,

            23

          ) AS fechaIngreso,

          CONVERT(VARCHAR(5), CAST(r.FechaIngreso AS TIME(0)), 108) AS horaIngreso,



          CONVERT(

            VARCHAR(10),

            r.FechaEgreso,

            23

          ) AS fechaEgreso,

          CONVERT(VARCHAR(5), CAST(r.FechaEgreso AS TIME(0)), 108) AS horaEgreso,



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



        INNER JOIN dbo.CanalesReserva cr

          ON cr.IdCanalReserva =

             r.IdCanalReserva



        INNER JOIN dbo.EstadosReserva er

          ON er.IdEstadoReserva =

             r.IdEstadoReserva



        WHERE

          r.IdHuesped =

          @idHuesped



        ORDER BY

          r.FechaIngreso DESC,

          r.IdReserva DESC;

      `);



  return resultado.recordset;

}

}



module.exports = new ReservaRepository();
