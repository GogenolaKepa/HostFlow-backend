class BookingPropertyService {
  // =========================================================
  // VALIDAR PROPIEDAD
  // =========================================================

  validarPropiedad(propiedad) {
    if (!propiedad) {
      throw new Error(
        "La propiedad no existe."
      );
    }

    if (!propiedad.nombre) {
      throw new Error(
        "La propiedad debe tener un nombre para publicarse en Booking."
      );
    }

    if (!propiedad.direccion) {
      throw new Error(
        "La propiedad debe tener una dirección para publicarse en Booking."
      );
    }

    if (!propiedad.ciudad) {
      throw new Error(
        "La propiedad debe tener una ciudad para publicarse en Booking."
      );
    }

    if (!propiedad.provincia) {
      throw new Error(
        "La propiedad debe tener una provincia para publicarse en Booking."
      );
    }

    if (
      !propiedad.capacidadMaxima ||
      Number(propiedad.capacidadMaxima) <= 0
    ) {
      throw new Error(
        "La propiedad debe tener una capacidad válida para publicarse en Booking."
      );
    }

    if (
      !propiedad.precioBase ||
      Number(propiedad.precioBase) <= 0
    ) {
      throw new Error(
        "La propiedad debe tener un precio base válido para publicarse en Booking."
      );
    }
  }

  // =========================================================
  // SOLICITAR PUBLICACIÓN
  // =========================================================

  solicitarPublicacion(propiedad) {
    this.validarPropiedad(propiedad);

    /*
     * Simula el envío de la propiedad hacia Booking.
     *
     * La operación se considera pendiente hasta que
     * recibamos la confirmación simulada del proveedor.
     *
     * Todavía NO modificamos el estado local
     * a "Publicada".
     */

    return {
      canal: "Booking",

      idPropiedad:
        propiedad.idPropiedad,

      estado:
        "Pendiente",

      fechaSolicitud:
        new Date().toISOString(),

      datosEnviados: {
        nombre:
          propiedad.nombre,

        tipo:
          propiedad.tipo,

        direccion:
          propiedad.direccion,

        ciudad:
          propiedad.ciudad,

        provincia:
          propiedad.provincia,

        capacidadMaxima:
          propiedad.capacidadMaxima,

        precioBase:
          propiedad.precioBase,
      },
    };
  }

  // =========================================================
  // SIMULAR CONFIRMACIÓN
  // =========================================================

  confirmarPublicacion(propiedad) {
    this.validarPropiedad(propiedad);

    /*
     * En una integración real, el identificador
     * sería generado/devuelto por Booking.
     *
     * Para la simulación utilizamos un ID estable.
     */

    const idExterno =
      `BKG-HF-${propiedad.idPropiedad}`;

    return {
      canal: "Booking",

      idPropiedad:
        propiedad.idPropiedad,

      idExterno,

      estado:
        "Publicada",

      fechaRespuesta:
        new Date().toISOString(),
    };
  }
  // =========================================================
// ACTUALIZAR PUBLICACIÓN
// =========================================================

actualizarPublicacion(
  propiedad,
  vinculacion
) {
  this.validarPropiedad(
    propiedad
  );

  if (!vinculacion) {
    throw new Error(
      "La propiedad no está vinculada con Booking."
    );
  }

  if (
    vinculacion.canal !==
    "Booking"
  ) {
    throw new Error(
      "La vinculación indicada no pertenece a Booking."
    );
  }

  if (
    vinculacion.estadoPublicacion !==
    "Publicada"
  ) {
    throw new Error(
      "La propiedad no se encuentra publicada en Booking."
    );
  }

  if (!vinculacion.idExterno) {
    throw new Error(
      "La publicación de Booking no posee un ID externo."
    );
  }

  /*
   * Simula la actualización de los datos
   * de una propiedad ya publicada en Booking.
   *
   * La publicación conserva el mismo ID externo.
   */

  return {
    canal: "Booking",

    idPropiedad:
      propiedad.idPropiedad,

    idExterno:
      vinculacion.idExterno,

    estado:
      "Sincronizada",

    fechaRespuesta:
      new Date().toISOString(),

    datosSincronizados: {
      nombre:
        propiedad.nombre,

      tipo:
        propiedad.tipo,

      direccion:
        propiedad.direccion,

      ciudad:
        propiedad.ciudad,

      provincia:
        propiedad.provincia,

      capacidadMaxima:
        propiedad.capacidadMaxima,

      precioBase:
        propiedad.precioBase,

      estado:
        propiedad.estado,
    },
  };
}
}

module.exports =
  new BookingPropertyService();