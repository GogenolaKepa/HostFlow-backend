const CalendarioRepository = require(
  "../repositories/CalendarioRepository"
);

class CalendarioService {
  // =========================================================
  // OBTENER CALENDARIO MENSUAL
  // =========================================================

  async obtenerCalendarioMensual(
    anio,
    mes,
    idPropiedad = null
  ) {
    const periodo =
      this.validarYConstruirPeriodo(
        anio,
        mes
      );

    const idPropiedadNormalizado =
      this.normalizarIdPropiedad(
        idPropiedad
      );

    const [
      propiedades,
      reservas,
      conflictosReservas,
    ] =
      await Promise.all([
        CalendarioRepository
          .obtenerPropiedades(
            idPropiedadNormalizado
          ),

        CalendarioRepository
          .obtenerReservas(
            periodo.fechaDesde,
            periodo.fechaHasta,
            idPropiedadNormalizado
          ),

        CalendarioRepository
          .obtenerConflictos(
            periodo.fechaDesde,
            periodo.fechaHasta,
            idPropiedadNormalizado
          ),
      ]);

    if (
      idPropiedadNormalizado !== null &&
      propiedades.length === 0
    ) {
      throw new Error(
        "La propiedad indicada no existe."
      );
    }

    const hoy =
      this.obtenerFechaHoy();

    const conflictosPorPropiedad =
      this.agruparPor(
        conflictosReservas,
        "idPropiedad"
      );

    const reservasPorPropiedad =
      this.agruparPor(
        reservas,
        "idPropiedad"
      );

    const propiedadesCalendario =
      propiedades.map(
        (propiedad) =>
          this.construirCalendarioPropiedad(
            propiedad,
            reservasPorPropiedad.get(
              Number(
                propiedad.idPropiedad
              )
            ) || [],
            conflictosPorPropiedad.get(
              Number(
                propiedad.idPropiedad
              )
            ) || [],
            periodo,
            hoy
          )
      );

    const conflictosEstadoPropiedad =
      propiedadesCalendario.flatMap(
        (propiedad) =>
          propiedad.conflictos.filter(
            (conflicto) =>
              conflicto.tipo ===
              "PROPIEDAD_NO_DISPONIBLE"
          )
      );

    const cantidadConflictosReservas =
      conflictosReservas.length;

    const cantidadConflictosEstado =
      conflictosEstadoPropiedad.length;

    return {
      periodo: {
        anio:
          periodo.anio,

        mes:
          periodo.mes,

        fechaDesde:
          periodo.fechaDesde,

        fechaHasta:
          periodo.fechaHasta,

        cantidadDias:
          periodo.cantidadDias,
      },

      filtro: {
        idPropiedad:
          idPropiedadNormalizado,
      },

      resumen: {
        cantidadPropiedades:
          propiedadesCalendario.length,

        cantidadReservas:
          reservas.length,

        cantidadConflictos:
          cantidadConflictosReservas +
          cantidadConflictosEstado,

        conflictosEntreReservas:
          cantidadConflictosReservas,

        conflictosPorEstadoPropiedad:
          cantidadConflictosEstado,
      },

      propiedades:
        propiedadesCalendario,
    };
  }

  // =========================================================
  // VALIDAR Y CONSTRUIR PERÍODO
  // =========================================================

  validarYConstruirPeriodo(
    anio,
    mes
  ) {
    const anioNumero =
      Number(anio);

    const mesNumero =
      Number(mes);

    if (
      !Number.isInteger(
        anioNumero
      ) ||
      anioNumero < 2000 ||
      anioNumero > 2100
    ) {
      throw new Error(
        "El año indicado no es válido."
      );
    }

    if (
      !Number.isInteger(
        mesNumero
      ) ||
      mesNumero < 1 ||
      mesNumero > 12
    ) {
      throw new Error(
        "El mes indicado debe estar entre 1 y 12."
      );
    }

    const cantidadDias =
      new Date(
        anioNumero,
        mesNumero,
        0
      ).getDate();

    const fechaDesde =
      this.formatearFecha(
        anioNumero,
        mesNumero,
        1
      );

    const siguienteMes =
      mesNumero === 12
        ? 1
        : mesNumero + 1;

    const siguienteAnio =
      mesNumero === 12
        ? anioNumero + 1
        : anioNumero;

    const fechaHasta =
      this.formatearFecha(
        siguienteAnio,
        siguienteMes,
        1
      );

    return {
      anio:
        anioNumero,

      mes:
        mesNumero,

      cantidadDias,

      fechaDesde,

      fechaHasta,
    };
  }

