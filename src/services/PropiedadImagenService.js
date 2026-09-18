const PropiedadRepository = require(
  "../repositories/PropiedadRepository"
);

const PropiedadImagenRepository = require(
  "../repositories/PropiedadImagenRepository"
);

const PropiedadImagenCanalService = require(
  "./PropiedadImagenCanalService"
);

class PropiedadImagenService {
  // =========================================================
  // VALIDAR PROPIEDAD
  // =========================================================

  async validarPropiedad(
    idPropiedad
  ) {
    const propiedad =
      await PropiedadRepository
        .obtenerPorId(
          idPropiedad
        );

    if (!propiedad) {
      throw new Error(
        "La propiedad no existe."
      );
    }

    return propiedad;
  }

  // =========================================================
  // VALIDAR URL
  // =========================================================

  validarUrlImagen(
    urlImagen
  ) {
    if (
      !urlImagen ||
      !String(urlImagen).trim()
    ) {
      throw new Error(
        "La URL de la imagen es obligatoria."
      );
    }

    const url =
      String(
        urlImagen
      ).trim();

    try {
      const urlParseada =
        new URL(url);

      if (
        urlParseada.protocol !==
          "http:" &&
        urlParseada.protocol !==
          "https:"
      ) {
        throw new Error();
      }
    } catch (error) {
      throw new Error(
        "La URL de la imagen no es válida."
      );
    }

    return url;
  }

  // =========================================================
  // VALIDAR ORIGEN
  // =========================================================

  validarOrigen(
    origen
  ) {
    const origenFinal =
      origen || "Manual";

    const origenesValidos = [
      "Manual",
      "Airbnb",
      "Booking",
    ];

    if (
      !origenesValidos.includes(
        origenFinal
      )
    ) {
      throw new Error(
        "El origen de la imagen no es válido."
      );
    }

    return origenFinal;
  }

  // =========================================================
  // OBTENER IMAGEN POR ID
  // =========================================================

  async obtenerImagenPorId(
    idPropiedad,
    idPropiedadImagen
  ) {
    await this.validarPropiedad(
      idPropiedad
    );

    const imagen =
      await PropiedadImagenRepository
        .obtenerPorId(
          idPropiedadImagen
        );

    if (!imagen) {
      throw new Error(
        "La imagen no existe."
      );
    }

    if (
      Number(
        imagen.idPropiedad
      ) !==
      Number(
        idPropiedad
      )
    ) {
      throw new Error(
        "La imagen no pertenece a la propiedad indicada."
      );
    }

    return imagen;
  }

  // =========================================================
  // OBTENER IMAGEN ACTIVA
  // =========================================================

  async obtenerImagenActiva(
    idPropiedad,
    idPropiedadImagen
  ) {
    const imagen =
      await this.obtenerImagenPorId(
        idPropiedad,
        idPropiedadImagen
      );

    if (
      imagen.estado !==
      "Activa"
    ) {
      throw new Error(
        "La imagen no se encuentra activa."
      );
    }

    return imagen;
  }

  // =========================================================
  // OBTENER GALERÍA ACTIVA
  // =========================================================

  async obtenerImagenes(
    idPropiedad
  ) {
    await this.validarPropiedad(
      idPropiedad
    );

    return PropiedadImagenRepository
      .obtenerPorPropiedad(
        idPropiedad
      );
  }

  // =========================================================
  // OBTENER TODAS LAS IMÁGENES
  // =========================================================

  async obtenerTodasLasImagenes(
    idPropiedad
  ) {
    await this.validarPropiedad(
      idPropiedad
    );

    return PropiedadImagenRepository
      .obtenerTodasPorPropiedad(
        idPropiedad
      );
  }

  // =========================================================
  // AGREGAR IMAGEN
  // =========================================================

