const PropiedadRepository = require(
  "../repositories/PropiedadRepository"
);
const PropiedadCanalRepository = require(
  "../repositories/PropiedadCanalRepository"
);
const AirbnbPropertyService = require(
  "./AirbnbPropertyService"
);
const BookingPropertyService = require(
  "./BookingPropertyService"
);
const AirbnbPropertyInboundService = require(
  "./AirbnbPropertyInboundService"
);
const BookingPropertyInboundService = require(
  "./BookingPropertyInboundService"
);

class PropiedadCanalService {
  // =========================================================
  // OBTENER PROVEEDOR
  // =========================================================

  obtenerProveedor(canal) {
    switch (canal) {
      case "Airbnb":
        return AirbnbPropertyService;

      case "Booking":
        return BookingPropertyService;

      default:
        throw new Error(
          "El canal indicado no está soportado para publicación de propiedades."
        );
    }
  }

  // =========================================================
  // OBTENER CANALES DE UNA PROPIEDAD
  // =========================================================

  async obtenerCanales(
    idPropiedad
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

    return PropiedadCanalRepository
      .obtenerPorPropiedad(
        idPropiedad
      );
  }

  // =========================================================
  // PUBLICAR PROPIEDAD
  // =========================================================

  async publicarPropiedad(
    idPropiedad,
    canal
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

    const proveedor =
      this.obtenerProveedor(
        canal
      );

    const vinculacionExistente =
      await PropiedadCanalRepository
        .obtenerPorPropiedadYCanal(
          idPropiedad,
          canal
        );

    if (vinculacionExistente) {
      if (
        vinculacionExistente.estadoPublicacion ===
        "Publicada"
      ) {
        throw new Error(
          `La propiedad ya está publicada en ${canal}.`
        );
      }

      if (
        vinculacionExistente.estadoPublicacion ===
        "Pendiente"
      ) {
        throw new Error(
          `La propiedad ya tiene una publicación pendiente en ${canal}.`
        );
      }

      throw new Error(
        `La propiedad ya posee una vinculación con ${canal}.`
      );
    }

    const solicitud =
      await proveedor.solicitarPublicacion(
        propiedad
      );

    await PropiedadCanalRepository
      .iniciarPublicacion(
        idPropiedad,
        canal
      );

    try {
      const respuestaProveedor =
        await proveedor.confirmarPublicacion(
          propiedad
        );

      const vinculacion =
        await PropiedadCanalRepository
          .confirmarPublicacion(
            idPropiedad,
            canal,
            respuestaProveedor.idExterno
          );

      return {
        mensaje:
          `Propiedad publicada correctamente en ${canal}.`,

        solicitud,

        respuestaProveedor,

        vinculacion,
      };
    } catch (error) {
      await PropiedadCanalRepository
        .marcarError(
          idPropiedad,
          canal,
          error.message
        );

      throw error;
    }
  }

// =========================================================
// SINCRONIZAR CAMBIOS DE PROPIEDAD
// =========================================================

async sincronizarCambiosPropiedad(
  propiedad,
  canalOrigen = null
) {
  if (
    !propiedad ||
    !propiedad.idPropiedad
  ) {
    throw new Error(
      "No se puede sincronizar una propiedad inválida."
    );
  }

  const canales =
    await PropiedadCanalRepository
      .obtenerPorPropiedad(
        propiedad.idPropiedad
      );

  /*
   * Solamente sincronizamos canales donde
   * la propiedad ya se encuentre publicada.
   *
   * Si el cambio llegó desde un canal externo,
   * ese canal se excluye para evitar reenviarle
   * su propio cambio.
   *
   * Ejemplo:
   *
   * Airbnb → HostFlow → Booking
   *
   * y NO:
   *
   * Airbnb → HostFlow → Airbnb
   */

  const canalesPublicados =
    canales.filter(
      (canal) =>
        canal.idPropiedadCanal !== null &&
        canal.estadoPublicacion ===
          "Publicada" &&
        canal.canal !== canalOrigen
    );

  const resultados = [];

  for (
    const vinculacion
    of canalesPublicados
  ) {
    const canal =
      vinculacion.canal;

    try {
      const proveedor =
        this.obtenerProveedor(
          canal
        );

      // =====================================================
      // MARCAR PENDIENTE
      // =====================================================

      const vinculacionPendiente =
        await PropiedadCanalRepository
          .marcarPendiente(
            propiedad.idPropiedad,
            canal
          );

      // =====================================================
      // ENVIAR CAMBIO AL PROVEEDOR
      // =====================================================

      const respuestaProveedor =
        await proveedor
          .actualizarPublicacion(
            propiedad,
            vinculacionPendiente
          );

      // =====================================================
      // MARCAR SINCRONIZADA
      // =====================================================

      const vinculacionSincronizada =
        await PropiedadCanalRepository
          .marcarSincronizada(
            propiedad.idPropiedad,
            canal
          );

      resultados.push({
        canal,
        estado:
          "Sincronizada",

        respuestaProveedor,

        vinculacion:
          vinculacionSincronizada,
      });
    } catch (error) {
      /*
       * El cambio local ya existe en HostFlow.
       *
       * Si un canal falla, no revertimos Azure.
       * Dejamos únicamente ese canal marcado
       * con error.
       */

      let vinculacionError =
        null;

      try {
        vinculacionError =
          await PropiedadCanalRepository
            .marcarError(
              propiedad.idPropiedad,
              canal,
              error.message
            );
      } catch (
        errorPersistencia
      ) {
        console.error(
          `No se pudo registrar el error de sincronización de ${canal}:`,
          errorPersistencia
        );
      }

      resultados.push({
        canal,

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
// PROCESAR EVENTO INBOUND DE AIRBNB
// =========================================================

async procesarEventoPropiedadAirbnb(
  idEvento
) {
  // =======================================================
  // OBTENER EVENTO
  // =======================================================

  const evento =
    AirbnbPropertyInboundService
      .obtenerEventoPorId(
        idEvento
      );

  if (!evento) {
    throw new Error(
      "El evento de propiedad de Airbnb no existe."
    );
  }

  // =======================================================
  // EVENTO YA PROCESADO
  // =======================================================

  if (
    evento.estado ===
    "Procesado"
  ) {
    const vinculacion =
      await PropiedadCanalRepository
        .obtenerPorCanalEIdExterno(
          "Airbnb",
          evento.idExterno
        );

    const propiedad =
      vinculacion
        ? await PropiedadRepository
            .obtenerPorId(
              vinculacion.idPropiedad
            )
        : null;

    return {
      evento,
      propiedad,
      sincronizaciones: [],
      reprocesado: true,

      advertencia:
        "El evento de propiedad de Airbnb ya había sido procesado anteriormente.",
    };
  }

  // =======================================================
  // VALIDAR TIPO
  // =======================================================

  if (
    evento.tipo !==
    "PROPIEDAD_MODIFICADA"
  ) {
    throw new Error(
      "El tipo de evento de propiedad recibido desde Airbnb no es válido."
    );
  }

  // =======================================================
  // BUSCAR VINCULACIÓN POR ID EXTERNO
  // =======================================================

  const vinculacionAirbnb =
    await PropiedadCanalRepository
      .obtenerPorCanalEIdExterno(
        "Airbnb",
        evento.idExterno
      );

  if (!vinculacionAirbnb) {
    throw new Error(
      "No existe en HostFlow una propiedad vinculada a Airbnb con el identificador externo recibido."
    );
  }

  // =======================================================
  // OBTENER PROPIEDAD ACTUAL
  // =======================================================

  const propiedadActual =
    await PropiedadRepository
      .obtenerPorId(
        vinculacionAirbnb.idPropiedad
      );

  if (!propiedadActual) {
    throw new Error(
      "La propiedad vinculada al evento de Airbnb no existe en HostFlow."
    );
  }

  const datos =
    evento.datos;

  if (!datos) {
    throw new Error(
      "El evento de Airbnb no contiene datos para modificar la propiedad."
    );
  }

  // =======================================================
  // COMPROBAR QUE EXISTA ALGÚN CAMBIO
  // =======================================================

  const tieneCambios =
    datos.nombre !== undefined ||
    datos.tipo !== undefined ||
    datos.direccion !== undefined ||
    datos.ciudad !== undefined ||
    datos.provincia !== undefined ||
    datos.capacidadMaxima !== undefined ||
    datos.precioBase !== undefined ||
    datos.estado !== undefined;

  if (!tieneCambios) {
    throw new Error(
      "El evento de Airbnb no contiene cambios para aplicar."
    );
  }

  // =======================================================
  // FUSIONAR DATOS RECIBIDOS
  // =======================================================

  const estadoRecibido =
    datos.estado ===
    "En mantenimiento"
      ? "Mantenimiento"
      : datos.estado;

  const estadoFinal =
    estadoRecibido !== undefined
      ? estadoRecibido
      : propiedadActual.estado;

  const datosActualizados = {
    nombre:
      datos.nombre !== undefined
        ? String(datos.nombre).trim()
        : propiedadActual.nombre,

    tipo:
      datos.tipo !== undefined
        ? String(datos.tipo).trim()
        : propiedadActual.tipo,

    direccion:
      datos.direccion !== undefined
        ? String(
            datos.direccion
          ).trim()
        : propiedadActual.direccion,

    ciudad:
      datos.ciudad !== undefined
        ? String(datos.ciudad).trim()
        : propiedadActual.ciudad,

    provincia:
      datos.provincia !== undefined
        ? String(
            datos.provincia
          ).trim()
        : propiedadActual.provincia,

    capacidadMaxima:
      datos.capacidadMaxima !==
      undefined
        ? Number(
            datos.capacidadMaxima
          )
        : Number(
            propiedadActual.capacidadMaxima
          ),

    precioBase:
      datos.precioBase !== undefined
        ? Number(
            datos.precioBase
          )
        : Number(
            propiedadActual.precioBase
          ),

    estado:
      estadoFinal,
  };

  // =======================================================
  // VALIDACIONES
  // =======================================================

  if (
    !datosActualizados.nombre
  ) {
    throw new Error(
      "Airbnb envió un nombre de propiedad inválido."
    );
  }

  if (
    !datosActualizados.tipo
  ) {
    throw new Error(
      "Airbnb envió un tipo de propiedad inválido."
    );
  }

  if (
    !datosActualizados.direccion
  ) {
    throw new Error(
      "Airbnb envió una dirección inválida."
    );
  }

  if (
    !datosActualizados.ciudad
  ) {
    throw new Error(
      "Airbnb envió una ciudad inválida."
    );
  }

  if (
    !datosActualizados.provincia
  ) {
    throw new Error(
      "Airbnb envió una provincia inválida."
    );
  }

  if (
    !Number.isInteger(
      datosActualizados.capacidadMaxima
    ) ||
    datosActualizados.capacidadMaxima <=
      0
  ) {
    throw new Error(
      "Airbnb envió una capacidad máxima inválida."
    );
  }

  if (
    !Number.isFinite(
      datosActualizados.precioBase
    ) ||
    datosActualizados.precioBase <= 0
  ) {
    throw new Error(
      "Airbnb envió un precio base inválido."
    );
  }

  // =======================================================
  // VALIDAR ESTADO
  // =======================================================

  const estado =
    await PropiedadRepository
      .obtenerEstadoPorNombre(
        datosActualizados.estado
      );

  if (!estado) {
    throw new Error(
      "Airbnb envió un estado de propiedad no válido para HostFlow."
    );
  }

  // =======================================================
  // ACTUALIZAR HOSTFLOW
  // =======================================================
  //
  // IMPORTANTE:
  //
  // No usamos PropiedadService.modificarPropiedad()
  // porque ese método sincroniza automáticamente
  // con todos los canales.
  //
  // Este cambio nació en Airbnb, así que primero
  // modificamos Azure directamente mediante el
  // Repository.
  // =======================================================

  const propiedadActualizada =
    await PropiedadRepository
      .actualizar(
        propiedadActual.idPropiedad,
        datosActualizados,
        estado.idEstadoPropiedad
      );

  // =======================================================
  // MARCAR AIRBNB SINCRONIZADO
  // =======================================================
  //
  // El dato acaba de llegar desde Airbnb, por lo
  // tanto Airbnb ya posee esa versión.
  // =======================================================

  await PropiedadCanalRepository
    .marcarSincronizada(
      propiedadActual.idPropiedad,
      "Airbnb"
    );

  // =======================================================
  // PROPAGAR A LOS OTROS CANALES
  // =======================================================
  //
  // canalOrigen = Airbnb
  //
  // Por lo tanto:
  //
  // Airbnb → HostFlow → Booking
  //
  // Airbnb queda excluido para evitar loops.
  // =======================================================

  const sincronizaciones =
    await this
      .sincronizarCambiosPropiedad(
        propiedadActualizada,
        "Airbnb"
      );

  // =======================================================
  // MARCAR EVENTO PROCESADO
  // =======================================================
  //
  // Lo hacemos después de actualizar correctamente
  // la copia local de HostFlow.
  // =======================================================

  const eventoProcesado =
    AirbnbPropertyInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  // =======================================================
  // DEVOLVER ESTADO ACTUAL
  // =======================================================

  const propiedadFinal =
    await PropiedadRepository
      .obtenerPorId(
        propiedadActual.idPropiedad
      );

  const canalesFinales =
    await PropiedadCanalRepository
      .obtenerPorPropiedad(
        propiedadActual.idPropiedad
      );

  return {
    evento:
      eventoProcesado,

    propiedad: {
      ...propiedadFinal,
      canales:
        canalesFinales,
    },

    sincronizaciones,

    reprocesado: false,

    origen:
      "Airbnb",
  };
}
// =========================================================
// PROCESAR EVENTO INBOUND DE BOOKING
// =========================================================

async procesarEventoPropiedadBooking(
  idEvento
) {
  // =======================================================
  // OBTENER EVENTO
  // =======================================================

  const evento =
    BookingPropertyInboundService
      .obtenerEventoPorId(
        idEvento
      );

  if (!evento) {
    throw new Error(
      "El evento de propiedad de Booking no existe."
    );
  }

  // =======================================================
  // EVENTO YA PROCESADO
  // =======================================================

  if (
    evento.estado ===
    "Procesado"
  ) {
    const vinculacion =
      await PropiedadCanalRepository
        .obtenerPorCanalEIdExterno(
          "Booking",
          evento.idExterno
        );

    const propiedad =
      vinculacion
        ? await PropiedadRepository
            .obtenerPorId(
              vinculacion.idPropiedad
            )
        : null;

    return {
      evento,
      propiedad,
      sincronizaciones: [],
      reprocesado: true,

      advertencia:
        "El evento de propiedad de Booking ya había sido procesado anteriormente.",
    };
  }

  // =======================================================
  // VALIDAR TIPO
  // =======================================================

  if (
    evento.tipo !==
    "PROPIEDAD_MODIFICADA"
  ) {
    throw new Error(
      "El tipo de evento de propiedad recibido desde Booking no es válido."
    );
  }

  // =======================================================
  // BUSCAR VINCULACIÓN POR ID EXTERNO
  // =======================================================

  const vinculacionBooking =
    await PropiedadCanalRepository
      .obtenerPorCanalEIdExterno(
        "Booking",
        evento.idExterno
      );

  if (!vinculacionBooking) {
    throw new Error(
      "No existe en HostFlow una propiedad vinculada a Booking con el identificador externo recibido."
    );
  }

  // =======================================================
  // OBTENER PROPIEDAD ACTUAL
  // =======================================================

  const propiedadActual =
    await PropiedadRepository
      .obtenerPorId(
        vinculacionBooking.idPropiedad
      );

  if (!propiedadActual) {
    throw new Error(
      "La propiedad vinculada al evento de Booking no existe en HostFlow."
    );
  }

  const datos =
    evento.datos;

  if (!datos) {
    throw new Error(
      "El evento de Booking no contiene datos para modificar la propiedad."
    );
  }

  // =======================================================
  // COMPROBAR QUE EXISTA ALGÚN CAMBIO
  // =======================================================

  const tieneCambios =
    datos.nombre !== undefined ||
    datos.tipo !== undefined ||
    datos.direccion !== undefined ||
    datos.ciudad !== undefined ||
    datos.provincia !== undefined ||
    datos.capacidadMaxima !== undefined ||
    datos.precioBase !== undefined ||
    datos.estado !== undefined;

  if (!tieneCambios) {
    throw new Error(
      "El evento de Booking no contiene cambios para aplicar."
    );
  }

  // =======================================================
  // FUSIONAR DATOS
  // =======================================================

  const estadoRecibido =
    datos.estado ===
    "En mantenimiento"
      ? "Mantenimiento"
      : datos.estado;

  const estadoFinal =
    estadoRecibido !== undefined
      ? estadoRecibido
      : propiedadActual.estado;

  const datosActualizados = {
    nombre:
      datos.nombre !== undefined
        ? String(datos.nombre).trim()
        : propiedadActual.nombre,

    tipo:
      datos.tipo !== undefined
        ? String(datos.tipo).trim()
        : propiedadActual.tipo,

    direccion:
      datos.direccion !== undefined
        ? String(
            datos.direccion
          ).trim()
        : propiedadActual.direccion,

    ciudad:
      datos.ciudad !== undefined
        ? String(datos.ciudad).trim()
        : propiedadActual.ciudad,

    provincia:
      datos.provincia !== undefined
        ? String(
            datos.provincia
          ).trim()
        : propiedadActual.provincia,

    capacidadMaxima:
      datos.capacidadMaxima !==
      undefined
        ? Number(
            datos.capacidadMaxima
          )
        : Number(
            propiedadActual.capacidadMaxima
          ),

    precioBase:
      datos.precioBase !== undefined
        ? Number(
            datos.precioBase
          )
        : Number(
            propiedadActual.precioBase
          ),

    estado:
      estadoFinal,
  };

  // =======================================================
  // VALIDACIONES
  // =======================================================

  if (!datosActualizados.nombre) {
    throw new Error(
      "Booking envió un nombre de propiedad inválido."
    );
  }

  if (!datosActualizados.tipo) {
    throw new Error(
      "Booking envió un tipo de propiedad inválido."
    );
  }

  if (!datosActualizados.direccion) {
    throw new Error(
      "Booking envió una dirección inválida."
    );
  }

  if (!datosActualizados.ciudad) {
    throw new Error(
      "Booking envió una ciudad inválida."
    );
  }

  if (!datosActualizados.provincia) {
    throw new Error(
      "Booking envió una provincia inválida."
    );
  }

  if (
    !Number.isInteger(
      datosActualizados.capacidadMaxima
    ) ||
    datosActualizados.capacidadMaxima <= 0
  ) {
    throw new Error(
      "Booking envió una capacidad máxima inválida."
    );
  }

  if (
    !Number.isFinite(
      datosActualizados.precioBase
    ) ||
    datosActualizados.precioBase <= 0
  ) {
    throw new Error(
      "Booking envió un precio base inválido."
    );
  }

  // =======================================================
  // VALIDAR ESTADO
  // =======================================================

  const estado =
    await PropiedadRepository
      .obtenerEstadoPorNombre(
        datosActualizados.estado
      );

  if (!estado) {
    throw new Error(
      "Booking envió un estado de propiedad no válido para HostFlow."
    );
  }

  // =======================================================
  // ACTUALIZAR HOSTFLOW
  // =======================================================
  //
  // Igual que con Airbnb, no llamamos a
  // PropiedadService.modificarPropiedad()
  // porque el cambio nació externamente.
  // =======================================================

  const propiedadActualizada =
    await PropiedadRepository
      .actualizar(
        propiedadActual.idPropiedad,
        datosActualizados,
        estado.idEstadoPropiedad
      );

  // =======================================================
  // MARCAR BOOKING SINCRONIZADO
  // =======================================================

  await PropiedadCanalRepository
    .marcarSincronizada(
      propiedadActual.idPropiedad,
      "Booking"
    );

  // =======================================================
  // PROPAGAR A LOS OTROS CANALES
  // =======================================================
  //
  // Booking → HostFlow → Airbnb
  //
  // Booking queda excluido.
  // =======================================================

  const sincronizaciones =
    await this
      .sincronizarCambiosPropiedad(
        propiedadActualizada,
        "Booking"
      );

  // =======================================================
  // MARCAR EVENTO PROCESADO
  // =======================================================

  const eventoProcesado =
    BookingPropertyInboundService
      .marcarEventoProcesado(
        evento.idEvento
      );

  // =======================================================
  // DEVOLVER ESTADO ACTUAL
  // =======================================================

  const propiedadFinal =
    await PropiedadRepository
      .obtenerPorId(
        propiedadActual.idPropiedad
      );

  const canalesFinales =
    await PropiedadCanalRepository
      .obtenerPorPropiedad(
        propiedadActual.idPropiedad
      );

  return {
    evento:
      eventoProcesado,

    propiedad: {
      ...propiedadFinal,
      canales:
        canalesFinales,
    },

    sincronizaciones,

    reprocesado: false,

    origen:
      "Booking",
  };
}
}

module.exports =
  new PropiedadCanalService();