const {fechaOperativa}=require('../utils/fechaOperativa');
const HuespedRepository =
  require("../repositories/HuespedRepository");
  const ReservaRepository =
  require("../repositories/ReservaRepository");
const {normalizarHuesped}=require('../security/validacionHuesped');

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

  const hoy = fechaOperativa();

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

        const ingreso = reserva.fechaIngreso;

        const egreso = reserva.fechaEgreso;

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

          const ingreso = reserva.fechaIngreso;

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
    datos=normalizarHuesped(datos,{alta:true});
    return HuespedRepository.conEscrituraAtomica(async contexto => {
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
      await contexto
        .obtenerPorEmail(
          email
        );

    if (emailExistente) {
      throw new Error(
        "Ya existe un huésped registrado con ese email."
      );
    }

    const nuevoHuesped =
      await contexto
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

    if (!Number.isInteger(nuevoHuesped?.idHuesped) || nuevoHuesped.idHuesped <= 0) throw new Error('No se pudo confirmar el huésped creado.');
    return this.formatearHuesped(
      nuevoHuesped
    );
    });
  }

  // =========================================================
  // MODIFICAR HUÉSPED
  // =========================================================

  async modificarHuesped(
    idHuesped,
    datos
  ) {
    const emailVaciado=Object.hasOwn(datos||{},'email')&&!String(datos.email||'').trim();
    datos=normalizarHuesped(datos);
    return HuespedRepository.conEscrituraAtomica(async contexto => {
    const huespedActual =
      await contexto
        .obtenerPorId(
          idHuesped
        );

    if (!huespedActual) {
      throw new Error(
        "El huésped no existe."
      );
    }

    if(emailVaciado&&huespedActual.email)throw new Error('El email registrado no puede quedar vacío.');

    // Si cambia el email, verificamos que
    // no pertenezca a otro huésped.
    if (
      datos.email &&
      datos.email !==
        huespedActual.email
    ) {
      const emailExistente =
        await contexto
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
      await contexto
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

    if (huespedActualizado?.idHuesped !== Number(idHuesped)) throw new Error('No se pudo confirmar el huésped actualizado.');
    return this.formatearHuesped(
      huespedActualizado
    );
    });
  }
}

module.exports =
  new HuespedService();