  async agregarImagen(
    idPropiedad,
    datos
  ) {
    await this.validarPropiedad(
      idPropiedad
    );

    const urlImagen =
      this.validarUrlImagen(
        datos.urlImagen
      );

    const origen =
      this.validarOrigen(
        datos.origen
      );

    const imagenesActuales =
      await PropiedadImagenRepository
        .obtenerPorPropiedad(
          idPropiedad
        );

    const principalAnterior =
      imagenesActuales.find(
        (imagen) =>
          imagen.esPrincipal ===
          true
      ) || null;

    const esPrimeraImagen =
      imagenesActuales.length ===
      0;

    const quierePrincipal =
      datos.esPrincipal ===
      true;

    // =====================================================
    // ORDEN
    // =====================================================

    let orden;

    if (
      datos.orden !==
        undefined &&
      datos.orden !== null &&
      datos.orden !== ""
    ) {
      orden =
        Number(
          datos.orden
        );

      if (
        !Number.isInteger(
          orden
        ) ||
        orden < 0
      ) {
        throw new Error(
          "El orden de la imagen debe ser un número entero mayor o igual a cero."
        );
      }
    } else {
      const ordenMaximo =
        imagenesActuales.reduce(
          (
            maximo,
            imagen
          ) =>
            Math.max(
              maximo,
              Number(
                imagen.orden
              ) || 0
            ),
          -1
        );

      orden =
        ordenMaximo + 1;
    }

    // =====================================================
    // CREAR EN HOSTFLOW
    // =====================================================

    let imagenFinal =
      await PropiedadImagenRepository
        .crear({
          idPropiedad:
            Number(
              idPropiedad
            ),

          urlImagen,

          descripcion:
            datos.descripcion !==
              undefined &&
            datos.descripcion !==
              null
              ? String(
                  datos.descripcion
                ).trim() ||
                null
              : null,

          orden,

          /*
           * La primera foto siempre queda
           * automáticamente como principal.
           */
          esPrincipal:
            esPrimeraImagen,

          origen,
        });

    // =====================================================
    // NUEVA FOTO PRINCIPAL
    // =====================================================

    if (
      quierePrincipal &&
      !esPrimeraImagen
    ) {
      imagenFinal =
        await PropiedadImagenRepository
          .establecerPrincipal(
            idPropiedad,
            imagenFinal
              .idPropiedadImagen
          );
    }

    // =====================================================
    // SINCRONIZAR FOTO NUEVA
    // =====================================================

    const sincronizaciones =
      await PropiedadImagenCanalService
        .sincronizarNuevaImagen(
          idPropiedad,
          imagenFinal
            .idPropiedadImagen
        );

    // =====================================================
    // SINCRONIZAR PRINCIPAL ANTERIOR
    // =====================================================
    //
    // Si agregamos una nueva foto y la convertimos
    // en principal, la anterior pasó de:
    //
    // principal = true
    //
    // a:
    //
    // principal = false
    //
    // También tenemos que informar ese cambio.
    // =====================================================

    let sincronizacionesPrincipalAnterior =
      [];

    if (
      quierePrincipal &&
      principalAnterior
    ) {
      sincronizacionesPrincipalAnterior =
        await PropiedadImagenCanalService
          .sincronizarActualizacionImagen(
            idPropiedad,
            principalAnterior
              .idPropiedadImagen
          );
    }

    return {
      imagen:
        imagenFinal,

      sincronizaciones,

      sincronizacionesPrincipalAnterior,
    };
  }

  // =========================================================
  // MODIFICAR IMAGEN
  // =========================================================

