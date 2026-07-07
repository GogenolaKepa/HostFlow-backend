class DashboardResumen {
  constructor(propiedadesActivas, reservasActivas, huespedesRegistrados, ingresosMes, ocupacionMensual, alertasPendientes) {
    this.propiedadesActivas = propiedadesActivas;
    this.reservasActivas = reservasActivas;
    this.huespedesRegistrados = huespedesRegistrados;
    this.ingresosMes = ingresosMes;
    this.ocupacionMensual = ocupacionMensual;
    this.alertasPendientes = alertasPendientes;
  }
}

module.exports = DashboardResumen;