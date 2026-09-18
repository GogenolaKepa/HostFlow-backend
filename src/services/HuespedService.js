const HuespedRepository =
  require("../repositories/HuespedRepository");
  const ReservaRepository =
  require("../repositories/ReservaRepository");

class HuespedService {
  // =========================================================
  // FORMATEAR HUÉSPED
  // =========================================================

  formatearHuesped(huesped) {
  return {
    idHuesped:
      huesped.idHuesped,

    nombre:
      huesped.nombre,

    apellido:
      huesped.apellido,

    email:
      huesped.email ||
      "No registrado",

    telefono:
      huesped.telefono ||
      "No registrado",

    dni:
      huesped.dni ||
      "No registrado",

    nacionalidad:
      huesped.nacionalidad ||
      "No registrada",

    origenRegistro:
      huesped.origenRegistro ||
      "Manual",
  };
}

  // =========================================================
  // OBTENER TODOS
  // =========================================================

  async obtenerHuespedes() {
  const huespedes =
    await HuespedRepository
      .obtenerTodos();

  return huespedes.map(
    (huesped) => {
      let situacion =
        "Sin reservas activas";

      if (
        Number(
          huesped.tieneReservaActiva
        ) === 1
      ) {
        situacion =
          "Hospedado actualmente";
      } else if (
        Number(
          huesped.tieneReservaFutura
        ) === 1
      ) {
        situacion =
          "Próxima reserva";
      }

      return {
        ...this.formatearHuesped(
          huesped
        ),

        cantidadReservas:
          Number(
            huesped.cantidadReservas
          ) || 0,

        tieneReservaActiva:
          Number(
            huesped.tieneReservaActiva
          ) === 1,

        tieneReservaFutura:
          Number(
            huesped.tieneReservaFutura
          ) === 1,

        situacion,
      };
    }
  );
}

  // =========================================================
  // OBTENER POR ID
  // =========================================================

  async obtenerHuespedPorId(
  idHuesped
) {
  // =========================================================
  // OBTENER HUÉSPED
  // =========================================================

  const huesped =
    await HuespedRepository
      .obtenerPorId(
        idHuesped
      );

  if (!huesped) {
    throw new Error(
      "El huésped no existe."
    );
  }

  // =========================================================
  // OBTENER RESERVAS DEL HUÉSPED
  // =========================================================

  const reservas =
    await ReservaRepository
      .obtenerPorHuesped(
        idHuesped
      );

  // =========================================================
  // FECHA ACTUAL
  // =========================================================

  const hoy =
    new Date();

  hoy.setHours(
    0,
    0,
    0,
    0
  );

  // =========================================================
  // RESERVAS ACTIVAS
  // =========================================================
  //
  // Puede existir más de una si algún canal externo
  // genera una superposición.
  // Por eso devolvemos un array.
  // =========================================================

  const reservasActivas =
    reservas.filter(
      (reserva) => {
        if (
          reserva.estado ===
            "Cancelada" ||
          reserva.estado ===
            "Finalizada" ||
          reserva.estado ===
            "No show"
        ) {
          return false;
        }

        const ingreso =
          new Date(
            `${reserva.fechaIngreso}T00:00:00`
          );

        const egreso =
          new Date(
            `${reserva.fechaEgreso}T00:00:00`
          );

        return (
          ingreso <= hoy &&
          hoy < egreso
        );
      }
    );

  // =========================================================
  // PRÓXIMA RESERVA
  // =========================================================

  const reservasFuturas =
    reservas
      .filter(
        (reserva) => {
          if (
            reserva.estado ===
              "Cancelada" ||
            reserva.estado ===
              "Finalizada" ||
            reserva.estado ===
              "No show"
          ) {
            return false;
          }

          const ingreso =
            new Date(
              `${reserva.fechaIngreso}T00:00:00`
            );

          return ingreso > hoy;
        }
      )
      .sort(
        (a, b) =>
          new Date(
            `${a.fechaIngreso}T00:00:00`
          ) -
          new Date(
            `${b.fechaIngreso}T00:00:00`
          )
      );

  const proximaReserva =
    reservasFuturas[0] ||
    null;

  // =========================================================
  // RESPUESTA
  // =========================================================

  return {
    ...this.formatearHuesped(
      huesped
    ),

    cantidadReservas:
      reservas.length,

    tieneReservaActiva:
      reservasActivas.length > 0,

    reservasActivas,

    proximaReserva,

    historialReservas:
      reservas,
  };
}

  // =========================================================
  // CREAR HUÉSPED
  // =========================================================

  async crearHuesped(
    datos
  ) {
    const {
      nombre,
      apellido,
      email,
      telefono,
      dni,
      nacionalidad,
    } = datos;

    if (
      !nombre ||
      !apellido ||
      !email
    ) {
      throw new Error(
        "Nombre, apellido y email son obligatorios."
      );
    }

    const emailExistente =
      await HuespedRepository
        .obtenerPorEmail(
          email
        );

    if (emailExistente) {
      throw new Error(
        "Ya existe un huésped registrado con ese email."
      );
    }

    const nuevoHuesped =
      await HuespedRepository
        .crear({
          nombre,
          apellido,
          email,
          telefono:
            telefono || null,
          dni:
            dni || null,
          nacionalidad:
            nacionalidad || null,
        });

    return this.formatearHuesped(
      nuevoHuesped
    );
  }

  // =========================================================
  // MODIFICAR HUÉSPED
  // =========================================================

  async modificarHuesped(
    idHuesped,
    datos
  ) {
    const huespedActual =
      await HuespedRepository
        .obtenerPorId(
          idHuesped
        );

    if (!huespedActual) {
      throw new Error(
        "El huésped no existe."
      );
    }

    // Si cambia el email, verificamos que
    // no pertenezca a otro huésped.
    if (
      datos.email &&
      datos.email !==
        huespedActual.email
    ) {
      const emailExistente =
        await HuespedRepository
          .obtenerPorEmail(
            datos.email
          );

      if (
        emailExistente &&
        Number(
          emailExistente.idHuesped
        ) !==
          Number(idHuesped)
      ) {
        throw new Error(
          "Ya existe un huésped registrado con ese email."
        );
      }
    }

    const huespedActualizado =
      await HuespedRepository
        .actualizar(
          idHuesped,
          {
            nombre:
              datos.nombre ||
              huespedActual.nombre,

            apellido:
              datos.apellido ||
              huespedActual.apellido,

            email:
              datos.email ||
              huespedActual.email,

            telefono:
              datos.telefono !==
              undefined
                ? datos.telefono
                : huespedActual.telefono,

            dni:
              datos.dni !==
              undefined
                ? datos.dni
                : huespedActual.dni,

            nacionalidad:
              datos.nacionalidad !==
              undefined
                ? datos.nacionalidad
                : huespedActual.nacionalidad,
          }
        );

    return this.formatearHuesped(
      huespedActualizado
    );
  }
}

module.exports =
  new HuespedService();