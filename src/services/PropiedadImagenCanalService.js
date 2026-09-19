const PropiedadRepository = require(
  "../repositories/PropiedadRepository"
);

const PropiedadCanalRepository = require(
  "../repositories/PropiedadCanalRepository"
);

const PropiedadImagenRepository = require(
  "../repositories/PropiedadImagenRepository"
);

const PropiedadImagenCanalRepository = require(
  "../repositories/PropiedadImagenCanalRepository"
);

const AirbnbPropertyImageService = require(
  "./AirbnbPropertyImageService"
);

const BookingPropertyImageService = require(
  "./BookingPropertyImageService"
);

class PropiedadImagenCanalService {
  // =========================================================
  // OBTENER PROVEEDOR
  // =========================================================

  obtenerProveedor(canal) {
    switch (canal) {
      case "Airbnb":
        return AirbnbPropertyImageService;

      case "Booking":
        return BookingPropertyImageService;

      default:
        throw new Error(
          "El canal indicado no está soportado para imágenes."
        );
    }
  }

  // =========================================================
  // OBTENER PROPIEDAD E IMAGEN
  // =========================================================

  async obtenerContexto(
    idPropiedad,
    idPropiedadImagen
  ) {
    const propiedad =
      await PropiedadRepository.obtenerPorId(
        idPropiedad
      );

    if (!propiedad) {
      throw new Error(
        "La propiedad no existe."
      );
    }

    const imagen =
      await PropiedadImagenRepository.obtenerPorId(
        idPropiedadImagen
      );

    if (!imagen) {
      throw new Error(
        "La imagen no existe."
      );
    }

    if (
      Number(imagen.idPropiedad) !==
      Number(idPropiedad)
    ) {
      throw new Error(
        "La imagen no pertenece a la propiedad indicada."
      );
    }

    return {
      propiedad,
      imagen,
    };
  }

  // =========================================================
  // OBTENER CANALES PUBLICADOS
  // =========================================================

  async obtenerCanalesPublicados(
    idPropiedad,
    canalOrigen = null
  ) {
    const canales =
      await PropiedadCanalRepository
        .obtenerPorPropiedad(
          idPropiedad
        );

    return canales.filter(
      (vinculacion) =>
        vinculacion.idPropiedadCanal !==
          null &&
        vinculacion.estadoPublicacion ===
          "Publicada" &&
        vinculacion.canal !==
          canalOrigen
    );
  }


  // =========================================================
  // RESOLVER PROPIEDAD POR ID EXTERNO
  // =========================================================
  //
  // Se utiliza para eventos inbound provenientes de Airbnb
  // o Booking.
  //
  // Ejemplo:
  //
  // Airbnb -> AIR-HF-2
  // Booking -> BKG-HF-2
  //
  // =========================================================

  async obtenerPropiedadPorIdExterno(
    canal,
    idExternoPropiedad
  ) {
    this.obtenerProveedor(
      canal
    );

    if (!idExternoPropiedad) {
      throw new Error(
        "Debe indicar el identificador externo de la propiedad."
      );
    }

    const vinculacionPropiedad =
      await PropiedadCanalRepository
        .obtenerPorCanalEIdExterno(
          canal,
          idExternoPropiedad
        );

    if (!vinculacionPropiedad) {
      throw new Error(
        `No existe en HostFlow una propiedad vinculada con ${canal} y el identificador externo indicado.`
      );
    }

    const propiedad =
      await PropiedadRepository
        .obtenerPorId(
          vinculacionPropiedad
            .idPropiedad
        );

    if (!propiedad) {
      throw new Error(
        "La propiedad vinculada al canal externo no existe en HostFlow."
      );
    }

    return {
      propiedad,
      vinculacionPropiedad,
    };
  }

  // =========================================================
  // OBTENER IMAGEN LOCAL POR ID EXTERNO
  // =========================================================
  //
  // Permite encontrar la imagen de HostFlow a partir del
  // identificador que posee en Airbnb o Booking.
  //
  // =========================================================

