const PropiedadRepository = require(
  "../repositories/PropiedadRepository"
);
const PropiedadCanalRepository = require(
  "../repositories/PropiedadCanalRepository"
);
const PropiedadCanalService = require(
  "./PropiedadCanalService"
);

class PropiedadService {
  // =========================================================
  // UTILIDADES
  // =========================================================

  normalizarEstado(estado) {
    if (!estado) {
      return "Activa";
    }

    // Compatibilidad con el valor viejo del mock
    if (estado === "En mantenimiento") {
      return "Mantenimiento";
    }

    return estado;
  }

  validarDatosPropiedad(datos) {
    if (!datos.nombre?.trim()) {
      throw new Error(
        "El nombre de la propiedad es obligatorio."
      );
    }

    if (!datos.tipo?.trim()) {
      throw new Error(
        "El tipo de propiedad es obligatorio."
      );
    }

    if (!datos.direccion?.trim()) {
      throw new Error(
        "La dirección es obligatoria."
      );
    }

    if (!datos.ciudad?.trim()) {
      throw new Error(
        "La ciudad es obligatoria."
      );
    }

    if (!datos.provincia?.trim()) {
      throw new Error(
        "La provincia es obligatoria."
      );
    }

    const capacidadMaxima =
      Number(datos.capacidadMaxima);

    if (
      !Number.isInteger(capacidadMaxima) ||
      capacidadMaxima <= 0
    ) {
      throw new Error(
        "La capacidad máxima debe ser un número entero mayor a cero."
      );
    }

    const precioBase =
      Number(datos.precioBase);

    if (
      !Number.isFinite(precioBase) ||
      precioBase <= 0
    ) {
      throw new Error(
        "El precio base debe ser mayor a cero."
      );
    }
  }

  // =========================================================
  // OBTENER TODAS
  // =========================================================

  async obtenerPropiedades() {
    return PropiedadRepository.obtenerTodas();
  }

  // =========================================================
  // OBTENER POR ID
  // =========================================================

  async obtenerPropiedadPorId(
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

  const canales =
    await PropiedadCanalRepository.obtenerPorPropiedad(
      idPropiedad
    );

  return {
    ...propiedad,
    canales,
  };
}

  // =========================================================
  // CREAR
  // =========================================================

  async crearPropiedad(datos) {
    const estadoNormalizado =
      this.normalizarEstado(
        datos.estado || "Activa"
      );

    const datosPropiedad = {
      nombre: datos.nombre?.trim(),
      tipo: datos.tipo?.trim(),
      direccion:
        datos.direccion?.trim(),
      ciudad: datos.ciudad?.trim(),
      provincia:
        datos.provincia?.trim(),
      capacidadMaxima:
        Number(datos.capacidadMaxima),
      precioBase:
        Number(datos.precioBase),
      estado: estadoNormalizado,
    };

    this.validarDatosPropiedad(
      datosPropiedad
    );

    const estado =
      await PropiedadRepository
        .obtenerEstadoPorNombre(
          estadoNormalizado
        );

    if (!estado) {
      throw new Error(
        "El estado indicado no es válido."
      );
    }

    return PropiedadRepository.crear(
      datosPropiedad,
      estado.idEstadoPropiedad
    );
  }

  // =========================================================
// MODIFICAR
// =========================================================

async modificarPropiedad(
  idPropiedad,
  datos
) {
  const propiedadActual =
    await PropiedadRepository.obtenerPorId(
      idPropiedad
    );

  if (!propiedadActual) {
    throw new Error(
      "La propiedad no existe."
    );
  }

  const estadoNormalizado =
    this.normalizarEstado(
      datos.estado ||
        propiedadActual.estado
    );

  const datosActualizados = {
    nombre:
      datos.nombre !== undefined
        ? datos.nombre.trim()
        : propiedadActual.nombre,

    tipo:
      datos.tipo !== undefined
        ? datos.tipo.trim()
        : propiedadActual.tipo,

    direccion:
      datos.direccion !== undefined
        ? datos.direccion.trim()
        : propiedadActual.direccion,

    ciudad:
      datos.ciudad !== undefined
        ? datos.ciudad.trim()
        : propiedadActual.ciudad,

    provincia:
      datos.provincia !== undefined
        ? datos.provincia.trim()
        : propiedadActual.provincia,

    capacidadMaxima:
      datos.capacidadMaxima !== undefined
        ? Number(
            datos.capacidadMaxima
          )
        : propiedadActual.capacidadMaxima,

    precioBase:
      datos.precioBase !== undefined
        ? Number(
            datos.precioBase
          )
        : Number(
            propiedadActual.precioBase
          ),

    estado:
      estadoNormalizado,
  };

  this.validarDatosPropiedad(
    datosActualizados
  );

  const estado =
    await PropiedadRepository
      .obtenerEstadoPorNombre(
        estadoNormalizado
      );

  if (!estado) {
    throw new Error(
      "El estado indicado no es válido."
    );
  }

  /*
   * Primero modificamos HostFlow.
   *
   * La base local es la que conserva
   * inmediatamente el cambio realizado
   * por el operador.
   */
  const propiedadActualizada =
    await PropiedadRepository.actualizar(
      idPropiedad,
      datosActualizados,
      estado.idEstadoPropiedad
    );

  /*
   * Después intentamos sincronizar el cambio
   * con todos los canales externos donde
   * la propiedad ya esté publicada.
   *
   * Si un canal falla, PropiedadCanalService
   * lo deja registrado como Error sin impedir
   * que los demás canales continúen.
   */
  const sincronizaciones =
    await PropiedadCanalService
      .sincronizarCambiosPropiedad(
        propiedadActualizada
      );

  /*
   * Volvemos a consultar el detalle completo
   * para devolver los estados actuales de
   * Airbnb / Booking desde Azure.
   */
  const propiedadFinal =
    await this.obtenerPropiedadPorId(
      idPropiedad
    );

  return {
    ...propiedadFinal,
    sincronizaciones,
  };
}

  // =========================================================
  // CAMBIAR ESTADO
  // =========================================================

  async cambiarEstadoPropiedad(
    idPropiedad,
    estado
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

    const estadoNormalizado =
      this.normalizarEstado(estado);

    const estadoEncontrado =
      await PropiedadRepository
        .obtenerEstadoPorNombre(
          estadoNormalizado
        );

    if (!estadoEncontrado) {
      throw new Error(
        "El estado indicado no es válido."
      );
    }

    return PropiedadRepository
      .cambiarEstado(
        idPropiedad,
        estadoEncontrado.idEstadoPropiedad
      );
  }
}

module.exports =
  new PropiedadService();