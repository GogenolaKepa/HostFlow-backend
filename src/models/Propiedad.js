class Propiedad {
  constructor(idPropiedad, nombre, direccion, ciudad, tipoInmueble, capacidadMaxima, estado, precioBase) {
    this.idPropiedad = idPropiedad;
    this.nombre = nombre;
    this.direccion = direccion;
    this.ciudad = ciudad;
    this.tipoInmueble = tipoInmueble;
    this.capacidadMaxima = capacidadMaxima;
    this.estado = estado;
    this.precioBase = precioBase;
  }
}

module.exports = Propiedad;