const RecomendacionRepository = require(
  "../repositories/RecomendacionRepository"
);

const LimpiezaService = require(
  "./LimpiezaService"
);

const DashboardService = require(
  "./DashboardService"
);


const IaService = require(
  "./IaService"
);


class RecomendacionService {
  constructor() {
    this.horizonteConflictosDias =
      30;

    this.horizonteOcupacionDias =
      30;

    this.maximoRecomendaciones =
      10;
  }


  // =========================================================
  // HELPERS
  // =========================================================

  obtenerOrdenPrioridad(
    prioridad
  ) {
    const orden = {
      Alta: 1,
      Media: 2,
      Baja: 3,
    };

    return (
      orden[prioridad] ||
      99
    );
  }


  crearRecomendacion({
    id,
    tipo,
    prioridad,
    titulo,
    descripcion,
    accion,
    destino,
    evidencia = {},
  }) {
    return {
      id,
      tipo,
      prioridad,
      titulo,
      descripcion,
      accion,
      destino,
      evidencia,

      /*
       * V1:
       * la detección es determinística.
       *
       * Más adelante una capa de IA
       * generativa podrá interpretar
       * estas señales sin modificar
       * los hechos calculados por HostFlow.
       */
      origen:
        "Motor de reglas HostFlow",
    };
  }


  // =========================================================
  // LIMPIEZAS
  // =========================================================

  generarPorLimpiezas(
    limpiezas
  ) {
    const recomendaciones = [];

    for (
      const tarea
      of limpiezas
    ) {
      if (
        ![
          "Pendiente",
          "En progreso",
        ].includes(
          tarea.estado
        )
      ) {
        continue;
      }

      const minutos =
        tarea.minutosDisponibles ===
          null ||
        tarea.minutosDisponibles ===
          undefined
          ? null
          : Number(
              tarea.minutosDisponibles
            );

      const esUrgente =
        tarea.prioridad ===
          "Urgente" ||
        (
          minutos !== null &&
          minutos <= 180
        );

      const esAlta =
        tarea.prioridad ===
          "Alta" ||
        (
          minutos !== null &&
          minutos <= 300
        );

      if (
        !esUrgente &&
        !esAlta
      ) {
        continue;
      }

      const prioridad =
        esUrgente
          ? "Alta"
          : "Media";

      const descripcion =
        minutos === null
          ? `${tarea.propiedad} tiene una limpieza operativa pendiente.`
          : minutos <= 0
          ? `${tarea.propiedad} tiene una limpieza sin margen antes del próximo ingreso.`
          : `${tarea.propiedad} dispone de ${minutos} minutos entre el check-out y el próximo check-in.`;

      recomendaciones.push(
        this.crearRecomendacion({
          id:
            `limpieza-${tarea.idTareaLimpieza}`,

          tipo:
            "limpieza_prioritaria",

          prioridad,

          titulo:
            minutos !== null &&
            minutos <= 0
              ? "Limpieza sin margen"
              : "Limpieza prioritaria",

          descripcion,

          accion:
            tarea.estado ===
              "En progreso"
              ? "Revisar y completar la tarea de limpieza."
              : "Coordinar e iniciar la limpieza lo antes posible.",

          destino: {
            seccion:
              "limpiezas",

            idTareaLimpieza:
              Number(
                tarea.idTareaLimpieza
              ),

            idPropiedad:
              Number(
                tarea.idPropiedad
              ),

            idReservaSalida:
              Number(
                tarea.idReservaSalida
              ),

            idReservaSiguiente:
              tarea.idReservaSiguiente
                ? Number(
                    tarea.idReservaSiguiente
                  )
                : null,
          },

          evidencia: {
            estado:
              tarea.estado,

            prioridadLimpieza:
              tarea.prioridad,

            minutosDisponibles:
              minutos,

            fechaInicio:
              tarea.fechaInicio,

            horaInicio:
              tarea.horaInicio,

            fechaLimite:
              tarea.fechaLimite,

            horaLimite:
              tarea.horaLimite,
          },
        })
      );
    }

    return recomendaciones;
  }


  // =========================================================
  // CONFLICTOS
  // =========================================================

