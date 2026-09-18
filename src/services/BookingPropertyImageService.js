class BookingPropertyImageService {
  // =========================================================
  // VALIDAR PROPIEDAD
  // =========================================================

  validarPropiedad(
    propiedad,
    vinculacionPropiedad
  ) {
    if (
      !propiedad ||
      !propiedad.idPropiedad
    ) {
      throw new Error(
        "La propiedad indicada no es válida."
      );
    }

    if (!vinculacionPropiedad) {
      throw new Error(
        "La propiedad no está vinculada con Booking."
      );
    }

    if (
      vinculacionPropiedad.canal !==
      "Booking"
    ) {
      throw new Error(
        "La vinculación indicada no pertenece a Booking."
      );
    }

    if (
      vinculacionPropiedad.estadoPublicacion !==
      "Publicada"
    ) {
      throw new Error(
        "La propiedad no se encuentra publicada en Booking."
      );
    }

    if (
      !vinculacionPropiedad.idExterno
    ) {
      throw new Error(
        "La publicación de Booking no posee un ID externo."
      );
    }
  }

  // =========================================================
  // VALIDAR IMAGEN
  // =========================================================

  validarImagen(
    imagen
  ) {
    if (
      !imagen ||
      !imagen.idPropiedadImagen
    ) {
      throw new Error(
        "La imagen indicada no es válida."
      );
    }

    if (
      !imagen.urlImagen ||
      !String(
        imagen.urlImagen
      ).trim()
    ) {
      throw new Error(
        "La imagen no posee una URL válida."
      );
    }

    if (
      imagen.estado !==
      "Activa"
    ) {
      throw new Error(
        "La imagen no se encuentra activa."
      );
    }
  }

  // =========================================================
  // SUBIR IMAGEN
  // =========================================================

  async subirImagen(
    propiedad,
    imagen,
    vinculacionPropiedad
  ) {
    this.validarPropiedad(
      propiedad,
      vinculacionPropiedad
    );

    this.validarImagen(
      imagen
    );

    /*
     * Simula la creación de una imagen
     * dentro de la publicación Booking.
     */

    const idExterno =
      `BKG-IMG-HF-${imagen.idPropiedadImagen}`;

    return {
      canal:
        "Booking",

      operacion:
        "SUBIR_IMAGEN",

      idPropiedad:
        propiedad.idPropiedad,

      idPropiedadExterno:
        vinculacionPropiedad.idExterno,

      idPropiedadImagen:
        imagen.idPropiedadImagen,

      idExterno,

      estado:
        "Sincronizada",

      fechaRespuesta:
        new Date().toISOString(),

      imagen: {
        urlImagen:
          imagen.urlImagen,

        descripcion:
          imagen.descripcion ||
          null,

        orden:
          imagen.orden,

        esPrincipal:
          imagen.esPrincipal ===
          true,
      },
    };
  }

  // =========================================================
  // ACTUALIZAR IMAGEN
  // =========================================================

  async actualizarImagen(
    propiedad,
    imagen,
    vinculacionPropiedad,
    vinculacionImagen
  ) {
    this.validarPropiedad(
      propiedad,
      vinculacionPropiedad
    );

    this.validarImagen(
      imagen
    );

    if (!vinculacionImagen) {
      throw new Error(
        "La imagen no está vinculada con Booking."
      );
    }

    if (
      vinculacionImagen.canal !==
      "Booking"
    ) {
      throw new Error(
        "La vinculación de imagen indicada no pertenece a Booking."
      );
    }

    if (
      !vinculacionImagen.idExterno
    ) {
      throw new Error(
        "La imagen de Booking no posee un ID externo."
      );
    }

    /*
     * La actualización conserva el mismo
     * identificador externo.
     */

    return {
      canal:
        "Booking",

      operacion:
        "ACTUALIZAR_IMAGEN",

      idPropiedad:
        propiedad.idPropiedad,

      idPropiedadExterno:
        vinculacionPropiedad.idExterno,

      idPropiedadImagen:
        imagen.idPropiedadImagen,

      idExterno:
        vinculacionImagen.idExterno,

      estado:
        "Sincronizada",

      fechaRespuesta:
        new Date().toISOString(),

      imagen: {
        urlImagen:
          imagen.urlImagen,

        descripcion:
          imagen.descripcion ||
          null,

        orden:
          imagen.orden,

        esPrincipal:
          imagen.esPrincipal ===
          true,
      },
    };
  }

  // =========================================================
  // ELIMINAR IMAGEN
  // =========================================================

  async eliminarImagen(
    propiedad,
    imagen,
    vinculacionPropiedad,
    vinculacionImagen
  ) {
    this.validarPropiedad(
      propiedad,
      vinculacionPropiedad
    );

    if (
      !imagen ||
      !imagen.idPropiedadImagen
    ) {
      throw new Error(
        "La imagen indicada no es válida."
      );
    }

    if (!vinculacionImagen) {
      throw new Error(
        "La imagen no está vinculada con Booking."
      );
    }

    if (
      vinculacionImagen.canal !==
      "Booking"
    ) {
      throw new Error(
        "La vinculación de imagen indicada no pertenece a Booking."
      );
    }

    if (
      !vinculacionImagen.idExterno
    ) {
      throw new Error(
        "La imagen de Booking no posee un ID externo."
      );
    }

    /*
     * Para eliminar no exigimos que la imagen
     * continúe activa en HostFlow.
     *
     * Puede encontrarse como:
     *
     * PendienteEliminacion
     */

    return {
      canal:
        "Booking",

      operacion:
        "ELIMINAR_IMAGEN",

      idPropiedad:
        propiedad.idPropiedad,

      idPropiedadExterno:
        vinculacionPropiedad.idExterno,

      idPropiedadImagen:
        imagen.idPropiedadImagen,

      idExterno:
        vinculacionImagen.idExterno,

      estado:
        "Eliminada",

      fechaRespuesta:
        new Date().toISOString(),
    };
  }
}

module.exports =
  new BookingPropertyImageService();