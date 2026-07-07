class Alerta {
  constructor(idAlerta, tipo, mensaje, fecha, leida) {
    this.idAlerta = idAlerta;
    this.tipo = tipo;
    this.mensaje = mensaje;
    this.fecha = fecha;
    this.leida = leida;
  }
}

module.exports = Alerta;