  async obtenerImagenPorIdExterno(
    canal,
    idExternoImagen
  ) {
    this.obtenerProveedor(
      canal
    );

    if (!idExternoImagen) {
      throw new Error(
        "Debe indicar el identificador externo de la imagen."
      );
    }

    const vinculacionImagen =
      await PropiedadImagenCanalRepository
        .obtenerPorCanalEIdExterno(
          canal,
          idExternoImagen
        );

    if (!vinculacionImagen) {
      return null;
    }

    const imagen =
      await PropiedadImagenRepository
        .obtenerPorId(
          vinculacionImagen
            .idPropiedadImagen
        );

    if (!imagen) {
      throw new Error(
        "Existe una vinculación externa para una imagen que ya no existe en HostFlow."
      );
    }

    return {
      imagen,
      vinculacionImagen,
    };
  }

  // =========================================================
  // REGISTRAR VINCULACIÓN DEL CANAL DE ORIGEN
  // =========================================================
  //
  // Cuando una imagen nace en Airbnb o Booking, HostFlow
  // debe guardar cuál es su ID real en ese proveedor antes
  // de propagarla hacia el otro canal.
  //
  // Este método también es idempotente:
  //
  // - Si la vinculación no existe, la crea.
  // - Si existe sin ID externo, lo confirma.
  // - Si ya posee el mismo ID externo, solamente la deja
  //   sincronizada.
  // - Si intenta asociarse otro ID externo diferente a la
  //   misma imagen/canal, se rechaza.
  //
  // =========================================================

  async registrarVinculacionOrigen(
    idPropiedadImagen,
    canal,
    idExternoImagen
  ) {
    this.obtenerProveedor(
      canal
    );

    if (!idExternoImagen) {
      throw new Error(
        "Debe indicar el identificador externo de la imagen."
      );
    }

    const imagen =
      await PropiedadImagenRepository
        .obtenerPorId(
          idPropiedadImagen
        );

    if (!imagen) {
      throw new Error(
        "La imagen no existe en HostFlow."
      );
    }

    const vinculacionPorIdExterno =
      await PropiedadImagenCanalRepository
        .obtenerPorCanalEIdExterno(
          canal,
          idExternoImagen
        );

    if (
      vinculacionPorIdExterno &&
      Number(
        vinculacionPorIdExterno
          .idPropiedadImagen
      ) !==
        Number(
          idPropiedadImagen
        )
    ) {
      throw new Error(
        `El identificador externo de imagen ya está asociado a otra imagen de HostFlow en ${canal}.`
      );
    }

    let vinculacion =
      await PropiedadImagenCanalRepository
        .obtenerPorImagenYCanal(
          idPropiedadImagen,
          canal
        );

    if (!vinculacion) {
      await PropiedadImagenCanalRepository
        .iniciarSincronizacion(
          idPropiedadImagen,
          canal
        );

      return PropiedadImagenCanalRepository
        .confirmarSincronizacion(
          idPropiedadImagen,
          canal,
          idExternoImagen
        );
    }

    if (
      vinculacion.idExterno &&
      vinculacion.idExterno !==
        idExternoImagen
    ) {
      throw new Error(
        `La imagen ya posee otro identificador externo en ${canal}.`
      );
    }

    if (
      !vinculacion.idExterno
    ) {
      return PropiedadImagenCanalRepository
        .confirmarSincronizacion(
          idPropiedadImagen,
          canal,
          idExternoImagen
        );
    }

    return PropiedadImagenCanalRepository
      .marcarSincronizada(
        idPropiedadImagen,
        canal
      );
  }

  // =========================================================
  // ELIMINAR VINCULACIÓN DEL CANAL DE ORIGEN
  // =========================================================
  //
  // En una eliminación inbound, la imagen YA fue eliminada
  // en Airbnb/Booking. Por eso no debemos enviarle de vuelta
  // una eliminación al mismo proveedor.
  //
  // =========================================================

  async eliminarVinculacionOrigen(
    idPropiedadImagen,
    canal
  ) {
    this.obtenerProveedor(
      canal
    );

    const vinculacion =
      await PropiedadImagenCanalRepository
        .obtenerPorImagenYCanal(
          idPropiedadImagen,
          canal
        );

    if (!vinculacion) {
      return null;
    }

    return PropiedadImagenCanalRepository
      .eliminarVinculacion(
        idPropiedadImagen,
        canal
      );
  }

  // =========================================================
  // SINCRONIZAR NUEVA IMAGEN
  // =========================================================

