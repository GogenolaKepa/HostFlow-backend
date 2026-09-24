const DashboardResumen = require(
  "../models/DashboardResumen"
);

const DashboardRepository = require(
  "../repositories/DashboardRepository"
);

const AlertaService = require(
  "./AlertaService"
);

class DashboardService {
  // =========================================================
  // FECHA ACTUAL DE NEGOCIO
  // =========================================================

  obtenerFechaActualArgentina() {
    const partes =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            "America/Argentina/Buenos_Aires",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }
      ).formatToParts(
        new Date()
      );

    const valores = {};

    for (
      const parte
      of partes
    ) {
      if (
        parte.type !==
        "literal"
      ) {
        valores[
          parte.type
        ] =
          parte.value;
      }
    }

    return `${valores.year}-${valores.month}-${valores.day}`;
  }

  obtenerRangoMes(
    fechaActual
  ) {
    const [
      anio,
      mes,
    ] =
      fechaActual
        .split("-")
        .map(Number);

    const inicioMes =
      `${anio}-${String(
        mes
      ).padStart(
        2,
        "0"
      )}-01`;

    const siguienteMes =
      mes === 12
        ? {
            anio:
              anio + 1,
            mes: 1,
          }
        : {
            anio,
            mes:
              mes + 1,
          };

    const finMes =
      `${siguienteMes.anio}-${String(
        siguienteMes.mes
      ).padStart(
        2,
        "0"
      )}-01`;

    const diasMes =
      new Date(
        Date.UTC(
          siguienteMes.anio,
          siguienteMes.mes - 1,
          0
        )
      ).getUTCDate();

    return {
      inicioMes,
      finMes,
      diasMes,
    };
  }

  // =========================================================
  // ALERTAS REALES
  // =========================================================

  async obtenerAlertas() {
    const alertas =
      await AlertaService
        .obtenerAlertas();

    /*
     * En Inicio mostramos solamente alertas
     * operativas activas.
     *
     * Las resueltas siguen disponibles en
     * el Centro de alertas.
     */
    return alertas
      .filter(
        (alerta) =>
          alerta.estado !==
          "Resuelta"
      )
      .slice(
        0,
        4
      );
  }

  // =========================================================
  // RESUMEN REAL
  // =========================================================

  async obtenerResumen(
    alertasActivas = []
  ) {
    const fechaActual =
      this.obtenerFechaActualArgentina();

    const rangoMes =
      this.obtenerRangoMes(
        fechaActual
      );

    const datos =
      await DashboardRepository
        .obtenerResumen({
          fechaActual,
          ...rangoMes,
        });

    const alertasPendientes =
      alertasActivas.length;

    return new DashboardResumen(
      datos.propiedadesActivas,
      datos.reservasActivas,
      datos.huespedesRegistrados,
      datos.ingresosMes,
      datos.ocupacionMensual,
      alertasPendientes
    );
  }

  // =========================================================
  // PRÓXIMAS RESERVAS REALES
  // =========================================================

  async obtenerProximasReservas() {
    const fechaActual =
      this.obtenerFechaActualArgentina();

    return DashboardRepository
      .obtenerProximasReservas(
        fechaActual,
        5
      );
  }
  // =========================================================
  // HISTÓRICO MENSUAL
  // =========================================================

  async obtenerHistoricoMensual(
    meses = 6
  ) {
    const fechaActual =
      this.obtenerFechaActualArgentina();

    return DashboardRepository
      .obtenerHistoricoMensual(
        fechaActual,
        meses
      );
  }


  // =========================================================
  // REPORTES
  // =========================================================

  validarFechaISO(
    fecha
  ) {
    return /^\d{4}-\d{2}-\d{2}$/
      .test(
        String(
          fecha || ""
        )
      );
  }

  sumarDiasFechaISO(
    fecha,
    dias
  ) {
    const [
      anio,
      mes,
      dia,
    ] =
      fecha
        .split("-")
        .map(Number);

    const valor =
      new Date(
        Date.UTC(
          anio,
          mes - 1,
          dia
        )
      );

    valor.setUTCDate(
      valor.getUTCDate() +
        dias
    );

    return valor
      .toISOString()
      .slice(
        0,
        10
      );
  }

  obtenerRangoReportes(
    fechaActual,
    meses = 6
  ) {
    const cantidadMeses =
      [3, 6, 12].includes(
        Number(
          meses
        )
      )
        ? Number(
            meses
          )
        : 6;

    const [
      anioActual,
      mesActual,
    ] =
      fechaActual
        .split("-")
        .map(Number);

    const inicioActual =
      new Date(
        Date.UTC(
          anioActual,
          mesActual - 1,
          1
        )
      );

    const inicioPeriodo =
      new Date(
        Date.UTC(
          anioActual,
          mesActual -
            cantidadMeses,
          1
        )
      );

    const fechaDesde =
      inicioPeriodo
        .toISOString()
        .slice(
          0,
          10
        );

    const fechaHastaExclusiva =
      new Date(
        Date.UTC(
          inicioActual
            .getUTCFullYear(),
          inicioActual
            .getUTCMonth() + 1,
          1
        )
      )
        .toISOString()
        .slice(
          0,
          10
        );

    return {
      tipoPeriodo:
        "rapido",

      meses:
        cantidadMeses,

      fechaDesde,

      fechaHasta:
        this.sumarDiasFechaISO(
          fechaHastaExclusiva,
          -1
        ),

      fechaHastaExclusiva,
    };
  }

  prepararFiltrosReportes(
    filtros = {}
  ) {
    const fechaActual =
      this.obtenerFechaActualArgentina();

    const periodoSolicitado =
      String(
        filtros.periodo ||
        filtros.meses ||
        "6"
      );

    let periodo;

    if (
      periodoSolicitado ===
      "personalizado"
    ) {
      const fechaDesde =
        String(
          filtros.fechaDesde ||
          ""
        );

      const fechaHasta =
        String(
          filtros.fechaHasta ||
          ""
        );

      if (
        !this.validarFechaISO(
          fechaDesde
        ) ||
        !this.validarFechaISO(
          fechaHasta
        )
      ) {
        throw new Error(
          "Debe indicar una fecha desde y una fecha hasta válidas."
        );
      }

      if (
        fechaDesde >
        fechaHasta
      ) {
        throw new Error(
          "La fecha desde no puede ser posterior a la fecha hasta."
        );
      }

      periodo = {
        tipoPeriodo:
          "personalizado",

        meses:
          null,

        fechaDesde,

        fechaHasta,

        fechaHastaExclusiva:
          this.sumarDiasFechaISO(
            fechaHasta,
            1
          ),
      };
    } else {
      periodo =
        this.obtenerRangoReportes(
          fechaActual,
          Number(
            periodoSolicitado
          )
        );
    }

    const idPropiedadNumero =
      filtros.idPropiedad
        ? Number(
            filtros.idPropiedad
          )
        : null;

    if (
      idPropiedadNumero !==
        null &&
      (
        !Number.isInteger(
          idPropiedadNumero
        ) ||
        idPropiedadNumero <= 0
      )
    ) {
      throw new Error(
        "La propiedad indicada no es válida."
      );
    }

    return {
      ...periodo,

      idPropiedad:
        idPropiedadNumero,

      canal:
        filtros.canal
          ? String(
              filtros.canal
            ).trim()
          : null,

      estado:
        filtros.estado
          ? String(
              filtros.estado
            ).trim()
          : null,
    };
  }

  async obtenerOpcionesReportes() {
    return DashboardRepository
      .obtenerOpcionesReportes();
  }

  async obtenerReportes(
    filtros = {}
  ) {
    const filtrosPreparados =
      this.prepararFiltrosReportes(
        filtros
      );

    const [
      datos,
      historico,
    ] =
      await Promise.all([
        DashboardRepository
          .obtenerReportes(
            filtrosPreparados
          ),

        DashboardRepository
          .obtenerHistoricoReportes(
            filtrosPreparados
          ),
      ]);

    const nochesOcupadas =
      historico.reduce(
        (
          total,
          mes
        ) =>
          total +
          Number(
            mes.nochesOcupadas ||
            0
          ),
        0
      );

    const nochesDisponibles =
      historico.reduce(
        (
          total,
          mes
        ) =>
          total +
          Number(
            mes.nochesDisponibles ||
            0
          ),
        0
      );

    const ocupacionPromedio =
      nochesDisponibles > 0
        ? Math.round(
            (
              nochesOcupadas /
              nochesDisponibles
            ) * 100
          )
        : 0;

    const totalCanales =
      datos.porCanal.reduce(
        (
          total,
          item
        ) =>
          total +
          Number(
            item.cantidad ||
            0
          ),
        0
      );

    const totalEstados =
      datos.porEstado.reduce(
        (
          total,
          item
        ) =>
          total +
          Number(
            item.cantidad ||
            0
          ),
        0
      );

    const totalIngresosPropiedades =
      datos.porPropiedad.reduce(
        (
          total,
          item
        ) =>
          total +
          Number(
            item.ingresosEstimados ||
            0
          ),
        0
      );

    return {
      periodo: {
        tipo:
          filtrosPreparados
            .tipoPeriodo,

        meses:
          filtrosPreparados
            .meses,

        fechaDesde:
          filtrosPreparados
            .fechaDesde,

        fechaHasta:
          filtrosPreparados
            .fechaHasta,
      },

      filtros: {
        idPropiedad:
          filtrosPreparados
            .idPropiedad,

        canal:
          filtrosPreparados
            .canal,

        estado:
          filtrosPreparados
            .estado,
      },

      resumen: {
        ...datos.resumen,

        nochesOcupadas,
        nochesDisponibles,
        ocupacionPromedio,
      },

      historico,

      porCanal:
        datos.porCanal.map(
          (item) => ({
            ...item,

            porcentaje:
              totalCanales > 0
                ? Math.round(
                    (
                      item.cantidad /
                      totalCanales
                    ) * 100
                  )
                : 0,
          })
        ),

      porEstado:
        datos.porEstado.map(
          (item) => ({
            ...item,

            porcentaje:
              totalEstados > 0
                ? Math.round(
                    (
                      item.cantidad /
                      totalEstados
                    ) * 100
                  )
                : 0,
          })
        ),

      porPropiedad:
        datos.porPropiedad.map(
          (item) => ({
            ...item,

            participacionIngresos:
              totalIngresosPropiedades >
              0
                ? Math.round(
                    (
                      item.ingresosEstimados /
                      totalIngresosPropiedades
                    ) * 100
                  )
                : 0,
          })
        ),
    };
  }

}

module.exports =
  new DashboardService();
