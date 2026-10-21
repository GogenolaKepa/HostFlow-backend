const {test}=require('node:test'),assert=require('node:assert/strict');
const {proyectarRespuesta}=require('../src/security/proyecciones');
const acuerdo={idReserva:7,moneda:'USD',importe:'123.45',monedaPago:'ARS',reglaCambio:'CHECKIN',estadoFijacion:'FIJADA',valorAplicado:'1234.56789012',equivalenteARS:'152407.41',idAutor:999};
test('Operador no recibe importes nuevos en acuerdo ni snapshots de historial; Admin los conserva',()=>{
 const datos={reserva:{idReserva:7,acuerdoMonetario:acuerdo,accionesDisponibles:['VER','CANCELAR']},eventos:[{idEventoReserva:8,datosJson:{motivoMonetario:'COTIZACION_CHECKIN_FIJADA',anterior:null,actual:acuerdo}},{idEventoReserva:9,datosJson:{acuerdoMonetario:acuerdo,canal:'Manual'}}]};
 const op=proyectarRespuesta({path:'/reservas/7',usuario:{rol:'Operador'}},datos);assert.equal(op.reserva.acuerdoMonetario.moneda,'USD');
 for(const valor of [op.reserva.acuerdoMonetario,op.eventos[0].datosJson.actual,op.eventos[1].datosJson.acuerdoMonetario])for(const campo of ['importe','valorAplicado','equivalenteARS','idAutor'])assert.equal(Object.hasOwn(valor,campo),false);
 assert.deepEqual(op.reserva.accionesDisponibles,['VER']);assert.equal(datos.reserva.acuerdoMonetario.importe,'123.45');
 const admin=proyectarRespuesta({path:'/reservas/7',usuario:{rol:'Administrador'}},datos);assert.equal(admin.reserva.acuerdoMonetario.importe,'123.45');
});