  async sincronizarNuevaImagen(
    idPropiedad,
    idPropiedadImagen,
    canalOrigen = null
  ) {
    const {
      propiedad,
      imagen,
    } =
      await this.obtenerContexto(
        idPropiedad,
        idPropiedadImagen
      );

    if (
      imagen.estado !== "Activa"
    ) {
      throw new Error(
        "Solamente se pueden sincronizar imágenes activas."
      );
    }

    const canalesPublicados =
      await this.obtenerCanalesPublicados(
        idPropiedad,
        canalOrigen
      );

    const resultados = [];

    for (
      const vinculacionPropiedad
      of canalesPublicados
    ) {
      const canal =
        vinculacionPropiedad.canal;

      try {
        const proveedor =
          this.obtenerProveedor(
            canal
          );

        let vinculacionImagen =
          await PropiedadImagenCanalRepository
            .obtenerPorImagenYCanal(
              idPropiedadImagen,
              canal
            );

        /*
         * Si todavía no existe el vínculo,
         * lo creamos como Pendiente.
         */
        if (!vinculacionImagen) {
          vinculacionImagen =
            await PropiedadImagenCanalRepository
              .iniciarSincronizacion(
                idPropiedadImagen,
                canal
              );
        } else {
          vinculacionImagen =
            await PropiedadImagenCanalRepository
              .marcarPendiente(
                idPropiedadImagen,
                canal
              );
        }

        /*
         * Si ya existe un ID externo significa que
         * la imagen había sido enviada previamente.
         *
         * En ese caso actualizamos en lugar de
         * intentar crear otra imagen externa.
         */
        if (
          vinculacionImagen.idExterno
        ) {
          const respuestaProveedor =
            await proveedor
              .actualizarImagen(
                propiedad,
                imagen,
                vinculacionPropiedad,
                vinculacionImagen
              );

          const vinculacionFinal =
            await PropiedadImagenCanalRepository
              .marcarSincronizada(
                idPropiedadImagen,
                canal
              );

          resultados.push({
            canal,
            operacion:
              "ACTUALIZAR_IMAGEN",
            estado:
              "Sincronizada",
            respuestaProveedor,
            vinculacion:
              vinculacionFinal,
          });

          continue;
        }

        /*
         * Si todavía no posee ID externo,
         * simulamos una nueva subida.
         */
        const respuestaProveedor =
          await proveedor.subirImagen(
            propiedad,
            imagen,
            vinculacionPropiedad
          );

        const vinculacionFinal =
          await PropiedadImagenCanalRepository
            .confirmarSincronizacion(
              idPropiedadImagen,
              canal,
              respuestaProveedor.idExterno
            );

        resultados.push({
          canal,
          operacion:
            "SUBIR_IMAGEN",
          estado:
            "Sincronizada",
          respuestaProveedor,
          vinculacion:
            vinculacionFinal,
        });
      } catch (error) {
        let vinculacionError =
          null;

        try {
          vinculacionError =
            await PropiedadImagenCanalRepository
              .marcarError(
                idPropiedadImagen,
                canal,
                error.message
              );
        } catch (
          errorPersistencia
        ) {
          console.error(
            `No se pudo registrar el error de imagen en ${canal}:`,
            errorPersistencia
          );
        }

        resultados.push({
          canal,
          operacion:
            "SUBIR_IMAGEN",
          estado:
            "Error",
          mensajeError:
            error.message,
          vinculacion:
            vinculacionError,
        });
      }
    }

    return resultados;
  }

  // =========================================================
  // SINCRONIZAR ACTUALIZACIÓN DE IMAGEN
  // =========================================================
  //
  // Sirve para:
  //
  // - cambiar descripción
  // - cambiar URL
  // - cambiar orden
  // - establecer foto principal
  //
  // =========================================================