  generarPorConflictos(
    conflictos
  ) {
    return conflictos.map(
      (conflicto) =>
        this.crearRecomendacion({
          id:
            `conflicto-${conflicto.idReservaA}-${conflicto.idReservaB}`,

          tipo:
            "conflicto_reservas",

          prioridad:
            "Alta",

          titulo:
            "Conflicto de disponibilidad",

          descripcion:
            `${conflicto.propiedad} tiene dos reservas activas que se superponen: #${conflicto.idReservaA} (${conflicto.canalA}) y #${conflicto.idReservaB} (${conflicto.canalB}).`,

          accion:
            "Revisar ambas reservas y coordinar la operación de la propiedad.",

          destino: {
            seccion:
              "reservas",

            idReserva:
              Number(
                conflicto.idReservaA
              ),

            idReservaRelacionada:
              Number(
                conflicto.idReservaB
              ),

            idPropiedad:
              Number(
                conflicto.idPropiedad
              ),
          },

          evidencia: {
            reservaA: {
              idReserva:
                Number(
                  conflicto.idReservaA
                ),

              canal:
                conflicto.canalA,

              fechaIngreso:
                conflicto.fechaIngresoA,

              horaIngreso:
                conflicto.horaIngresoA,

              fechaEgreso:
                conflicto.fechaEgresoA,

              horaEgreso:
                conflicto.horaEgresoA,
            },

            reservaB: {
              idReserva:
                Number(
                  conflicto.idReservaB
                ),

              canal:
                conflicto.canalB,

              fechaIngreso:
                conflicto.fechaIngresoB,

              horaIngreso:
                conflicto.horaIngresoB,

              fechaEgreso:
                conflicto.fechaEgresoB,

              horaEgreso:
                conflicto.horaEgresoB,
            },
          },
        })
    );
  }


  // =========================================================
  // OCUPACIÓN PRÓXIMA
  // =========================================================

  generarPorOcupacion(
    ocupacionProxima
  ) {
    const recomendaciones = [];

    for (
      const item
      of ocupacionProxima
    ) {
      /*
       * Una propiedad activa con 0 o 1 reserva
       * y ocupación proyectada <= 25% en los
       * próximos 30 días merece revisión.
       */
      if (
        item.ocupacion > 25 ||
        item.reservasProximas > 1
      ) {
        continue;
      }

      recomendaciones.push(
        this.crearRecomendacion({
          id:
            `ocupacion-${item.idPropiedad}`,

          tipo:
            "ocupacion_baja",

          prioridad:
            "Media",

          titulo:
            "Baja ocupación próxima",

          descripcion:
            `${item.propiedad} tiene ${item.ocupacion}% de ocupación proyectada para los próximos ${this.horizonteOcupacionDias} días y ${item.reservasProximas} reserva(s) operativa(s) en ese período.`,

          accion:
            "Revisar disponibilidad, publicación y estrategia comercial de la propiedad.",

          destino: {
            seccion:
              "propiedades",

            idPropiedad:
              Number(
                item.idPropiedad
              ),
          },

          evidencia: {
            horizonteDias:
              this.horizonteOcupacionDias,

            ocupacion:
              item.ocupacion,

            nochesOcupadas:
              item.nochesOcupadas,

            nochesDisponibles:
              item.nochesDisponibles,

            reservasProximas:
              item.reservasProximas,
          },
        })
      );
    }

    return recomendaciones;
  }


  // =========================================================
  // TENDENCIA GENERAL DE OCUPACIÓN
  // =========================================================

  generarPorHistorico(
    historico
  ) {
    if (
      !Array.isArray(historico) ||
      historico.length < 2
    ) {
      return [];
    }

    const mesActual =
      historico[0];

    const mesAnterior =
      historico[1];

    const ocupacionActual =
      Number(
        mesActual.ocupacionMensual ||
        0
      );

    const ocupacionAnterior =
      Number(
        mesAnterior.ocupacionMensual ||
        0
      );

    const diferencia =
      ocupacionActual -
      ocupacionAnterior;

    if (
      diferencia > -20
    ) {
      return [];
    }

    return [
      this.crearRecomendacion({
        id:
          `tendencia-ocupacion-${mesActual.mes}`,

        tipo:
          "caida_ocupacion",

        prioridad:
          "Media",

        titulo:
          "Caída de ocupación",

        descripcion:
          `La ocupación mensual pasó de ${ocupacionAnterior}% a ${ocupacionActual}% (${Math.abs(diferencia)} puntos menos).`,

        accion:
          "Revisar qué propiedades explican la caída y validar disponibilidad y demanda.",

        destino: {
          seccion:
            "reportes",
        },

        evidencia: {
          mesActual:
            mesActual.mes,

          ocupacionActual,

          mesAnterior:
            mesAnterior.mes,

          ocupacionAnterior,

          diferenciaPuntos:
            diferencia,
        },
      }),
    ];
  }


  // =========================================================
  // CAPA GENERATIVA
  // =========================================================

