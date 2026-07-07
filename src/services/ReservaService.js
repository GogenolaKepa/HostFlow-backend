const { reservas, propiedades, huespedes } = require("../data/mockData");

class ReservaService {
  obtenerReservas() {
    return reservas.map((reserva) => ({
      idReserva: reserva.idReserva,
      propiedad: reserva.propiedad.nombre,
      idPropiedad: reserva.propiedad.idPropiedad,
      huesped: `${reserva.huesped.nombre} ${reserva.huesped.apellido}`,
      idHuesped: reserva.huesped.idHuesped,
      canal: reserva.canal,
      estado: reserva.estado,
      fechaIngreso: reserva.fechaIngreso,
      fechaEgreso: reserva.fechaEgreso,
      montoEstimado: reserva.montoEstimado,
    }));
  }

  obtenerReservaPorId(idReserva) {
    const reserva = reservas.find((r) => r.idReserva === Number(idReserva));

    if (!reserva) {
      throw new Error("La reserva no existe.");
    }

    return reserva;
  }

  crearReserva(datos) {
    const {
      idPropiedad,
      idHuesped,
      canal,
      fechaIngreso,
      fechaEgreso,
      cantidadHuespedes,
      montoEstimado,
    } = datos;

    if (!idPropiedad || !idHuesped || !fechaIngreso || !fechaEgreso) {
      throw new Error("Faltan datos obligatorios para registrar la reserva.");
    }

    if (new Date(fechaEgreso) <= new Date(fechaIngreso)) {
      throw new Error("La fecha de egreso debe ser posterior a la fecha de ingreso.");
    }

    const propiedad = propiedades.find(
      (p) => p.idPropiedad === Number(idPropiedad)
    );

    if (!propiedad) {
      throw new Error("La propiedad seleccionada no existe.");
    }

    if (propiedad.estado !== "Activa") {
      throw new Error("La propiedad no se encuentra disponible para recibir reservas.");
    }

    const huesped = huespedes.find(
      (h) => h.idHuesped === Number(idHuesped)
    );

    if (!huesped) {
      throw new Error("El huésped seleccionado no existe.");
    }

    if (cantidadHuespedes && cantidadHuespedes > propiedad.capacidadMaxima) {
      throw new Error("La cantidad de huéspedes supera la capacidad máxima de la propiedad.");
    }

    const existeConflicto = this.validarConflictoFechas(
      Number(idPropiedad),
      fechaIngreso,
      fechaEgreso
    );

    if (existeConflicto) {
      throw new Error("La propiedad ya posee una reserva en ese rango de fechas.");
    }

    const nuevaReserva = {
      idReserva: reservas.length + 1,
      propiedad,
      huesped,
      canal: canal || "Manual",
      estado: "Confirmada",
      fechaIngreso,
      fechaEgreso,
      cantidadHuespedes: cantidadHuespedes || 1,
      montoEstimado: montoEstimado || propiedad.precioBase,
    };

    reservas.push(nuevaReserva);

    return nuevaReserva;
  }

  modificarReserva(idReserva, datos) {
    const reserva = this.obtenerReservaPorId(idReserva);

    const nuevaFechaIngreso = datos.fechaIngreso || reserva.fechaIngreso;
    const nuevaFechaEgreso = datos.fechaEgreso || reserva.fechaEgreso;

    if (new Date(nuevaFechaEgreso) <= new Date(nuevaFechaIngreso)) {
      throw new Error("La fecha de egreso debe ser posterior a la fecha de ingreso.");
    }

    const existeConflicto = this.validarConflictoFechas(
      reserva.propiedad.idPropiedad,
      nuevaFechaIngreso,
      nuevaFechaEgreso,
      reserva.idReserva
    );

    if (existeConflicto) {
      throw new Error("La modificación genera un conflicto de fechas.");
    }

    reserva.fechaIngreso = nuevaFechaIngreso;
    reserva.fechaEgreso = nuevaFechaEgreso;
    reserva.canal = datos.canal || reserva.canal;
    reserva.estado = datos.estado || reserva.estado;
    reserva.montoEstimado = datos.montoEstimado || reserva.montoEstimado;

    return reserva;
  }

  cancelarReserva(idReserva) {
    const reserva = this.obtenerReservaPorId(idReserva);

    reserva.estado = "Cancelada";

    return reserva;
  }

  validarConflictoFechas(idPropiedad, fechaIngreso, fechaEgreso, idReservaIgnorada = null) {
    const ingresoNuevo = new Date(fechaIngreso);
    const egresoNuevo = new Date(fechaEgreso);

    return reservas.some((reserva) => {
      if (idReservaIgnorada && reserva.idReserva === Number(idReservaIgnorada)) {
        return false;
      }

      if (reserva.propiedad.idPropiedad !== Number(idPropiedad)) {
        return false;
      }

      if (reserva.estado === "Cancelada") {
        return false;
      }

      const ingresoExistente = new Date(reserva.fechaIngreso);
      const egresoExistente = new Date(reserva.fechaEgreso);

      return ingresoNuevo < egresoExistente && egresoNuevo > ingresoExistente;
    });
  }
}

module.exports = new ReservaService();