  async sincronizarActualizacionImagen(
    idPropiedad,
    idPropiedadImagen,
    canalOrigen = null
  ) {
    const {
      propiedad,
      imagen,
    } =
      await this.obtenerContexto(
        idPropiedad,
        idPropiedadImagen
      );

    if (
      imagen.estado !== "Activa"
    ) {
      throw new Error(
        "Solamente se pueden sincronizar imágenes activas."
      );
    }

    const canalesPublicados =
      await this.obtenerCanalesPublicados(
        idPropiedad,
        canalOrigen
      );

    const resultados = [];

    for (
      const vinculacionPropiedad
      of canalesPublicados
    ) {
      const canal =
        vinculacionPropiedad.canal;

      try {
        const proveedor =
          this.obtenerProveedor(
            canal
          );

        let vinculacionImagen =
          await PropiedadImagenCanalRepository
            .obtenerPorImagenYCanal(
              idPropiedadImagen,
              canal
            );

        /*
         * Puede ocurrir que la propiedad ya esté
         * publicada en el canal pero la imagen
         * todavía nunca haya sido enviada.
         *
         * En ese caso la actualización funciona
         * también como primera sincronización.
         */
        if (!vinculacionImagen) {
          vinculacionImagen =
            await PropiedadImagenCanalRepository
              .iniciarSincronizacion(
                idPropiedadImagen,
                canal
              );
        } else {
          vinculacionImagen =
            await PropiedadImagenCanalRepository
              .marcarPendiente(
                idPropiedadImagen,
                canal
              );
        }

        let respuestaProveedor;
        let vinculacionFinal;
        let operacion;

        if (
          vinculacionImagen.idExterno
        ) {
          // ===============================================
          // ACTUALIZAR IMAGEN EXISTENTE
          // ===============================================

          respuestaProveedor =
            await proveedor
              .actualizarImagen(
                propiedad,
                imagen,
                vinculacionPropiedad,
                vinculacionImagen
              );

          vinculacionFinal =
            await PropiedadImagenCanalRepository
              .marcarSincronizada(
                idPropiedadImagen,
                canal
              );

          operacion =
            "ACTUALIZAR_IMAGEN";
        } else {
          // ===============================================
          // PRIMERA SUBIDA
          // ===============================================

          respuestaProveedor =
            await proveedor
              .subirImagen(
                propiedad,
                imagen,
                vinculacionPropiedad
              );

          vinculacionFinal =
            await PropiedadImagenCanalRepository
              .confirmarSincronizacion(
                idPropiedadImagen,
                canal,
                respuestaProveedor
                  .idExterno
              );

          operacion =
            "SUBIR_IMAGEN";
        }

        resultados.push({
          canal,
          operacion,
          estado:
            "Sincronizada",
          respuestaProveedor,
          vinculacion:
            vinculacionFinal,
        });
      } catch (error) {
        let vinculacionError =
          null;

        try {
          vinculacionError =
            await PropiedadImagenCanalRepository
              .marcarError(
                idPropiedadImagen,
                canal,
                error.message
              );
        } catch (
          errorPersistencia
        ) {
          console.error(
            `No se pudo registrar el error de actualización de imagen en ${canal}:`,
            errorPersistencia
          );
        }

        resultados.push({
          canal,
          operacion:
            "ACTUALIZAR_IMAGEN",
          estado:
            "Error",
          mensajeError:
            error.message,
          vinculacion:
            vinculacionError,
        });
      }
    }

    return resultados;
  }

  // =========================================================
  // SINCRONIZAR ELIMINACIÓN DE IMAGEN
  // =========================================================