  async modificarImagen(
    idPropiedad,
    idPropiedadImagen,
    datos
  ) {
    const imagenActual =
      await this.obtenerImagenActiva(
        idPropiedad,
        idPropiedadImagen
      );

    const imagenesActuales =
      await PropiedadImagenRepository
        .obtenerPorPropiedad(
          idPropiedad
        );

    const principalAnterior =
      imagenesActuales.find(
        (imagen) =>
          imagen.esPrincipal ===
          true
      ) || null;

    const urlImagen =
      datos.urlImagen !==
      undefined
        ? this.validarUrlImagen(
            datos.urlImagen
          )
        : imagenActual.urlImagen;

    // =====================================================
    // ORDEN
    // =====================================================

    let orden =
      Number(
        imagenActual.orden
      );

    if (
      datos.orden !==
      undefined
    ) {
      orden =
        Number(
          datos.orden
        );

      if (
        !Number.isInteger(
          orden
        ) ||
        orden < 0
      ) {
        throw new Error(
          "El orden de la imagen debe ser un número entero mayor o igual a cero."
        );
      }
    }

    // =====================================================
    // DESCRIPCIÓN
    // =====================================================

    const descripcion =
      datos.descripcion !==
      undefined
        ? String(
            datos.descripcion ||
              ""
          ).trim() ||
          null
        : imagenActual.descripcion;

    let imagenFinal =
      await PropiedadImagenRepository
        .actualizar(
          idPropiedadImagen,
          {
            urlImagen,
            descripcion,
            orden,
          }
        );

    // =====================================================
    // CAMBIAR PRINCIPAL
    // =====================================================

    const cambiaPrincipal =
      datos.esPrincipal ===
        true &&
      imagenActual.esPrincipal !==
        true;

    if (cambiaPrincipal) {
      imagenFinal =
        await PropiedadImagenRepository
          .establecerPrincipal(
            idPropiedad,
            idPropiedadImagen
          );
    }

    // =====================================================
    // SINCRONIZAR IMAGEN MODIFICADA
    // =====================================================

    const sincronizaciones =
      await PropiedadImagenCanalService
        .sincronizarActualizacionImagen(
          idPropiedad,
          idPropiedadImagen
        );

    // =====================================================
    // SINCRONIZAR PRINCIPAL ANTERIOR
    // =====================================================

    let sincronizacionesPrincipalAnterior =
      [];

    if (
      cambiaPrincipal &&
      principalAnterior &&
      Number(
        principalAnterior
          .idPropiedadImagen
      ) !==
        Number(
          idPropiedadImagen
        )
    ) {
      sincronizacionesPrincipalAnterior =
        await PropiedadImagenCanalService
          .sincronizarActualizacionImagen(
            idPropiedad,
            principalAnterior
              .idPropiedadImagen
          );
    }

    return {
      imagen:
        imagenFinal,

      sincronizaciones,

      sincronizacionesPrincipalAnterior,
    };
  }

  // =========================================================
  // ESTABLECER PRINCIPAL
  // =========================================================

  async establecerPrincipal(
    idPropiedad,
    idPropiedadImagen
  ) {
    const imagen =
      await this.obtenerImagenActiva(
        idPropiedad,
        idPropiedadImagen
      );

    if (
      imagen.esPrincipal ===
      true
    ) {
      return {
        imagen,
        sincronizaciones: [],
        sincronizacionesPrincipalAnterior:
          [],
      };
    }

    const imagenes =
      await PropiedadImagenRepository
        .obtenerPorPropiedad(
          idPropiedad
        );

    const principalAnterior =
      imagenes.find(
        (item) =>
          item.esPrincipal ===
          true
      ) || null;

    const imagenPrincipal =
      await PropiedadImagenRepository
        .establecerPrincipal(
          idPropiedad,
          idPropiedadImagen
        );

    // =====================================================
    // SINCRONIZAR NUEVA PRINCIPAL
    // =====================================================

    const sincronizaciones =
      await PropiedadImagenCanalService
        .sincronizarActualizacionImagen(
          idPropiedad,
          idPropiedadImagen
        );

    // =====================================================
    // SINCRONIZAR ANTERIOR
    // =====================================================

    let sincronizacionesPrincipalAnterior =
      [];

    if (
      principalAnterior &&
      Number(
        principalAnterior
          .idPropiedadImagen
      ) !==
        Number(
          idPropiedadImagen
        )
    ) {
      sincronizacionesPrincipalAnterior =
        await PropiedadImagenCanalService
          .sincronizarActualizacionImagen(
            idPropiedad,
            principalAnterior
              .idPropiedadImagen
          );
    }

    return {
      imagen:
        imagenPrincipal,

      sincronizaciones,

      sincronizacionesPrincipalAnterior,
    };
  }

  // =========================================================
  // CAMBIAR ORDEN
  // =========================================================

