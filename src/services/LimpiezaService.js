const LimpiezaRepository = require(
  "../repositories/LimpiezaRepository"
);

class LimpiezaService {
  constructor() {
    this.zonaHoraria =
      "America/Argentina/Buenos_Aires";

    this.horizonteDias =
      365;
  }

  obtenerFechaNegocio() {
    const partes =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            this.zonaHoraria,

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit",
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

    return (
      `${valores.year}-` +
      `${valores.month}-` +
      `${valores.day}`
    );
  }

  sumarDias(
    fecha,
    dias
  ) {
    const base =
      new Date(
        `${fecha}T12:00:00Z`
      );

    base.setUTCDate(
      base.getUTCDate() +
      Number(dias)
    );

    return base
      .toISOString()
      .slice(
        0,
        10
      );
  }

  async sincronizarLimpiezas() {
    const fechaDesde =
      this.obtenerFechaNegocio();

    const fechaHasta =
      this.sumarDias(
        fechaDesde,
        this.horizonteDias
      );

    const resultado =
      await LimpiezaRepository
        .sincronizar(
          fechaDesde,
          fechaHasta
        );

    return {
      ...resultado,
      fechaDesde,
      fechaHasta,
    };
  }

  async obtenerLimpiezas(
    filtros = {}
  ) {
    await this
      .sincronizarLimpiezas();

    return LimpiezaRepository
      .obtenerTodas(
        filtros
      );
  }

  async obtenerResumen() {
    await this
      .sincronizarLimpiezas();

    return LimpiezaRepository
      .obtenerResumen();
  }

  async cambiarEstado(
    idTareaLimpieza,
    estado
  ) {
    const id =
      Number(
        idTareaLimpieza
      );

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      throw new Error(
        "La tarea de limpieza indicada no es válida."
      );
    }

    const estadosPermitidos = [
      "Pendiente",
      "En progreso",
      "Completada",
    ];

    const estadoNormalizado =
      String(
        estado || ""
      ).trim();

    if (
      !estadosPermitidos
        .includes(
          estadoNormalizado
        )
    ) {
      throw new Error(
        "El estado de la tarea de limpieza no es válido."
      );
    }

    const tarea =
      await LimpiezaRepository
        .obtenerPorId(
          id
        );

    if (!tarea) {
      throw new Error(
        "La tarea de limpieza no existe."
      );
    }

    if (
      tarea.estado ===
      "Cancelada"
    ) {
      throw new Error(
        "Una tarea cancelada automáticamente no puede cambiarse manualmente."
      );
    }

    return LimpiezaRepository
      .cambiarEstado(
        id,
        estadoNormalizado
      );
  }
}

module.exports =
  new LimpiezaService();