  async sincronizarEliminacionImagen(
    idPropiedad,
    idPropiedadImagen,
    canalOrigen = null
  ) {
    const {
      propiedad,
      imagen,
    } =
      await this.obtenerContexto(
        idPropiedad,
        idPropiedadImagen
      );

    if (
      imagen.estado !==
        "PendienteEliminacion" &&
      imagen.estado !==
        "Eliminada"
    ) {
      throw new Error(
        "La imagen no posee una eliminación pendiente."
      );
    }

    let vinculacionesImagen =
      await PropiedadImagenCanalRepository
        .obtenerPorImagen(
          idPropiedadImagen
        );

    /*
     * Si la eliminación nació en un canal externo,
     * el recurso ya no existe allí.
     *
     * Eliminamos primero esa vinculación local para:
     *
     * - no devolverle la operación al canal de origen;
     * - no conservar un ID externo que ya dejó de existir;
     * - permitir que una futura imagen reutilice ese ID
     *   sin chocar contra el índice único.
     */
    if (canalOrigen) {
      await this.eliminarVinculacionOrigen(
        idPropiedadImagen,
        canalOrigen
      );

      vinculacionesImagen =
        await PropiedadImagenCanalRepository
          .obtenerPorImagen(
            idPropiedadImagen
          );
    }

    /*
     * Si nunca fue enviada a ningún canal,
     * podemos completar directamente
     * la eliminación lógica.
     */
    if (
      vinculacionesImagen.length ===
      0
    ) {
      const imagenEliminada =
        await PropiedadImagenRepository
          .marcarEliminada(
            idPropiedadImagen
          );

      return {
        imagen:
          imagenEliminada,
        sincronizaciones: [],
        eliminacionCompleta:
          true,
      };
    }

    const resultados = [];

    for (
      const vinculacionImagen
      of vinculacionesImagen
    ) {
      const canal =
        vinculacionImagen.canal;

      /*
       * Si este canal fue el origen de una
       * eliminación inbound futura, no debemos
       * devolverle su propia operación.
       */
      if (
        canal === canalOrigen
      ) {
        continue;
      }

      try {
        /*
         * Si no tiene ID externo significa que
         * HostFlow nunca recibió confirmación
         * de que esa imagen exista realmente
         * en el proveedor.
         *
         * Por lo tanto no hay nada externo que
         * eliminar.
         */
        if (
          !vinculacionImagen.idExterno
        ) {
          await PropiedadImagenCanalRepository
            .eliminarVinculacion(
              idPropiedadImagen,
              canal
            );

          resultados.push({
            canal,
            operacion:
              "ELIMINAR_IMAGEN",
            estado:
              "Sincronizada",
            sinRecursoExterno:
              true,
          });

          continue;
        }

        const vinculacionPropiedad =
          await PropiedadCanalRepository
            .obtenerPorPropiedadYCanal(
              idPropiedad,
              canal
            );

        if (!vinculacionPropiedad) {
          throw new Error(
            `La propiedad no posee una vinculación con ${canal}.`
          );
        }

        const proveedor =
          this.obtenerProveedor(
            canal
          );

        const vinculacionPendiente =
          await PropiedadImagenCanalRepository
            .marcarPendienteEliminacion(
              idPropiedadImagen,
              canal
            );

        const respuestaProveedor =
          await proveedor
            .eliminarImagen(
              propiedad,
              imagen,
              vinculacionPropiedad,
              vinculacionPendiente
            );

        /*
         * El proveedor confirmó que la imagen
         * externa dejó de existir.
         *
         * Recién ahora podemos eliminar el vínculo
         * imagen ↔ canal.
         */
        await PropiedadImagenCanalRepository
          .eliminarVinculacion(
            idPropiedadImagen,
            canal
          );

        resultados.push({
          canal,
          operacion:
            "ELIMINAR_IMAGEN",
          estado:
            "Sincronizada",
          respuestaProveedor,
        });
      } catch (error) {
        let vinculacionError =
          null;

        try {
          vinculacionError =
            await PropiedadImagenCanalRepository
              .marcarError(
                idPropiedadImagen,
                canal,
                error.message
              );
        } catch (
          errorPersistencia
        ) {
          console.error(
            `No se pudo registrar el error al eliminar la imagen en ${canal}:`,
            errorPersistencia
          );
        }

        resultados.push({
          canal,
          operacion:
            "ELIMINAR_IMAGEN",
          estado:
            "Error",
          mensajeError:
            error.message,
          vinculacion:
            vinculacionError,
        });
      }
    }

    // =====================================================
    // COMPROBAR SI QUEDAN VÍNCULOS EXTERNOS
    // =====================================================

    const vinculacionesRestantes =
      await PropiedadImagenCanalRepository
        .obtenerPorImagen(
          idPropiedadImagen
        );

    const quedanPendientes =
      vinculacionesRestantes.some(
        (vinculacion) =>
          vinculacion.canal !==
          canalOrigen
      );

    /*
     * Solo marcamos la imagen como Eliminada
     * cuando ya no queda nada pendiente en
     * los demás canales.
     */
    let imagenFinal =
      await PropiedadImagenRepository
        .obtenerPorId(
          idPropiedadImagen
        );

    if (!quedanPendientes) {
      imagenFinal =
        await PropiedadImagenRepository
          .marcarEliminada(
            idPropiedadImagen
          );
    }

    return {
      imagen:
        imagenFinal,

      sincronizaciones:
        resultados,

      eliminacionCompleta:
        !quedanPendientes,
    };
  }
}

module.exports =
  new PropiedadImagenCanalService();