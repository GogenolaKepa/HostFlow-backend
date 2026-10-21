const {validarCampos,ErrorSeguridad}=require('../security/seguridadUsuarios');
const {MONEDAS,decimal,unidades}=require('./monedas');
function normalizarAcuerdo(body){
 validarCampos(body,['moneda','importe','pagoEquivalenteARS','fuenteReferencia','confirmar'],['moneda','importe','pagoEquivalenteARS','confirmar']);
 if(body.confirmar!==true||!MONEDAS.includes(body.moneda)||typeof body.importe!=='string'||typeof body.pagoEquivalenteARS!=='boolean')
  throw new ErrorSeguridad(400,'ACUERDO_INVALIDO','Confirmá moneda, importe y regla de pago del acuerdo.');
 const importe=decimal(unidades(body.importe));
 if(body.pagoEquivalenteARS&&(body.moneda!=='USD'||!['BCRA','MANUAL'].includes(body.fuenteReferencia)))
  throw new ErrorSeguridad(400,'ACUERDO_INVALIDO','El pago equivalente en ARS requiere un acuerdo USD y una fuente válida.');
 if(!body.pagoEquivalenteARS&&body.fuenteReferencia!==undefined&&body.fuenteReferencia!==null)
  throw new ErrorSeguridad(400,'ACUERDO_INVALIDO','Un acuerdo sin conversión no utiliza una fuente cambiaria.');
 return Object.freeze({moneda:body.moneda,importe,pagoEquivalenteARS:body.pagoEquivalenteARS,
  fuenteReferencia:body.pagoEquivalenteARS?body.fuenteReferencia:null,
  tipoReferencia:body.pagoEquivalenteARS?(body.fuenteReferencia==='BCRA'?'BCRA_TIPO_COTIZACION':'MANUAL'):null});
}
function presentarAcuerdo(row,reserva){
 if(!row)return null;
 return {...row,monedaPago:row.pagoEquivalenteARS?'ARS':row.moneda,reglaCambio:row.pagoEquivalenteARS?'CHECKIN':'SIN_CONVERSION',
  estadoFijacion:!row.pagoEquivalenteARS?'NO_REQUIERE':row.fijadoEn?'FIJADA':'PENDIENTE',estadoReserva:reserva.estado};
}
function validarReservaMonetaria(reserva){
 if(!reserva)throw new ErrorSeguridad(404,'RESERVA_NO_ENCONTRADA','La reserva no existe.');
 if(reserva.canal!=='Manual')throw new ErrorSeguridad(400,'ACUERDO_CANAL','No se reinterpretan contratos de Booking o Airbnb.');
 if(!['Confirmada','Pendiente'].includes(reserva.estado))throw new ErrorSeguridad(409,'ACUERDO_ESTADO','La reserva ya no admite cambios monetarios.');
}
module.exports={normalizarAcuerdo,presentarAcuerdo,validarReservaMonetaria};
