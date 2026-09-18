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

    const vinculacionesImagen =
      await PropiedadImagenCanalRepository
        .obtenerPorImagen(
          idPropiedadImagen
        );

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