  aplicarContenidoIA(
    recomendaciones,
    resultadoIA
  ) {
    if (
      !resultadoIA
        ?.aplicada ||
      !Array.isArray(
        resultadoIA
          .recomendaciones
      )
    ) {
      return recomendaciones;
    }

    const porId =
      new Map(
        resultadoIA
          .recomendaciones
          .map(
            (item) => [
              item.id,
              item,
            ]
          )
      );

    return recomendaciones.map(
      (recomendacion) => {
        const enriquecida =
          porId.get(
            recomendacion.id
          );

        if (!enriquecida) {
          return recomendacion;
        }

        return {
          ...recomendacion,

          titulo:
            enriquecida.titulo ||
            recomendacion.titulo,

          descripcion:
            enriquecida.descripcion ||
            recomendacion.descripcion,

          accion:
            enriquecida.accion ||
            recomendacion.accion,

          fundamentoIA:
            enriquecida.fundamento ||
            null,

          baseDeterministica: {
            titulo:
              recomendacion.titulo,

            descripcion:
              recomendacion.descripcion,

            accion:
              recomendacion.accion,
          },

          origen:
            "Motor de reglas HostFlow + IA generativa",
        };
      }
    );
  }


  // =========================================================
  // OBTENER RECOMENDACIONES
  // =========================================================

  async obtenerRecomendaciones(
    opciones = {}
  ) {
    const usarIA =
      opciones.usarIA !==
      false;

    const fechaNegocio =
      DashboardService
        .obtenerFechaActualArgentina();

    const [
      limpiezas,
      conflictos,
      ocupacionProxima,
      historico,
    ] =
      await Promise.all([
        LimpiezaService
          .obtenerLimpiezas(),

        RecomendacionRepository
          .obtenerConflictosProximos(
            fechaNegocio,
            this.horizonteConflictosDias
          ),

        RecomendacionRepository
          .obtenerOcupacionProxima(
            fechaNegocio,
            this.horizonteOcupacionDias
          ),

        DashboardService
          .obtenerHistoricoMensual(
            3
          ),
      ]);

    const recomendacionesBase = [
      ...this.generarPorLimpiezas(
        limpiezas
      ),

      ...this.generarPorConflictos(
        conflictos
      ),

      ...this.generarPorOcupacion(
        ocupacionProxima
      ),

      ...this.generarPorHistorico(
        historico
      ),
    ]
      .sort(
        (
          a,
          b
        ) => {
          const porPrioridad =
            this.obtenerOrdenPrioridad(
              a.prioridad
            ) -
            this.obtenerOrdenPrioridad(
              b.prioridad
            );

          if (
            porPrioridad !== 0
          ) {
            return porPrioridad;
          }

          return a.titulo
            .localeCompare(
              b.titulo,
              "es"
            );
        }
      )
      .slice(
        0,
        this.maximoRecomendaciones
      );

    let resultadoIA = {
      aplicada:
        false,

      modelo:
        IaService
          .obtenerEstado()
          .modelo,

      motivo:
        usarIA
          ? "La capa generativa no se ejecutó."
          : "La capa generativa fue desactivada mediante el parámetro ia=false.",

      recomendaciones:
        [],
    };

    if (
      usarIA &&
      recomendacionesBase
        .length >
        0
    ) {
      try {
        resultadoIA =
          await IaService
            .enriquecerRecomendaciones({
              fechaNegocio,

              recomendaciones:
                recomendacionesBase,
            });
      } catch (error) {
        console.error(
          "No se pudo aplicar la capa generativa de IA. Se utilizará el fallback determinístico:",
          error.message
        );

        resultadoIA = {
          aplicada:
            false,

          modelo:
            IaService
              .obtenerEstado()
              .modelo,

          motivo:
            error.message,

          recomendaciones:
            [],
        };
      }
    }

    const recomendaciones =
      this.aplicarContenidoIA(
        recomendacionesBase,
        resultadoIA
      );

    const resumen = {
      total:
        recomendaciones.length,

      altas:
        recomendaciones.filter(
          (item) =>
            item.prioridad ===
            "Alta"
        ).length,

      medias:
        recomendaciones.filter(
          (item) =>
            item.prioridad ===
            "Media"
        ).length,

      bajas:
        recomendaciones.filter(
          (item) =>
            item.prioridad ===
            "Baja"
        ).length,
    };

    return {
      fechaNegocio,

      generadoEn:
        new Date()
          .toISOString(),

      resumen,

      recomendaciones,

      contexto: {
        horizonteConflictosDias:
          this.horizonteConflictosDias,

        horizonteOcupacionDias:
          this.horizonteOcupacionDias,

        motor:
          "Reglas determinísticas V1",

        iaGenerativa: {
          solicitada:
            usarIA,

          configurada:
            IaService
              .estaConfigurada(),

          aplicada:
            Boolean(
              resultadoIA
                .aplicada
            ),

          proveedor:
            "Google Gemini",

          modelo:
            resultadoIA
              .modelo ||
            IaService
              .obtenerEstado()
              .modelo,

          motivoFallback:
            resultadoIA
              .aplicada
              ? null
              : (
                  resultadoIA
                    .motivo ||
                  null
                ),

          uso:
            resultadoIA
              .uso ||
            null,
        },
      },
    };
  }
}


module.exports =
  new RecomendacionService();