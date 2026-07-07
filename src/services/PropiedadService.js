const { propiedades } = require("../data/mockData");

class PropiedadService {
  obtenerPropiedades() {
    return propiedades.map((propiedad) => ({
      idPropiedad: propiedad.idPropiedad,
      nombre: propiedad.nombre,
      tipo: propiedad.tipo,
      direccion: propiedad.direccion,
      capacidadMaxima: propiedad.capacidadMaxima,
      precioBase: propiedad.precioBase,
      estado: propiedad.estado,
    }));
  }

  obtenerPropiedadPorId(idPropiedad) {
    const propiedad = propiedades.find(
      (p) => p.idPropiedad === Number(idPropiedad)
    );

    if (!propiedad) {
      throw new Error("La propiedad no existe.");
    }

    return propiedad;
  }

  crearPropiedad(datos) {
    const {
      nombre,
      tipo,
      direccion,
      capacidadMaxima,
      precioBase,
      estado,
    } = datos;

    if (!nombre || !tipo || !direccion || !capacidadMaxima || !precioBase) {
      throw new Error("Faltan datos obligatorios para registrar la propiedad.");
    }

    if (Number(capacidadMaxima) <= 0) {
      throw new Error("La capacidad máxima debe ser mayor a cero.");
    }

    if (Number(precioBase) <= 0) {
      throw new Error("El precio base debe ser mayor a cero.");
    }

    const nuevoId =
      propiedades.length > 0
        ? Math.max(...propiedades.map((p) => p.idPropiedad)) + 1
        : 1;

    const nuevaPropiedad = {
      idPropiedad: nuevoId,
      nombre,
      tipo,
      direccion,
      capacidadMaxima: Number(capacidadMaxima),
      precioBase: Number(precioBase),
      estado: estado || "Activa",
    };

    propiedades.push(nuevaPropiedad);

    return nuevaPropiedad;
  }

  modificarPropiedad(idPropiedad, datos) {
    const propiedad = this.obtenerPropiedadPorId(idPropiedad);

    propiedad.nombre = datos.nombre || propiedad.nombre;
    propiedad.tipo = datos.tipo || propiedad.tipo;
    propiedad.direccion = datos.direccion || propiedad.direccion;
    propiedad.capacidadMaxima = datos.capacidadMaxima
      ? Number(datos.capacidadMaxima)
      : propiedad.capacidadMaxima;
    propiedad.precioBase = datos.precioBase
      ? Number(datos.precioBase)
      : propiedad.precioBase;
    propiedad.estado = datos.estado || propiedad.estado;

    return propiedad;
  }

  cambiarEstadoPropiedad(idPropiedad, estado) {
    const propiedad = this.obtenerPropiedadPorId(idPropiedad);

    const estadosPermitidos = ["Activa", "Mantenimiento", "Inactiva"];

    if (!estadosPermitidos.includes(estado)) {
      throw new Error("El estado indicado no es válido.");
    }

    propiedad.estado = estado;

    return propiedad;
  }
}

module.exports = new PropiedadService();