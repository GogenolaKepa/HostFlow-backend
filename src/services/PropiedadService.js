const PropiedadRepository = require(
  "../repositories/PropiedadRepository"
);
const PropiedadCanalRepository = require(
  "../repositories/PropiedadCanalRepository"
);
const PropiedadCanalService = require(
  "./PropiedadCanalService"
);
const {ErrorSeguridad}=require('../security/seguridadUsuarios');

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
    const {estadoMonedas}=require('../config/monedas');
    if(estadoMonedas().activado)throw new ErrorSeguridad(409,'MONEDAS_PRECIO_AUTORITATIVO','Creá la propiedad y su tarifa desde el formulario monetario actualizado.');
    if(['moneda','monedaBase','tarifaMonetaria'].some(campo=>Object.hasOwn(datos,campo)))throw new ErrorSeguridad(400,'MONEDAS_PENDIENTES','El alta anterior no puede guardar una moneda declarada.');
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

    return PropiedadRepository.conEscrituraAtomica(async repo => {
    const estado =
      await repo
        .obtenerEstadoPorNombre(
          estadoNormalizado
        );

    if (!estado) {
      throw new Error(
        "El estado indicado no es válido."
      );
    }

    const creada = await repo.crear(datosPropiedad, estado.idEstadoPropiedad);
    if (!Number.isInteger(creada?.idPropiedad) || creada.idPropiedad <= 0) throw new Error('No se pudo verificar la propiedad creada.');
    return creada;
    });
  }

  // =========================================================
// MODIFICAR
// =========================================================

async modificarPropiedad(
  idPropiedad,
  datos
) {
  if(['moneda','monedaBase','tarifaMonetaria'].some(campo=>Object.hasOwn(datos,campo)))throw new ErrorSeguridad(400,'MONEDAS_ENDPOINT','La moneda y la tarifa se revisan desde Monedas y cotizaciones.');
  const propiedadActualizada = await PropiedadRepository.conEscrituraAtomica(async repo => {
  const propiedadActual =
    await repo.obtenerPorId(
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
    preservarPrecio: datos.precioBase===undefined,
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
    await repo
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
  const actualizada =
    await repo.actualizar(
      idPropiedad,
      datosActualizados,
      estado.idEstadoPropiedad
    );

  if (!actualizada || Number(actualizada.idPropiedad) !== Number(idPropiedad)) throw new Error('No se pudo verificar la propiedad actualizada.');
  return actualizada;
  });

  // La sincronización externa no participa en el commit local.
  try {
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
  } catch {
    throw Object.assign(new Error('La propiedad fue guardada localmente, pero no se pudo confirmar el estado final de sus canales. Recargá antes de reintentar.'), {status:500, codigo:'PROPIEDAD_SINCRONIZACION_PENDIENTE'});
  }
}

  // =========================================================
  // CAMBIAR ESTADO
  // =========================================================

  async cambiarEstadoPropiedad(
    idPropiedad,
    estado
  ) {
    return PropiedadRepository.conEscrituraAtomica(async repo => {
    const propiedad =
      await repo.obtenerPorId(
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
      await repo
        .obtenerEstadoPorNombre(
          estadoNormalizado
        );

    if (!estadoEncontrado) {
      throw new Error(
        "El estado indicado no es válido."
      );
    }

    const actualizada = await repo.cambiarEstado(idPropiedad, estadoEncontrado.idEstadoPropiedad);
    if (!actualizada || Number(actualizada.idPropiedad) !== Number(idPropiedad)) throw new Error('No se pudo verificar el estado de la propiedad.');
    return actualizada;
    });
  }
}

module.exports =
  new PropiedadService();
