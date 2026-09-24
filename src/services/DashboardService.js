const DashboardResumen = require(
  "../models/DashboardResumen"
);

const {
  propiedades,
  reservas,
  huespedes,
} = require(
  "../data/mockData"
);

const AlertaService = require(
  "./AlertaService"
);

class DashboardService {
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
  // RESUMEN
  // =========================================================

  obtenerResumen(
    alertasActivas = []
  ) {
    const propiedadesActivas =
      propiedades.filter(
        (p) =>
          p.estado ===
          "Activa"
      ).length;

    const reservasActivas =
      reservas.filter(
        (r) =>
          r.estado ===
            "Confirmada" ||
          r.estado ===
            "Pendiente"
      ).length;

    const huespedesRegistrados =
      huespedes.length;

    const ingresosMes =
      reservas
        .filter(
          (r) =>
            r.estado ===
            "Confirmada"
        )
        .reduce(
          (
            total,
            reserva
          ) =>
            total +
            reserva.montoEstimado,
          0
        );

    const ocupacionMensual =
      68;

    /*
     * Ya no usamos alertas mock.
     * El contador del Dashboard sale de
     * las alertas reales activas de Azure.
     */
    const alertasPendientes =
      alertasActivas.length;

    return new DashboardResumen(
      propiedadesActivas,
      reservasActivas,
      huespedesRegistrados,
      ingresosMes,
      ocupacionMensual,
      alertasPendientes
    );
  }

  // =========================================================
  // PRÓXIMAS RESERVAS
  // =========================================================

  obtenerProximasReservas() {
    return reservas.map(
      (reserva) => ({
        idReserva:
          reserva.idReserva,

        huesped:
          `${reserva.huesped.nombre} ${reserva.huesped.apellido}`,

        propiedad:
          reserva.propiedad.nombre,

        canal:
          reserva.canal,

        estado:
          reserva.estado,

        fechaIngreso:
          reserva.fechaIngreso,

        fechaEgreso:
          reserva.fechaEgreso,
      })
    );
  }
}

module.exports =
  new DashboardService();
