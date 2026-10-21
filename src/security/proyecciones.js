const { tienePermiso } = require("../config/permisos");

function seleccionar(datos, campos) {
  // Los campos declarados aquí son escalares. No permitir objetos/arrays
  // inesperados bajo un nombre permitido evita filtraciones por anidamiento.
  return Object.fromEntries(campos.filter((campo) => Object.hasOwn(datos || {}, campo) &&
    (datos[campo] === null || ["string", "number", "boolean"].includes(typeof datos[campo]) ||
      (datos[campo] instanceof Date && Number.isFinite(datos[campo].getTime()))))
    .map((campo) => [campo, datos[campo] instanceof Date ? datos[campo].toISOString() : datos[campo]]));
}

function alertaOperativa(alerta) {
  return {
    ...seleccionar(alerta, ["idAlerta", "claveAlerta", "tipo", "categoria", "titulo", "mensaje", "severidad", "estado", "idReserva", "idPropiedad", "idIncidenciaReserva", "idPropiedadCanal", "propiedad", "origen", "fechaAlerta", "fechaCreacion", "fechaActualizacion", "fechaLectura", "fechaResolucion"]),
    datos: seleccionar(alerta.datos, ["tipoIncidencia", "descripcion", "huesped", "estadoIncidencia", "canal", "mensajeError", "estadoPublicacion", "propiedad", "fechaIngreso", "fechaEgreso", "diasRestantes", "idReservaA", "idReservaB", "canalA", "canalB", "huespedA", "huespedB", "fechaInicioConflicto", "fechaFinConflicto"]),
  };
}

function recomendacionOperativa(item) {
  if (!["limpieza_prioritaria", "conflicto_reservas"].includes(item?.tipo)) return null;
  const evidencia = item.evidencia || {};
  const camposReserva = ["idReserva", "canal", "fechaIngreso", "horaIngreso", "fechaEgreso", "horaEgreso"];
  return {
    ...seleccionar(item, ["id", "tipo", "prioridad", "titulo", "descripcion", "accion", "origen", "fundamentoIA"]),
    destino: seleccionar(item.destino, ["seccion", "idReserva", "idReservaRelacionada", "idPropiedad", "idTareaLimpieza", "idReservaSalida", "idReservaSiguiente"]),
    evidencia: item.tipo === "conflicto_reservas"
      ? { reservaA: seleccionar(evidencia.reservaA, camposReserva), reservaB: seleccionar(evidencia.reservaB, camposReserva) }
      : seleccionar(evidencia, ["estado", "prioridadLimpieza", "minutosDisponibles", "fechaInicio", "horaInicio", "fechaLimite", "horaLimite"]),
    ...(item.baseDeterministica ? { baseDeterministica: seleccionar(item.baseDeterministica, ["titulo", "descripcion", "accion"]) } : {}),
  };
}

function flowiaOperativo(datos) {
  const recomendaciones = (datos.recomendaciones || []).map(recomendacionOperativa).filter(Boolean);
  const contexto = datos.contexto || {};
  const ia = contexto.iaGenerativa || {};
  return {
    ...seleccionar(datos, ["mensaje", "fechaNegocio", "generadoEn"]),
    recomendaciones,
    resumen: {
      total: recomendaciones.length,
      altas: recomendaciones.filter((item) => item.prioridad === "Alta").length,
      medias: recomendaciones.filter((item) => item.prioridad === "Media").length,
      bajas: recomendaciones.filter((item) => item.prioridad === "Baja").length,
    },
    contexto: {
      ...seleccionar(contexto, ["horizonteConflictosDias", "horizonteOcupacionDias", "motor"]),
      iaGenerativa: {
        ...seleccionar(ia, ["solicitada", "configurada", "aplicada", "proveedor", "modelo", "motivoFallback"]),
        ...(ia.motivoFallback ? { motivoFallback: "Se muestran recomendaciones operativas sin asistencia generativa." } : {}),
        ...(ia.uso ? { uso: seleccionar(ia.uso, ["inputTokens", "outputTokens", "totalTokens"]) } : {}),
      },
    },
  };
}

function historicoOperativo(items = []) {
  return items.map((item) => seleccionar(item, ["mes", "inicioMes", "periodoDesde", "periodoHasta", "cantidadReservas", "nochesDisponibles", "nochesOcupadas", "ocupacionMensual"]));
}

