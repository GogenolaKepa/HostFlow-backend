class Reserva {
  constructor(idReserva, propiedad, huesped, canal, estado, fechaIngreso, fechaEgreso, montoEstimado) {
    this.idReserva = idReserva;
    this.propiedad = propiedad;
    this.huesped = huesped;
    this.canal = canal;
    this.estado = estado;
    this.fechaIngreso = fechaIngreso;
    this.fechaEgreso = fechaEgreso;
    this.montoEstimado = montoEstimado;
  }
}

module.exports = Reserva;