  // =========================================================
  // NORMALIZAR FILTRO DE PROPIEDAD
  // =========================================================

  normalizarIdPropiedad(
    idPropiedad
  ) {
    if (
      idPropiedad === null ||
      idPropiedad === undefined ||
      idPropiedad === ""
    ) {
      return null;
    }

    const id =
      Number(
        idPropiedad
      );

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      throw new Error(
        "El identificador de la propiedad no es válido."
      );
    }

    return id;
  }

  // =========================================================
  // CONSTRUIR CALENDARIO DE UNA PROPIEDAD
  // =========================================================

  construirCalendarioPropiedad(
    propiedad,
    reservas,
    conflictosReservas,
    periodo,
    hoy
  ) {
    const idsReservasEnConflicto =
      new Set();

    for (
      const conflicto
      of conflictosReservas
    ) {
      idsReservasEnConflicto.add(
        Number(
          conflicto.idReservaA
        )
      );

      idsReservasEnConflicto.add(
        Number(
          conflicto.idReservaB
        )
      );
    }

    const reservasFormateadas =
      reservas.map(
        (reserva) => ({
          ...reserva,

          bloqueaDisponibilidad:
            reserva
              .bloqueaDisponibilidad ===
              true ||
            reserva
              .bloqueaDisponibilidad ===
              1,

          tieneConflicto:
            idsReservasEnConflicto.has(
              Number(
                reserva.idReserva
              )
            ),
        })
      );

    const conflictos =
      conflictosReservas.map(
        (conflicto) => ({
          tipo:
            "RESERVAS_SUPERPUESTAS",

          ...conflicto,
        })
      );

    const dias = [];

    for (
      let dia = 1;
      dia <=
      periodo.cantidadDias;
      dia += 1
    ) {
      const fecha =
        this.formatearFecha(
          periodo.anio,
          periodo.mes,
          dia
        );

      const reservasDelDia =
        reservasFormateadas.filter(
          (reserva) =>
            this.reservaIncluyeFecha(
              reserva,
              fecha
            )
        );

      const reservasQueBloquean =
        reservasDelDia.filter(
          (reserva) =>
            reserva
              .bloqueaDisponibilidad
        );

      const conflictoEntreReservas =
        reservasQueBloquean.length >
        1;

      const propiedadNoDisponible =
        propiedad.estado !==
        "Activa";

      const conflictoEstadoPropiedad =
        propiedadNoDisponible &&
        reservasQueBloquean.length >
          0;

      const tieneConflicto =
        conflictoEntreReservas ||
        conflictoEstadoPropiedad;

      const estado =
        this.determinarEstadoDia({
          fecha,
          hoy,
          propiedad,
          reservasQueBloquean,
          tieneConflicto,
        });

      if (
        conflictoEstadoPropiedad
      ) {
        conflictos.push({
          tipo:
            "PROPIEDAD_NO_DISPONIBLE",

          idPropiedad:
            propiedad.idPropiedad,

          propiedad:
            propiedad.nombre,

          fecha,

          estadoPropiedad:
            propiedad.estado,

          reservas:
            reservasQueBloquean.map(
              (reserva) => ({
                idReserva:
                  reserva.idReserva,

                huesped:
                  reserva.huesped,

                canal:
                  reserva.canal,

                estado:
                  reserva.estado,
              })
            ),
        });
      }

      dias.push({
        dia,

        fecha,

        estado,

        disponible:
          estado ===
          "Disponible",

        tieneConflicto,

        reservas:
          reservasDelDia.map(
            (reserva) => ({
              idReserva:
                reserva.idReserva,

              idHuesped:
                reserva.idHuesped,

              huesped:
                reserva.huesped,

              canal:
                reserva.canal,

              estado:
                reserva.estado,

              fechaIngreso:
                reserva.fechaIngreso,

              fechaEgreso:
                reserva.fechaEgreso,

              cantidadHuespedes:
                reserva
                  .cantidadHuespedes,

              montoEstimado:
                reserva.montoEstimado,

              idExterno:
                reserva.idExterno,

              estadoSincronizacion:
                reserva
                  .estadoSincronizacion,

              bloqueaDisponibilidad:
                reserva
                  .bloqueaDisponibilidad,

              tieneConflicto:
                reserva
                  .tieneConflicto ||
                conflictoEntreReservas,
            })
          ),
      });
    }

    return {
      idPropiedad:
        propiedad.idPropiedad,

      nombre:
        propiedad.nombre,

      tipo:
        propiedad.tipo,

      ciudad:
        propiedad.ciudad,

      provincia:
        propiedad.provincia,

      capacidadMaxima:
        propiedad.capacidadMaxima,

      estado:
        propiedad.estado,

      resumen:
        this.construirResumenPropiedad(
          dias,
          reservasFormateadas,
          conflictos
        ),

      reservas:
        reservasFormateadas,

      conflictos,

      dias,
    };
  }

  // =========================================================
  // DETERMINAR ESTADO DEL DÍA
  // =========================================================

  determinarEstadoDia({
    fecha,
    hoy,
    propiedad,
    reservasQueBloquean,
    tieneConflicto,
  }) {
    if (tieneConflicto) {
      return "Conflicto";
    }

    if (
      propiedad.estado !==
      "Activa"
    ) {
      return "No disponible";
    }

    if (
      reservasQueBloquean.length ===
      0
    ) {
      return "Disponible";
    }

    /*
     * Para fechas futuras mostramos "Reservada".
     *
     * Para hoy o fechas históricas ocupadas
     * mostramos "Ocupada".
     */
    if (fecha > hoy) {
      return "Reservada";
    }

    return "Ocupada";
  }

  // =========================================================
  // RESERVA INCLUYE FECHA
  // =========================================================
  //
  // FechaIngreso es inclusiva.
  // FechaEgreso es exclusiva.
  //
  // Una reserva:
  //
  // 10/09 -> 13/09
  //
  // ocupa:
  //
  // 10, 11 y 12
  //
  // y deja libre el día 13 para un nuevo check-in.
  //
  // =========================================================

  reservaIncluyeFecha(
    reserva,
    fecha
  ) {
    return (
      fecha >=
        reserva.fechaIngreso &&
      fecha <
        reserva.fechaEgreso
    );
  }

  // =========================================================
  // RESUMEN DE PROPIEDAD
  // =========================================================

  construirResumenPropiedad(
    dias,
    reservas,
    conflictos
  ) {
    const contar =
      (estado) =>
        dias.filter(
          (dia) =>
            dia.estado ===
            estado
        ).length;

    return {
      cantidadReservas:
        reservas.length,

      cantidadConflictos:
        conflictos.length,

      diasDisponibles:
        contar(
          "Disponible"
        ),

      diasReservados:
        contar(
          "Reservada"
        ),

      diasOcupados:
        contar(
          "Ocupada"
        ),

      diasNoDisponibles:
        contar(
          "No disponible"
        ),

      diasConConflicto:
        contar(
          "Conflicto"
        ),
    };
  }

  // =========================================================
  // AGRUPAR POR CAMPO
  // =========================================================

  agruparPor(
    elementos,
    campo
  ) {
    const mapa =
      new Map();

    for (
      const elemento
      of elementos
    ) {
      const clave =
        Number(
          elemento[campo]
        );

      if (
        !mapa.has(clave)
      ) {
        mapa.set(
          clave,
          []
        );
      }

      mapa
        .get(clave)
        .push(
          elemento
        );
    }

    return mapa;
  }

  // =========================================================
  // FECHA DE HOY
  // =========================================================

  obtenerFechaHoy() {
    const ahora =
      new Date();

    return this.formatearFecha(
      ahora.getFullYear(),
      ahora.getMonth() + 1,
      ahora.getDate()
    );
  }

  // =========================================================
  // FORMATEAR FECHA YYYY-MM-DD
  // =========================================================

  formatearFecha(
    anio,
    mes,
    dia
  ) {
    return [
      String(anio)
        .padStart(4, "0"),

      String(mes)
        .padStart(2, "0"),

      String(dia)
        .padStart(2, "0"),
    ].join("-");
  }
}

module.exports =
  new CalendarioService();