function reportesOperativos(reportes) {
  return {
    periodo: seleccionar(reportes.periodo, ["tipo", "meses", "fechaDesde", "fechaHasta"]),
    filtros: seleccionar(reportes.filtros, ["idPropiedad", "canal", "estado"]),
    resumen: seleccionar(reportes.resumen, ["totalReservasPeriodo", "totalReservasOperativas", "reservasConIngreso", "nochesOcupadas", "nochesDisponibles", "ocupacionPromedio"]),
    historico: historicoOperativo(reportes.historico),
    porCanal: (reportes.porCanal || []).map((item) => seleccionar(item, ["canal", "cantidad", "porcentaje"])),
    porEstado: (reportes.porEstado || []).map((item) => seleccionar(item, ["estado", "cantidad", "porcentaje"])),
    porPropiedad: (reportes.porPropiedad || []).map((item) => seleccionar(item, ["idPropiedad", "propiedad", "reservas", "nochesReservadas"])),
  };
}

const PERMISO_ACCION_RESERVA = Object.freeze({
  VER: "reservas.ver", EDITAR: "reservas.modificar", CANCELAR: "reservas.cancelar",
  PROPONER_CAMBIO: "reservas.canales", GESTIONAR_BOOKING: "reservas.canales",
  VER_PROPUESTA_AIRBNB: "reservas.ver", VER_OPERACION_BOOKING: "reservas.ver", ABRIR_EN_CANAL: "reservas.ver",
});

function limitarAccionesReserva(reserva, usuario) {
  if (!reserva) return reserva;
  return { ...reserva, accionesDisponibles: (reserva.accionesDisponibles || []).filter((accion) =>
    tienePermiso(usuario, PERMISO_ACCION_RESERVA[accion])
  ) };
}

function proyectarRespuesta(req, datos) {
  if (!datos || typeof datos !== "object") return datos;
  const path = req.path.toLowerCase().replace(/\/$/, "");
  if(path.startsWith('/reservas')&&!tienePermiso(req.usuario,'reservas.importes')){
    const acuerdoPublico=a=>a?seleccionar(a,['idReserva','moneda','monedaPago','reglaCambio','estadoFijacion','estadoReserva']):null;
    const reservaPublica=r=>r?.acuerdoMonetario?{...r,acuerdoMonetario:acuerdoPublico(r.acuerdoMonetario)}:r;
    datos={...datos};if(datos.reserva)datos.reserva=reservaPublica(datos.reserva);
    if(Array.isArray(datos.reservas))datos.reservas=datos.reservas.map(reservaPublica);
    if(Array.isArray(datos.eventos))datos.eventos=datos.eventos.map(e=>{
      const d=e.datosJson;if(!d||typeof d!=='object')return e;
      if(d.motivoMonetario)return {...e,datosJson:{motivoMonetario:d.motivoMonetario,anterior:acuerdoPublico(d.anterior),actual:acuerdoPublico(d.actual)}};
      return d.acuerdoMonetario?{...e,datosJson:{...d,acuerdoMonetario:acuerdoPublico(d.acuerdoMonetario)}}:e;
    });
  }
  if (path.startsWith("/reservas") && !tienePermiso(req.usuario, "reservas.cancelar")) {
    datos = { ...datos };
    if (Array.isArray(datos.reservas)) datos.reservas = datos.reservas.map((r) => limitarAccionesReserva(r, req.usuario));
    if (datos.reserva) datos.reserva = limitarAccionesReserva(datos.reserva, req.usuario);
  }
  if (path === "/dashboard/resumen" && !tienePermiso(req.usuario, "dashboard.economia") && datos.resumen) {
    return {
      resumen: seleccionar(datos.resumen, ["propiedadesActivas", "reservasActivas", "huespedesRegistrados", "ocupacionMensual", "alertasPendientes"]),
      proximasReservas: (datos.proximasReservas || []).map((item) => seleccionar(item, ["idReserva", "huesped", "propiedad", "canal", "estado", "fechaIngreso", "fechaEgreso", "cantidadHuespedes"])),
      alertas: (datos.alertas || []).map(alertaOperativa),
    };
  }
  if (path === "/dashboard/historico" && !tienePermiso(req.usuario, "dashboard.economia") && datos.historico) {
    return { mensaje: datos.mensaje, historico: historicoOperativo(datos.historico) };
  }
  if (path === "/dashboard/reportes" && !tienePermiso(req.usuario, "reportes.economia") && datos.reportes) {
    return { mensaje: datos.mensaje, reportes: reportesOperativos(datos.reportes) };
  }
  if (path === "/recomendaciones" && !tienePermiso(req.usuario, "flowia.comercial") && Array.isArray(datos.recomendaciones)) {
    return flowiaOperativo(datos);
  }
  return datos;
}

module.exports = { proyectarRespuesta, reportesOperativos, historicoOperativo, recomendacionOperativa };
