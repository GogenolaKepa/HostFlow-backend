// Preparación v3 OFFLINE: no persistencia, productores, destinatarios ni rutas.
// El adaptador futuro deberá suministrar una ocurrencia duradera del servidor
// y datos de una operación confirmada. Este constructor no acredita un commit.
const {createHash} = require('node:crypto');
const {rangoReservaValido} = require('../security/validacionReserva');
const {PRIORIDADES_PERSONALES} = require('../config/notificaciones');

const TIPOS_RESERVA = Object.freeze({
  RESERVA_NUEVA:'Informativa', RESERVA_CANCELADA:'Media',
  RESERVA_MODIFICADA:'Media', CONFLICTO_DISPONIBILIDAD:'Alta',
});
const CAMPOS_ENTRADA = ['idEmpresa','tipo','reserva','reservaRelacionada','idOcurrencia','fechaEvento','prioridad'];
const CAMPOS_RESERVA = ['idReserva','idPropiedad','fechaIngreso','fechaEgreso','estado','canal'];
function campos(valor, permitidos) {
  if (!valor || Object.getPrototypeOf(valor) !== Object.prototype || Object.keys(valor).some(k=>!permitidos.includes(k))) throw new Error('Contrato de evento inválido.');
}
function identificador(valor, maximo) {
  if (typeof valor === 'number') {
    if (!Number.isSafeInteger(valor)) throw new Error('Identificador inválido.');
    valor = String(valor);
  }
  if (typeof valor !== 'string' || !/^[1-9]\d{0,18}$/.test(valor) || BigInt(valor)>maximo) throw new Error('Identificador inválido.');
  return valor;
}
function validarReserva(reserva) {
  campos(reserva, CAMPOS_RESERVA);
  const idReserva = identificador(reserva.idReserva,9223372036854775807n);
  const idPropiedad = identificador(reserva.idPropiedad,2147483647n);
  if (!rangoReservaValido(reserva.fechaIngreso,reserva.fechaEgreso)
    || !['Manual','Airbnb','Booking'].includes(reserva.canal)
    || !['Pendiente','Confirmada','Cancelada','Finalizada','No show'].includes(reserva.estado)) throw new Error('Reserva de referencia inválida.');
  return {...reserva,idReserva,idPropiedad};
}
function construirEventoReserva(entrada) {
  campos(entrada,CAMPOS_ENTRADA);
  const idEmpresa = Number(identificador(entrada.idEmpresa,2147483647n));
  if (typeof entrada.tipo !== 'string' || !Object.hasOwn(TIPOS_RESERVA,entrada.tipo)) throw new Error('Tipo de evento no preparado.');
  if (typeof entrada.idOcurrencia !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(entrada.idOcurrencia)) throw new Error('Se necesita una ocurrencia estable del servidor.');
  if (typeof entrada.fechaEvento !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entrada.fechaEvento)
    || entrada.fechaEvento.startsWith('0000-') || !Number.isFinite(Date.parse(entrada.fechaEvento))
    || new Date(entrada.fechaEvento).toISOString() !== entrada.fechaEvento) throw new Error('Fecha UTC de evento inválida.');
  const prioridad = entrada.prioridad === undefined ? TIPOS_RESERVA[entrada.tipo] : entrada.prioridad;
  if (!PRIORIDADES_PERSONALES.includes(prioridad)) throw new Error('Prioridad inválida.');
  const reserva = validarReserva(entrada.reserva);
  let referencias = [reserva.idReserva];
  if (entrada.tipo === 'RESERVA_CANCELADA' && reserva.estado !== 'Cancelada') throw new Error('La cancelación requiere estado Cancelada.');
  if (entrada.tipo === 'RESERVA_NUEVA' && !['Pendiente','Confirmada'].includes(reserva.estado)) throw new Error('Estado inicial inválido.');
  if (entrada.tipo === 'CONFLICTO_DISPONIBILIDAD') {
    const otra = validarReserva(entrada.reservaRelacionada);
    if (reserva.idReserva === otra.idReserva || reserva.idPropiedad !== otra.idPropiedad
      || ![reserva,otra].every(r=>['Pendiente','Confirmada'].includes(r.estado))
      || reserva.fechaIngreso >= otra.fechaEgreso || reserva.fechaEgreso <= otra.fechaIngreso) throw new Error('No hay un conflicto de estadías activo.');
    referencias = [reserva.idReserva,otra.idReserva].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  } else if (entrada.reservaRelacionada !== undefined) {
    throw new Error('Referencia relacionada inesperada.');
  }
  const identidad = JSON.stringify(['hostflow-reservas-v3',idEmpresa,entrada.tipo,referencias,entrada.idOcurrencia]);
  const claveEvento = 'reserva-v3:' + createHash('sha256').update(identidad).digest('hex');
  // Proyección cerrada del modelo v2: sin contactos, precios, texto libre,
  // identificadores externos, JSON de negocio ni selección de destinatarios.
  return Object.freeze({idEmpresa,tipo:entrada.tipo,claveEvento,referenciaTipo:'reserva',
    referenciaId:referencias[0],prioridad,fechaEvento:entrada.fechaEvento});
}
function prepararLoteEventosReserva(entradas) {
  if (!Array.isArray(entradas)) throw new Error('Lote inválido.');
  const unicos = new Map();
  for (const entrada of entradas) {
    const evento = construirEventoReserva(entrada), clave = `${evento.idEmpresa}:${evento.claveEvento}`;
    const anterior = unicos.get(clave);
    if (anterior && JSON.stringify(anterior)!==JSON.stringify(evento)) throw new Error('Misma ocurrencia con contenido incompatible.');
    unicos.set(clave,evento);
  }
  return Object.freeze([...unicos.values()]);
}
module.exports = {TIPOS_RESERVA,construirEventoReserva,prepararLoteEventosReserva};
