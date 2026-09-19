const BookingPropertyImageInboundService = require(
  "./BookingPropertyImageInboundService"
);

const PropiedadImagenRepository = require(
  "../repositories/PropiedadImagenRepository"
);

const PropiedadImagenCanalService = require(
  "./PropiedadImagenCanalService"
);

class BookingPropertyImageInboundProcessorService {
  // =========================================================
  // PROCESAR EVENTO
  // =========================================================

  async procesarEvento(
    idEvento
  ) {
    const evento =
      BookingPropertyImageInboundService
        .obtenerEventoPorId(
          idEvento
        );

    /*
     * Idempotencia:
     *
     * Si el mismo evento ya fue procesado,
     * no repetimos operaciones sobre Azure SQL
     * ni reenviamos cambios hacia Airbnb.
     */
    if (
      evento.estado ===
      "Procesado"
    ) {
      const existente =
        await PropiedadImagenCanalService
          .obtenerImagenPorIdExterno(
            "Booking",
            evento.idExternoImagen
          );

      return {
        evento,
        imagen:
          existente?.imagen ||
          null,
        reprocesado:
          true,
        sincronizaciones:
          [],
      };
    }

    switch (
      evento.tipo
    ) {
      case "IMAGEN_CREADA":
        return this
          .procesarImagenCreada(
            evento
          );

      case "IMAGEN_ACTUALIZADA":
        return this
          .procesarImagenActualizada(
            evento
          );

      case "IMAGEN_ELIMINADA":
        return this
          .procesarImagenEliminada(
            evento
          );

      case "IMAGEN_PRINCIPAL":
        return this
          .procesarImagenPrincipal(
            evento
          );

      default:
        throw new Error(
          "El tipo de evento de imagen recibido desde Booking no es válido."
        );
    }
  }

  // =========================================================
  // VALIDAR URL
  // =========================================================

  validarUrlImagen(
    urlImagen
  ) {
    if (!urlImagen) {
      throw new Error(
        "Booking no proporcionó la URL de la imagen."
      );
    }

    let url;

    try {
      url =
        new URL(
          urlImagen
        );
    } catch {
      throw new Error(
        "La URL de imagen recibida desde Booking no es válida."
      );
    }

    if (
      url.protocol !==
        "http:" &&
      url.protocol !==
        "https:"
    ) {
      throw new Error(
        "La URL de imagen recibida desde Booking debe utilizar HTTP o HTTPS."
      );
    }

    return urlImagen;
  }

  // =========================================================
  // NORMALIZAR ORDEN
  // =========================================================

