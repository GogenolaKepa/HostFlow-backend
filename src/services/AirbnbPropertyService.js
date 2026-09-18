class AirbnbPropertyService {
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
        "La propiedad debe tener un nombre para publicarse en Airbnb."
      );
    }

    if (!propiedad.direccion) {
      throw new Error(
        "La propiedad debe tener una dirección para publicarse en Airbnb."
      );
    }

    if (!propiedad.ciudad) {
      throw new Error(
        "La propiedad debe tener una ciudad para publicarse en Airbnb."
      );
    }

    if (
      !propiedad.capacidadMaxima ||
      Number(propiedad.capacidadMaxima) <= 0
    ) {
      throw new Error(
        "La propiedad debe tener una capacidad válida para publicarse en Airbnb."
      );
    }

    if (
      !propiedad.precioBase ||
      Number(propiedad.precioBase) <= 0
    ) {
      throw new Error(
        "La propiedad debe tener un precio base válido para publicarse en Airbnb."
      );
    }
  }

  // =========================================================
  // SOLICITAR PUBLICACIÓN
  // =========================================================

  solicitarPublicacion(propiedad) {
    this.validarPropiedad(propiedad);

    /*
     * Simula el envío de los datos de la propiedad
     * hacia Airbnb.
     *
     * Todavía NO consideramos la propiedad publicada.
     * El proveedor debe confirmar posteriormente.
     */

    return {
      canal: "Airbnb",

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
     * En una integración real, este ID vendría
     * desde Airbnb.
     *
     * Por ahora utilizamos un identificador externo
     * simulado y estable para la demostración.
     */

    const idExterno =
      `AIR-HF-${propiedad.idPropiedad}`;

    return {
      canal: "Airbnb",

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
      "La propiedad no está vinculada con Airbnb."
    );
  }

  if (
    vinculacion.canal !==
    "Airbnb"
  ) {
    throw new Error(
      "La vinculación indicada no pertenece a Airbnb."
    );
  }

  if (
    vinculacion.estadoPublicacion !==
    "Publicada"
  ) {
    throw new Error(
      "La propiedad no se encuentra publicada en Airbnb."
    );
  }

  if (!vinculacion.idExterno) {
    throw new Error(
      "La publicación de Airbnb no posee un ID externo."
    );
  }

  /*
   * Simula el envío de los nuevos datos
   * de la propiedad a una publicación
   * ya existente en Airbnb.
   *
   * El ID externo NO cambia.
   */

  return {
    canal: "Airbnb",

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
  new AirbnbPropertyService();