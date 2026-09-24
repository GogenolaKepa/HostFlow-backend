const AlertaRepository = require(
  "../repositories/AlertaRepository"
);

class AlertaService {
  // =========================================================
  // FECHA ARGENTINA
  // =========================================================

  obtenerFechaArgentina(
    fecha = new Date()
  ) {
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
        fecha
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

  sumarDias(
    fechaIso,
    cantidadDias
  ) {
    const [
      anio,
      mes,
      dia,
    ] =
      fechaIso
        .split("-")
        .map(Number);

    const fecha =
      new Date(
        Date.UTC(
          anio,
          mes - 1,
          dia
        )
      );

    fecha.setUTCDate(
      fecha.getUTCDate() +
        cantidadDias
    );

    return fecha
      .toISOString()
      .slice(0, 10);
  }

  diferenciaDias(
    fechaDesde,
    fechaHasta
  ) {
    const desde =
      new Date(
        `${fechaDesde}T00:00:00Z`
      );

    const hasta =
      new Date(
        `${fechaHasta}T00:00:00Z`
      );

    return Math.round(
      (
        hasta.getTime() -
        desde.getTime()
      ) /
        86400000
    );
  }

  // =========================================================
  // CONSTRUIR ALERTAS ACTUALES
  // =========================================================

  async construirAlertasOperativas() {
    const hoy =
      this.obtenerFechaArgentina();

    const limiteCheckins =
      this.sumarDias(
        hoy,
        2
      );

    const [
      incidencias,
      sincronizaciones,
      checkins,
      conflictos,
    ] =
      await Promise.all([
        AlertaRepository
          .obtenerIncidenciasAlertables(),

        AlertaRepository
          .obtenerSincronizacionesConError(),

        AlertaRepository
          .obtenerCheckinsProximos(
            hoy,
            limiteCheckins
          ),

        AlertaRepository
          .obtenerConflictosActivos(
            hoy
          ),
      ]);

    const alertas = [];

    // =======================================================
    // INCIDENCIAS
    // =======================================================

    for (
      const incidencia
      of incidencias
    ) {
      const severidad =
        incidencia.severidad ===
          "Critica"
          ? "Critica"
          : incidencia.severidad ===
            "Alta"
          ? "Alta"
          : incidencia.severidad ===
            "Media"
          ? "Media"
          : "Informativa";

      alertas.push({
        claveAlerta:
          `INCIDENCIA:${incidencia.idIncidenciaReserva}`,

        tipo:
          "INCIDENCIA_ABIERTA",

        categoria:
          "Incidencia",

        titulo:
          incidencia.tituloIncidencia,

        mensaje:
          `${incidencia.propiedad} · Reserva #${incidencia.idReserva} · ${incidencia.estadoIncidencia}.`,

        severidad,

        idReserva:
          incidencia.idReserva,

        idPropiedad:
          incidencia.idPropiedad,

        idIncidenciaReserva:
          incidencia.idIncidenciaReserva,

        origen:
          "HostFlow",

        datos: {
          tipoIncidencia:
            incidencia.tipoIncidencia,

          descripcion:
            incidencia.descripcion,

          huesped:
            incidencia.huesped,

          estadoIncidencia:
            incidencia.estadoIncidencia,
        },
      });
    }

    // =======================================================
    // ERRORES DE SINCRONIZACIÓN
    // =======================================================

    for (
      const sync
      of sincronizaciones
    ) {
      alertas.push({
        claveAlerta:
          `SYNC_ERROR:${sync.idPropiedadCanal}`,

        tipo:
          "SINCRONIZACION_ERROR",

        categoria:
          "Sincronizacion",

        titulo:
          `Error de sincronización con ${sync.canal}`,

        mensaje:
          `${sync.propiedad} no pudo sincronizarse correctamente con ${sync.canal}.`,

        severidad:
          "Alta",

        idPropiedad:
          sync.idPropiedad,

        idPropiedadCanal:
          sync.idPropiedadCanal,

        origen:
          sync.canal ===
            "Airbnb" ||
          sync.canal ===
            "Booking"
            ? sync.canal
            : "Sistema",

        datos: {
          canal:
            sync.canal,

          mensajeError:
            sync.mensajeError,

          estadoPublicacion:
            sync.estadoPublicacion,
        },
      });
    }

    // =======================================================
    // CHECK-INS PRÓXIMOS
    // =======================================================

    for (
      const reserva
      of checkins
    ) {
      const dias =
        this.diferenciaDias(
          hoy,
          reserva.fechaIngreso
        );

      let textoTiempo =
        "en los próximos días";

      let severidad =
        "Informativa";

      if (dias === 0) {
        textoTiempo =
          "hoy";

        severidad =
          "Alta";
      } else if (
        dias === 1
      ) {
        textoTiempo =
          "mañana";

        severidad =
          "Media";
      } else if (
        dias === 2
      ) {
        textoTiempo =
          "en 2 días";
      }

      alertas.push({
        claveAlerta:
          `CHECKIN:${reserva.idReserva}`,

        tipo:
          "CHECKIN_PROXIMO",

        categoria:
          "Reserva",

        titulo:
          "Check-in próximo",

        mensaje:
          `${reserva.huesped} ingresa ${textoTiempo} en ${reserva.propiedad}.`,

        severidad,

        idReserva:
          reserva.idReserva,

        idPropiedad:
          reserva.idPropiedad,

        origen:
          "Sistema",

        datos: {
          huesped:
            reserva.huesped,

          propiedad:
            reserva.propiedad,

          canal:
            reserva.canal,

          fechaIngreso:
            reserva.fechaIngreso,

          fechaEgreso:
            reserva.fechaEgreso,

          diasRestantes:
            dias,
        },
      });
    }

    // =======================================================
    // CONFLICTOS ACTIVOS
    // =======================================================

    for (
      const conflicto
      of conflictos
    ) {
      const [
        idMenor,
        idMayor,
      ] = [
        Number(
          conflicto.idReservaA
        ),
        Number(
          conflicto.idReservaB
        ),
      ].sort(
        (a, b) =>
          a - b
      );

      alertas.push({
        claveAlerta:
          `CONFLICTO:${idMenor}:${idMayor}`,

        tipo:
          "CONFLICTO_RESERVAS",

        categoria:
          "Reserva",

        titulo:
          "Conflicto de reservas detectado",

        mensaje:
          `${conflicto.propiedad} tiene reservas superpuestas (#${idMenor} y #${idMayor}).`,

        severidad:
          "Critica",

        idReserva:
          idMayor,

        idPropiedad:
          conflicto.idPropiedad,

        origen:
          "Sistema",

        datos: {
          idReservaA:
            conflicto.idReservaA,

          idReservaB:
            conflicto.idReservaB,

          canalA:
            conflicto.canalA,

          canalB:
            conflicto.canalB,

          huespedA:
            conflicto.huespedA,

          huespedB:
            conflicto.huespedB,

          fechaInicioConflicto:
            conflicto.fechaInicioConflicto,

          fechaFinConflicto:
            conflicto.fechaFinConflicto,
        },
      });
    }

    return alertas;
  }

  // =========================================================
  // SINCRONIZAR TABLA DE ALERTAS
  // =========================================================

  async sincronizarAlertasOperativas() {
    const alertasActuales =
      await this
        .construirAlertasOperativas();

    const clavesActivas =
      new Set(
        alertasActuales.map(
          (alerta) =>
            alerta.claveAlerta
        )
      );

    let creadasOActualizadas =
      0;

    for (
      const alerta
      of alertasActuales
    ) {
      await AlertaRepository
        .crearOActualizarPorClave(
          alerta
        );

      creadasOActualizadas +=
        1;
    }

    /*
     * Una alerta automática deja de estar activa cuando la
     * condición que la originó ya no existe.
     *
     * Ejemplos:
     * - incidencia resuelta;
     * - sincronización recuperada;
     * - check-in que ya pasó;
     * - conflicto que ya no existe.
     */
    const generadasActivas =
      await AlertaRepository
        .obtenerGeneradasActivas();

    let resueltasAutomaticamente =
      0;

    for (
      const alerta
      of generadasActivas
    ) {
      if (
        !clavesActivas.has(
          alerta.claveAlerta
        )
      ) {
        await AlertaRepository
          .resolverPorId(
            alerta.idAlerta
          );

        resueltasAutomaticamente +=
          1;
      }
    }

    return {
      detectadas:
        alertasActuales.length,

      creadasOActualizadas,

      resueltasAutomaticamente,
    };
  }

  // =========================================================
  // CONSULTAS
  // =========================================================

  async obtenerAlertas(
    filtros = {}
  ) {
    await this
      .sincronizarAlertasOperativas();

    return AlertaRepository
      .obtenerTodas(
        filtros
      );
  }

  async obtenerResumen() {
    await this
      .sincronizarAlertasOperativas();

    return AlertaRepository
      .obtenerResumen();
  }

  // =========================================================
  // ACCIONES
  // =========================================================

  async marcarLeida(
    idAlerta
  ) {
    const alerta =
      await AlertaRepository
        .obtenerPorId(
          idAlerta
        );

    if (!alerta) {
      throw new Error(
        "La alerta no existe."
      );
    }

    return AlertaRepository
      .marcarLeida(
        idAlerta
      );
  }

  async resolverAlerta(
    idAlerta
  ) {
    const alerta =
      await AlertaRepository
        .obtenerPorId(
          idAlerta
        );

    if (!alerta) {
      throw new Error(
        "La alerta no existe."
      );
    }

    return AlertaRepository
      .resolver(
        idAlerta
      );
  }
}

module.exports =
  new AlertaService();