  normalizarOrden(
    orden,
    valorActual = 0
  ) {
    if (
      orden === undefined ||
      orden === null ||
      orden === ""
    ) {
      return Number(
        valorActual
      ) || 0;
    }

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
        "El orden de imagen recibido desde Booking no es válido."
      );
    }

    return nuevoOrden;
  }

  // =========================================================
  // RESOLVER PROPIEDAD
  // =========================================================

  async resolverPropiedad(
    evento
  ) {
    const contexto =
      await PropiedadImagenCanalService
        .obtenerPropiedadPorIdExterno(
          "Booking",
          evento.idExternoPropiedad
        );

    return contexto;
  }

  // =========================================================
  // OBTENER IMAGEN EXTERNA
  // =========================================================

  async obtenerImagenExterna(
    evento,
    permitirAusente = false
  ) {
    const encontrada =
      await PropiedadImagenCanalService
        .obtenerImagenPorIdExterno(
          "Booking",
          evento.idExternoImagen
        );

    if (
      !encontrada &&
      !permitirAusente
    ) {
      throw new Error(
        "No existe en HostFlow una imagen vinculada con el identificador recibido desde Booking."
      );
    }

    return encontrada;
  }

  // =========================================================
  // VALIDAR PERTENENCIA
  // =========================================================

  validarPertenencia(
    propiedad,
    imagen
  ) {
    if (
      Number(
        imagen.idPropiedad
      ) !==
      Number(
        propiedad.idPropiedad
      )
    ) {
      throw new Error(
        "La imagen recibida desde Booking no pertenece a la propiedad externa indicada."
      );
    }
  }

  // =========================================================
  // OBTENER PRINCIPAL ACTUAL
  // =========================================================

  async obtenerPrincipalActual(
    idPropiedad,
    idImagenIgnorada = null
  ) {
    const imagenes =
      await PropiedadImagenRepository
        .obtenerPorPropiedad(
          idPropiedad
        );

    return (
      imagenes.find(
        (imagen) =>
          imagen.esPrincipal &&
          Number(
            imagen
              .idPropiedadImagen
          ) !==
            Number(
              idImagenIgnorada
            )
      ) ||
      null
    );
  }

  // =========================================================
  // SINCRONIZAR CAMBIO DE PRINCIPAL
  // =========================================================

  async sincronizarCambioPrincipal(
    idPropiedad,
    imagenNuevaPrincipal,
    imagenPrincipalAnterior
  ) {
    const resultados = [];

    const sincronizacionNueva =
      await PropiedadImagenCanalService
        .sincronizarActualizacionImagen(
          idPropiedad,
          imagenNuevaPrincipal
            .idPropiedadImagen,
          "Booking"
        );

    resultados.push(
      ...sincronizacionNueva
    );

    if (
      imagenPrincipalAnterior &&
      Number(
        imagenPrincipalAnterior
          .idPropiedadImagen
      ) !==
        Number(
          imagenNuevaPrincipal
            .idPropiedadImagen
        )
    ) {
      const sincronizacionAnterior =
        await PropiedadImagenCanalService
          .sincronizarActualizacionImagen(
            idPropiedad,
            imagenPrincipalAnterior
              .idPropiedadImagen,
            "Booking"
          );

      resultados.push(
        ...sincronizacionAnterior
      );
    }

    return resultados;
  }

  // =========================================================
  // IMAGEN CREADA
  // =========================================================

  async procesarImagenCreada(
    evento
  ) {
    const {
      propiedad,
    } =
      await this.resolverPropiedad(
        evento
      );

    /*
     * Si el ID externo ya está vinculado,
     * consideramos el evento duplicado.
     *
     * No creamos una segunda fila local.
     */
    const existente =
      await this.obtenerImagenExterna(
        evento,
        true
      );

    if (existente) {
      this.validarPertenencia(
        propiedad,
        existente.imagen
      );

      const eventoProcesado =
        BookingPropertyImageInboundService
          .marcarEventoProcesado(
            evento.idEvento
          );

      return {
        evento:
          eventoProcesado,
        imagen:
          existente.imagen,
        duplicada:
          true,
        reprocesado:
          false,
        sincronizaciones:
          [],
      };
    }

    const datos =
      evento.datos ||
      {};

    const urlImagen =
      this.validarUrlImagen(
        datos.urlImagen
      );

    const orden =
      this.normalizarOrden(
        datos.orden,
        0
      );

    const principalAnterior =
      datos.esPrincipal === true
        ? await this
            .obtenerPrincipalActual(
              propiedad.idPropiedad
            )
        : null;

    /*
     * Creamos inicialmente como no principal.
     *
     * Si Booking indicó que debe ser principal,
     * usamos establecerPrincipal() después.
     *
     * Esto evita violar el índice único de
     * imagen principal por propiedad.
     */
    let imagen =
      await PropiedadImagenRepository
        .crear({
          idPropiedad:
            propiedad.idPropiedad,

          urlImagen,

          descripcion:
            datos.descripcion ||
            null,

          orden,

          esPrincipal:
            false,

          origen:
            "Booking",
        });

    /*
     * Guardamos inmediatamente el vínculo
     * Booking ↔ imagen HostFlow.
     *
     * De esta manera una repetición del mismo
     * recurso externo no crea otra imagen.
     */
    await PropiedadImagenCanalService
      .registrarVinculacionOrigen(
        imagen.idPropiedadImagen,
        "Booking",
        evento.idExternoImagen
      );

    let sincronizaciones =
      [];

    if (
      datos.esPrincipal ===
      true
    ) {
      imagen =
        await PropiedadImagenRepository
          .establecerPrincipal(
            propiedad.idPropiedad,
            imagen.idPropiedadImagen
          );

      /*
       * Primero enviamos la nueva imagen a Airbnb.
       *
       * sincronizarNuevaImagen() ya excluye Booking.
       */
      const sincronizacionNueva =
        await PropiedadImagenCanalService
          .sincronizarNuevaImagen(
            propiedad.idPropiedad,
            imagen.idPropiedadImagen,
            "Booking"
          );

      sincronizaciones.push(
        ...sincronizacionNueva
      );

      /*
       * Si antes había otra principal,
       * Airbnb también debe enterarse de que
       * dejó de serlo.
       */
      if (
        principalAnterior &&
        Number(
          principalAnterior
            .idPropiedadImagen
        ) !==
          Number(
            imagen
              .idPropiedadImagen
          )
      ) {
        const sincronizacionAnterior =
          await PropiedadImagenCanalService
            .sincronizarActualizacionImagen(
              propiedad.idPropiedad,
              principalAnterior
                .idPropiedadImagen,
              "Booking"
            );

        sincronizaciones.push(
          ...sincronizacionAnterior
        );
      }
    } else {
      sincronizaciones =
        await PropiedadImagenCanalService
          .sincronizarNuevaImagen(
            propiedad.idPropiedad,
            imagen.idPropiedadImagen,
            "Booking"
          );
    }

    const eventoProcesado =
      BookingPropertyImageInboundService
        .marcarEventoProcesado(
          evento.idEvento
        );

    return {
      evento:
        eventoProcesado,

      imagen:
        await PropiedadImagenRepository
          .obtenerPorId(
            imagen.idPropiedadImagen
          ),

      duplicada:
        false,

      reprocesado:
        false,

      sincronizaciones,
    };
  }

  // =========================================================
  // IMAGEN ACTUALIZADA
  // =========================================================

  async procesarImagenActualizada(
    evento
  ) {
    const {
      propiedad,
    } =
      await this.resolverPropiedad(
        evento
      );

    const encontrada =
      await this.obtenerImagenExterna(
        evento
      );

    this.validarPertenencia(
      propiedad,
      encontrada.imagen
    );

    const imagenActual =
      encontrada.imagen;

    if (
      imagenActual.estado !==
      "Activa"
    ) {
      throw new Error(
        "La imagen vinculada con Booking no se encuentra activa en HostFlow."
      );
    }

    const datos =
      evento.datos ||
      {};

    const urlImagen =
      datos.urlImagen !==
        undefined &&
      datos.urlImagen !==
        null &&
      datos.urlImagen !==
        ""
        ? this.validarUrlImagen(
            datos.urlImagen
          )
        : imagenActual
            .urlImagen;

    const descripcion =
      datos.descripcion ===
      undefined
        ? imagenActual
            .descripcion
        : datos.descripcion ||
          null;

    const orden =
      this.normalizarOrden(
        datos.orden,
        imagenActual.orden
      );

    let principalAnterior =
      null;

    if (
      datos.esPrincipal ===
        true &&
      !imagenActual.esPrincipal
    ) {
      principalAnterior =
        await this
          .obtenerPrincipalActual(
            propiedad.idPropiedad,
            imagenActual
              .idPropiedadImagen
          );
    }

    let imagen =
      await PropiedadImagenRepository
        .actualizar(
          imagenActual
            .idPropiedadImagen,
          {
            urlImagen,
            descripcion,
            orden,
          }
        );

    if (
      datos.esPrincipal ===
        true &&
      !imagenActual.esPrincipal
    ) {
      imagen =
        await PropiedadImagenRepository
          .establecerPrincipal(
            propiedad.idPropiedad,
            imagenActual
              .idPropiedadImagen
          );
    }

    let sincronizaciones =
      await PropiedadImagenCanalService
        .sincronizarActualizacionImagen(
          propiedad.idPropiedad,
          imagenActual
            .idPropiedadImagen,
          "Booking"
        );

    if (
      principalAnterior &&
      Number(
        principalAnterior
          .idPropiedadImagen
      ) !==
        Number(
          imagenActual
            .idPropiedadImagen
        )
    ) {
      const sincronizacionAnterior =
        await PropiedadImagenCanalService
          .sincronizarActualizacionImagen(
            propiedad.idPropiedad,
            principalAnterior
              .idPropiedadImagen,
            "Booking"
          );

      sincronizaciones.push(
        ...sincronizacionAnterior
      );
    }

    const eventoProcesado =
      BookingPropertyImageInboundService
        .marcarEventoProcesado(
          evento.idEvento
        );

    return {
      evento:
        eventoProcesado,

      imagen:
        await PropiedadImagenRepository
          .obtenerPorId(
            imagen.idPropiedadImagen
          ),

      reprocesado:
        false,

      sincronizaciones,
    };
  }

  // =========================================================
  // IMAGEN PRINCIPAL
  // =========================================================

  async procesarImagenPrincipal(
    evento
  ) {
    const {
      propiedad,
    } =
      await this.resolverPropiedad(
        evento
      );

    const encontrada =
      await this.obtenerImagenExterna(
        evento
      );

    this.validarPertenencia(
      propiedad,
      encontrada.imagen
    );

    if (
      encontrada.imagen
        .estado !==
      "Activa"
    ) {
      throw new Error(
        "No se puede establecer como principal una imagen que no está activa."
      );
    }

    const imagen =
      encontrada.imagen;

    if (
      imagen.esPrincipal
    ) {
      const eventoProcesado =
        BookingPropertyImageInboundService
          .marcarEventoProcesado(
            evento.idEvento
          );

      return {
        evento:
          eventoProcesado,
        imagen,
        reprocesado:
          false,
        sinCambios:
          true,
        sincronizaciones:
          [],
      };
    }

    const principalAnterior =
      await this
        .obtenerPrincipalActual(
          propiedad.idPropiedad,
          imagen.idPropiedadImagen
        );

    const imagenPrincipal =
      await PropiedadImagenRepository
        .establecerPrincipal(
          propiedad.idPropiedad,
          imagen.idPropiedadImagen
        );

    const sincronizaciones =
      await this
        .sincronizarCambioPrincipal(
          propiedad.idPropiedad,
          imagenPrincipal,
          principalAnterior
        );

    const eventoProcesado =
      BookingPropertyImageInboundService
        .marcarEventoProcesado(
          evento.idEvento
        );

    return {
      evento:
        eventoProcesado,

      imagen:
        await PropiedadImagenRepository
          .obtenerPorId(
            imagen.idPropiedadImagen
          ),

      reprocesado:
        false,

      sinCambios:
        false,

      sincronizaciones,
    };
  }

  // =========================================================
  // IMAGEN ELIMINADA
  // =========================================================

  async procesarImagenEliminada(
    evento
  ) {
    const {
      propiedad,
    } =
      await this.resolverPropiedad(
        evento
      );

    /*
     * En una eliminación repetida puede ocurrir
     * que el vínculo Booking ya haya sido borrado
     * por el primer procesamiento.
     *
     * Si el evento todavía está Pendiente y no
     * encontramos la imagen, consideramos que
     * localmente ya no existe nada que aplicar.
     */
    const encontrada =
      await this.obtenerImagenExterna(
        evento,
        true
      );

    if (!encontrada) {
      const eventoProcesado =
        BookingPropertyImageInboundService
          .marcarEventoProcesado(
            evento.idEvento
          );

      return {
        evento:
          eventoProcesado,

        imagen:
          null,

        recursoYaAusente:
          true,

        reprocesado:
          false,

        sincronizaciones:
          [],
      };
    }

    this.validarPertenencia(
      propiedad,
      encontrada.imagen
    );

    const imagen =
      encontrada.imagen;

    /*
     * Si ya estaba eliminada localmente,
     * limpiamos cualquier vínculo residual
     * del canal de origen y cerramos el evento.
     */
    if (
      imagen.estado ===
      "Eliminada"
    ) {
      await PropiedadImagenCanalService
        .eliminarVinculacionOrigen(
          imagen.idPropiedadImagen,
          "Booking"
        );

      const eventoProcesado =
        BookingPropertyImageInboundService
          .marcarEventoProcesado(
            evento.idEvento
          );

      return {
        evento:
          eventoProcesado,

        imagen:
          await PropiedadImagenRepository
            .obtenerPorId(
              imagen.idPropiedadImagen
            ),

        recursoYaAusente:
          true,

        reprocesado:
          false,

        sincronizaciones:
          [],
      };
    }

    const eraPrincipal =
      imagen.esPrincipal ===
      true;

    await PropiedadImagenRepository
      .marcarPendienteEliminacion(
        imagen.idPropiedadImagen
      );

    let nuevaPrincipal =
      null;

    let sincronizacionesPrincipal =
      [];

    /*
     * Si Booking eliminó la portada,
     * HostFlow elige como reemplazo la primera
     * imagen activa restante.
     *
     * Esto mantiene una portada válida local y
     * sincroniza el cambio hacia Airbnb.
     */
    if (eraPrincipal) {
      const imagenesRestantes =
        await PropiedadImagenRepository
          .obtenerPorPropiedad(
            propiedad.idPropiedad
          );

      if (
        imagenesRestantes.length >
        0
      ) {
        nuevaPrincipal =
          await PropiedadImagenRepository
            .establecerPrincipal(
              propiedad.idPropiedad,
              imagenesRestantes[0]
                .idPropiedadImagen
            );

        sincronizacionesPrincipal =
          await PropiedadImagenCanalService
            .sincronizarActualizacionImagen(
              propiedad.idPropiedad,
              nuevaPrincipal
                .idPropiedadImagen,
              "Booking"
            );
      }
    }

    /*
     * El helper:
     *
     * - elimina el vínculo Booking local,
     *   porque el recurso ya fue borrado allí;
     * - elimina la imagen en Airbnb;
     * - marca la imagen local como Eliminada
     *   cuando no quedan vínculos pendientes.
     */
    const resultadoEliminacion =
      await PropiedadImagenCanalService
        .sincronizarEliminacionImagen(
          propiedad.idPropiedad,
          imagen.idPropiedadImagen,
          "Booking"
        );

    const eventoProcesado =
      BookingPropertyImageInboundService
        .marcarEventoProcesado(
          evento.idEvento
        );

    return {
      evento:
        eventoProcesado,

      imagen:
        resultadoEliminacion
          .imagen,

      nuevaPrincipal,

      reprocesado:
        false,

      sincronizaciones: [
        ...sincronizacionesPrincipal,
        ...resultadoEliminacion
          .sincronizaciones,
      ],

      eliminacionCompleta:
        resultadoEliminacion
          .eliminacionCompleta,
    };
  }
}

module.exports =
  new BookingPropertyImageInboundProcessorService();
