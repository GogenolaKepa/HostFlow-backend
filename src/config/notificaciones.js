// La bandeja inicial es una vista de condiciones operativas, no eventos personales.
const AVISOS = Object.freeze({
  CHECKIN_PROXIMO: { categoria: 'reservas', titulo: 'Ingreso próximo', descripcion: 'Hay una reserva con ingreso próximo. Consultá su gestión operativa.' },
  CONFLICTO_RESERVAS: { categoria: 'reservas', titulo: 'Conflicto de disponibilidad', descripcion: 'Existen reservas que requieren revisión de disponibilidad.' },
  INCIDENCIA_ABIERTA: { categoria: 'alertas', titulo: 'Incidencia pendiente', descripcion: 'Una incidencia operativa sigue abierta o en seguimiento.' },
  SINCRONIZACION_ERROR: { categoria: 'alertas', titulo: 'Sincronización pendiente de revisión', descripcion: 'Una integración informó una situación que requiere revisión.' },
});
const TIPOS_PREFERENCIA = Object.freeze([
  'RESERVA_NUEVA', 'RESERVA_CANCELADA', 'RESERVA_MODIFICADA', 'LIMPIEZA_PENDIENTE',
  'LIMPIEZA_PROXIMA', 'CONFLICTO_DISPONIBILIDAD', 'ALERTA_CRITICA', 'SISTEMA_INFORMATIVO',
]);
const LONGITUD_PRIORIDAD = 16;
const PRIORIDADES_PERSONALES = Object.freeze(['Critica','Alta','Media','Informativa']);
const PRIORIDADES = Object.freeze([...PRIORIDADES_PERSONALES,'NoDefinida']);
const prioridadAviso = valor => PRIORIDADES.includes(valor) ? valor : 'NoDefinida';
const PERMISO_POR_TIPO = Object.freeze({
  RESERVA_NUEVA:'reservas.ver',RESERVA_CANCELADA:'reservas.ver',RESERVA_MODIFICADA:'reservas.ver',
  CONFLICTO_DISPONIBILIDAD:'reservas.ver',LIMPIEZA_PENDIENTE:'limpiezas.ver',LIMPIEZA_PROXIMA:'limpiezas.ver',
  ALERTA_CRITICA:'alertas.ver',SISTEMA_INFORMATIVO:'cuenta.ver',
});
module.exports = { AVISOS, TIPOS_PREFERENCIA, PRIORIDADES, PRIORIDADES_PERSONALES, LONGITUD_PRIORIDAD, prioridadAviso, PERMISO_POR_TIPO };
