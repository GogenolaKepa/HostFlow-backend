const { huespedes } = require("../data/mockData");

class HuespedService {
  obtenerHuespedes() {
    return huespedes.map((huesped) => ({
      idHuesped: huesped.idHuesped,
      nombre: huesped.nombre,
      apellido: huesped.apellido,
      email: huesped.email || "No registrado",
      telefono: huesped.telefono || "No registrado",
      dni: huesped.dni || "No registrado",
    }));
  }

  obtenerHuespedPorId(idHuesped) {
    const huesped = huespedes.find(
      (h) => h.idHuesped === Number(idHuesped)
    );

    if (!huesped) {
      throw new Error("El huésped no existe.");
    }

    return huesped;
  }

  crearHuesped(datos) {
    const { nombre, apellido, email, telefono, dni } = datos;

    if (!nombre || !apellido || !email) {
      throw new Error("Nombre, apellido y email son obligatorios.");
    }

    const emailExistente = huespedes.find(
      (h) => h.email === email
    );

    if (emailExistente) {
      throw new Error("Ya existe un huésped registrado con ese email.");
    }

    const nuevoId =
      huespedes.length > 0
        ? Math.max(...huespedes.map((h) => h.idHuesped)) + 1
        : 1;

    const nuevoHuesped = {
      idHuesped: nuevoId,
      nombre,
      apellido,
      email,
      telefono: telefono || "No registrado",
      dni: dni || "No registrado",
    };

    huespedes.push(nuevoHuesped);

    return nuevoHuesped;
  }

  modificarHuesped(idHuesped, datos) {
    const huesped = this.obtenerHuespedPorId(idHuesped);

    huesped.nombre = datos.nombre || huesped.nombre;
    huesped.apellido = datos.apellido || huesped.apellido;
    huesped.email = datos.email || huesped.email;
    huesped.telefono = datos.telefono || huesped.telefono;
    huesped.dni = datos.dni || huesped.dni;

    return huesped;
  }
}

module.exports = new HuespedService();