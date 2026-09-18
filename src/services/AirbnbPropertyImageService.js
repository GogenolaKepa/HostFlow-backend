class AirbnbPropertyImageService {
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
        "La propiedad no está vinculada con Airbnb."
      );
    }

    if (
      vinculacionPropiedad.canal !==
      "Airbnb"
    ) {
      throw new Error(
        "La vinculación indicada no pertenece a Airbnb."
      );
    }

    if (
      vinculacionPropiedad.estadoPublicacion !==
      "Publicada"
    ) {
      throw new Error(
        "La propiedad no se encuentra publicada en Airbnb."
      );
    }

    if (
      !vinculacionPropiedad.idExterno
    ) {
      throw new Error(
        "La publicación de Airbnb no posee un ID externo."
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
     * Simula la creación de la imagen
     * dentro de la publicación Airbnb.
     *
     * En una integración real, Airbnb
     * devolvería su propio identificador.
     */

    const idExterno =
      `AIR-IMG-HF-${imagen.idPropiedadImagen}`;

    return {
      canal:
        "Airbnb",

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
        "La imagen no está vinculada con Airbnb."
      );
    }

    if (
      vinculacionImagen.canal !==
      "Airbnb"
    ) {
      throw new Error(
        "La vinculación de imagen indicada no pertenece a Airbnb."
      );
    }

    if (
      !vinculacionImagen.idExterno
    ) {
      throw new Error(
        "La imagen de Airbnb no posee un ID externo."
      );
    }

    /*
     * La actualización conserva el mismo
     * identificador externo.
     */

    return {
      canal:
        "Airbnb",

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
        "La imagen no está vinculada con Airbnb."
      );
    }

    if (
      vinculacionImagen.canal !==
      "Airbnb"
    ) {
      throw new Error(
        "La vinculación de imagen indicada no pertenece a Airbnb."
      );
    }

    if (
      !vinculacionImagen.idExterno
    ) {
      throw new Error(
        "La imagen de Airbnb no posee un ID externo."
      );
    }

    /*
     * Para eliminar NO exigimos que la imagen
     * siga Activa.
     *
     * Es normal que en HostFlow ya esté como:
     *
     * PendienteEliminacion
     *
     * mientras esperamos la confirmación
     * del proveedor.
     */

    return {
      canal:
        "Airbnb",

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
  new AirbnbPropertyImageService();