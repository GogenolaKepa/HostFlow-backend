const DashboardResumen = require("../models/DashboardResumen");
const { propiedades, reservas, huespedes, alertas } = require("../data/mockData");

class DashboardService {
  obtenerResumen() {
    const propiedadesActivas = propiedades.filter((p) => p.estado === "Activa").length;

    const reservasActivas = reservas.filter(
      (r) => r.estado === "Confirmada" || r.estado === "Pendiente"
    ).length;

    const huespedesRegistrados = huespedes.length;

    const ingresosMes = reservas
      .filter((r) => r.estado === "Confirmada")
      .reduce((total, reserva) => total + reserva.montoEstimado, 0);

    const ocupacionMensual = 68;

    const alertasPendientes = alertas.filter((a) => !a.leida).length;

    return new DashboardResumen(
      propiedadesActivas,
      reservasActivas,
      huespedesRegistrados,
      ingresosMes,
      ocupacionMensual,
      alertasPendientes
    );
  }

  obtenerProximasReservas() {
    return reservas.map((reserva) => ({
      idReserva: reserva.idReserva,
      huesped: `${reserva.huesped.nombre} ${reserva.huesped.apellido}`,
      propiedad: reserva.propiedad.nombre,
      canal: reserva.canal,
      estado: reserva.estado,
      fechaIngreso: reserva.fechaIngreso,
      fechaEgreso: reserva.fechaEgreso
    }));
  }

  obtenerAlertas() {
    return alertas;
  }
}

module.exports = new DashboardService();