  async cambiarOrden(
    idPropiedad,
    idPropiedadImagen,
    orden
  ) {
    await this.obtenerImagenActiva(
      idPropiedad,
      idPropiedadImagen
    );

    const nuevoOrden =
      Number(
        orden
      );

    if (
      !Number.isInteger(
        nuevoOrden
      ) ||
      nuevoOrden < 0
    ) {
      throw new Error(
        "El orden de la imagen debe ser un número entero mayor o igual a cero."
      );
    }

    const imagen =
      await PropiedadImagenRepository
        .cambiarOrden(
          idPropiedadImagen,
          nuevoOrden
        );

    const sincronizaciones =
      await PropiedadImagenCanalService
        .sincronizarActualizacionImagen(
          idPropiedad,
          idPropiedadImagen
        );

    return {
      imagen,
      sincronizaciones,
    };
  }

  // =========================================================
  // ELIMINAR IMAGEN
  // =========================================================

  async eliminarImagen(
    idPropiedad,
    idPropiedadImagen
  ) {
    const imagen =
      await this.obtenerImagenActiva(
        idPropiedad,
        idPropiedadImagen
      );

    const eraPrincipal =
      imagen.esPrincipal ===
      true;

    // =====================================================
    // MARCAR PENDIENTE
    // =====================================================

    await PropiedadImagenRepository
      .marcarPendienteEliminacion(
        idPropiedadImagen
      );

    // =====================================================
    // REASIGNAR PRINCIPAL
    // =====================================================

    let nuevaPrincipal =
      null;

    let sincronizacionesNuevaPrincipal =
      [];

    if (eraPrincipal) {
      const imagenesRestantes =
        await PropiedadImagenRepository
          .obtenerPorPropiedad(
            idPropiedad
          );

      if (
        imagenesRestantes.length >
        0
      ) {
        nuevaPrincipal =
          await PropiedadImagenRepository
            .establecerPrincipal(
              idPropiedad,
              imagenesRestantes[0]
                .idPropiedadImagen
            );

        /*
         * La nueva principal también debe
         * actualizarse en los canales.
         */
        sincronizacionesNuevaPrincipal =
          await PropiedadImagenCanalService
            .sincronizarActualizacionImagen(
              idPropiedad,
              nuevaPrincipal
                .idPropiedadImagen
            );
      }
    }

    // =====================================================
    // ELIMINAR EN CANALES
    // =====================================================

    const resultadoEliminacion =
      await PropiedadImagenCanalService
        .sincronizarEliminacionImagen(
          idPropiedad,
          idPropiedadImagen
        );

    return {
      ...resultadoEliminacion,

      nuevaPrincipal,

      sincronizacionesNuevaPrincipal,

      imagenes:
        await PropiedadImagenRepository
          .obtenerPorPropiedad(
            idPropiedad
          ),
    };
  }

  // =========================================================
  // RESTAURAR IMAGEN
  // =========================================================

  async restaurarImagen(
    idPropiedad,
    idPropiedadImagen
  ) {
    const imagen =
      await this.obtenerImagenPorId(
        idPropiedad,
        idPropiedadImagen
      );

    if (
      imagen.estado ===
      "Activa"
    ) {
      throw new Error(
        "La imagen ya se encuentra activa."
      );
    }

    let imagenRestaurada =
      await PropiedadImagenRepository
        .restaurar(
          idPropiedadImagen
        );

    // =====================================================
    // SI QUEDA SOLA, PASA A SER PRINCIPAL
    // =====================================================

    const imagenesActivas =
      await PropiedadImagenRepository
        .obtenerPorPropiedad(
          idPropiedad
        );

    if (
      imagenesActivas.length ===
      1
    ) {
      imagenRestaurada =
        await PropiedadImagenRepository
          .establecerPrincipal(
            idPropiedad,
            idPropiedadImagen
          );
    }

    // =====================================================
    // VOLVER A SINCRONIZAR
    // =====================================================
    //
    // Si el recurso externo ya no existe,
    // se volverá a subir.
    //
    // Si todavía existe un vínculo externo,
    // se actualizará.
    // =====================================================

    const sincronizaciones =
      await PropiedadImagenCanalService
        .sincronizarNuevaImagen(
          idPropiedad,
          idPropiedadImagen
        );

    return {
      imagen:
        imagenRestaurada,

      sincronizaciones,

      imagenes:
        await PropiedadImagenRepository
          .obtenerPorPropiedad(
            idPropiedad
          ),
    };
  }
}

module.exports =
  new PropiedadImagenService();