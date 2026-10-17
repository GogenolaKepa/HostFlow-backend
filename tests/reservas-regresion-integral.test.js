// Hermeticas: repositorios en memoria, sin driver, configuracion o SQL real.
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const memoria=new Map(),eventos=[];let escrituras=0,numero=0,conflicto=false;
const reservaBase={idReserva:1,idPropiedad:1,idHuesped:1,canal:'Booking',estado:'Confirmada',fechaIngreso:'2028-02-28',fechaEgreso:'2028-03-02',horaIngreso:'15:00',horaEgreso:'10:00',cantidadHuespedes:2,montoEstimado:100};
const repo={
 conAltaInboundBookingAtomica:async ejecutar=>ejecutar({...repo,conexion:Object.freeze({fixture:true})}),
 conCreacionManualAtomica:async ejecutar=>ejecutar({...repo,conexion:Object.freeze({fixture:true})}),
 obtenerPorId:async id=>({...reservaBase,idReserva:Number(id)}),
 obtenerPorCanalEIdExterno:async(canal,id)=>{const fila=memoria.get(`${canal}:${id}`);return fila?{...fila}:null;},
 obtenerPropiedadPorId:async()=>({idPropiedad:1,estado:'Activa',capacidadMaxima:4,nombre:'Propiedad ficticia'}),
 obtenerHuespedPorId:async()=>({idHuesped:1,nombre:'Persona',apellido:'Ficticia'}),
 obtenerHuespedPorNombreYApellido:async()=>({idHuesped:1,nombre:'Persona',apellido:'Ficticia'}),
 existeConflictoFechas:async()=>conflicto,
 crearReservaExterna:async datos=>{escrituras++;const r={...datos,idReserva:++numero};memoria.set(`${datos.canal}:${datos.idExterno}`,r);return r;},
 crearReservaManual:async()=>{escrituras++;return{idReserva:++numero};},
 actualizarEstadoSincronizacion:async()=>{escrituras++;},
 sincronizarReservaExterna:async(id,datos)=>{escrituras++;for(const r of memoria.values())if(r.idReserva===id)Object.assign(r,datos);},
 sincronizarEstadoExterno:async(id,estado)=>{escrituras++;for(const r of memoria.values())if(r.idReserva===id)r.estado=estado;},
};
for(const nombre of ['ReservaRepository','ReservaEventoRepository','ReservaMensajeRepository','ReservaIncidenciaRepository','ReservaObservacionRepository']){
 const id=require.resolve('../src/repositories/'+nombre);
 require.cache[id]={id,filename:id,loaded:true,exports:nombre==='ReservaRepository'?repo:nombre==='ReservaEventoRepository'?{crearEvento:async d=>{eventos.push(d);return d;}}:new Proxy({},{get(){throw Error('Repositorio no previsto en la prueba');}})};
}
const db=require.resolve('../src/config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:new Proxy({},{get(){throw Error('SQL real prohibido');}})};
const original=require('../src/services/ReservaService');
const servicio=Object.create(Object.getPrototypeOf(original));
servicio.finalizarReservasVencidas=async()=>({idsReservas:[]});
servicio.obtenerReservaPorId=async id=>repo.obtenerPorId(id);
servicio.registrarConflictoReserva=async datos=>{eventos.push({tipo:'CONFLICTO_DISPONIBILIDAD',...datos});};
const booking=require('../src/services/BookingInboundService'),airbnb=require('../src/services/AirbnbInboundService');
const canalBooking=require('../src/services/BookingChannelService');
const datos=()=>({idPropiedad:1,idHuesped:1,idExterno:'fixture-externo',fechaIngreso:'2028-02-28',fechaEgreso:'2028-03-02',horaIngreso:'15:00',horaEgreso:'10:00',cantidadHuespedes:2,montoEstimado:100});
beforeEach(()=>{memoria.clear();eventos.length=0;escrituras=0;numero=0;conflicto=false;booking.eventosPendientes=[];airbnb.eventos=[];canalBooking.operaciones=[];});

test('Booking: rechaza dias imposibles y fechas malformadas antes de encolar/escribir',async()=>{
 for(const fechaEgreso of ['no-es-fecha','2028-02-30','2027-02-29','2028-04-31','2028-02-28','2028-02-27']){
  await assert.rejects(servicio.cambiarEstadiaBooking(1,{fechaEgreso,montoEstimado:100}),/fecha|rango/i);
 }
 assert.equal(escrituras,0);
});
test('Manual: cantidades invalidas e importes no finitos no se persisten',async()=>{
 for(const cambio of [{cantidadHuespedes:-1},{cantidadHuespedes:0},{cantidadHuespedes:1.5},{cantidadHuespedes:'incorrecto'},{montoEstimado:-1},{montoEstimado:'Infinity'},{montoEstimado:'NaN'}]){
  await assert.rejects(servicio.crearReserva({...datos(),...cambio}));
 }
 assert.equal(escrituras,0);
});
test('Manual: IDs de propiedad y huésped requieren enteros positivos antes de persistir',async()=>{
 for(const campo of ['idPropiedad','idHuesped'])for(const valor of [-1,1.5,2147483648,[1],{},true,'1e2','01',' 1 ']){
  await assert.rejects(servicio.crearReserva({...datos(),[campo]:valor}),/identificadores/i);
 }
 assert.equal(escrituras,0);
});
test('Manual: acepta el dia bisiesto, rechaza conflicto y capacidad sin insertar',async()=>{
 const creada=await servicio.crearReserva(datos());assert.equal(creada.idReserva,1);assert.equal(escrituras,1);
 conflicto=true;await assert.rejects(servicio.crearReserva(datos()),/rango|reserva/i);assert.equal(escrituras,1);
 conflicto=false;await assert.rejects(servicio.crearReserva({...datos(),cantidadHuespedes:5}),/capacidad/i);assert.equal(escrituras,1);
});
for(const [canal,cola,metodo]of [['Booking',booking,'procesarEventoBooking'],['Airbnb',airbnb,'procesarEventoAirbnb']]){
 test(`${canal}: modificación y cancelación simultáneamente repetidas actualizan y registran una sola vez`,async()=>{
  await servicio[metodo](cola.simularNuevaReserva(datos()).idEvento);
  const modificada=cola.simularModificacionReserva({...datos(),fechaEgreso:'2028-03-03'});
  await Promise.all([servicio[metodo](modificada.idEvento),servicio[metodo](modificada.idEvento)]);
  assert.equal(escrituras,2);assert.equal(eventos.filter(e=>e.tipo==='RESERVA_MODIFICADA').length,1);
  assert.equal([...memoria.values()][0].fechaEgreso,'2028-03-03');
  const cancelada=cola.simularCancelacionReserva(datos());
  await Promise.all([servicio[metodo](cancelada.idEvento),servicio[metodo](cancelada.idEvento)]);
  assert.equal(escrituras,3);assert.equal(eventos.filter(e=>e.tipo==='RESERVA_CANCELADA').length,1);assert.equal([...memoria.values()][0].estado,'Cancelada');
 });
 test(`${canal}: modificación inválida no persiste y puede reintentarse después del error`,async()=>{
  await servicio[metodo](cola.simularNuevaReserva(datos()).idEvento);
  for(const cambio of [{cantidadHuespedes:1.2},{cantidadHuespedes:'NaN'},{montoEstimado:'NaN'},{montoEstimado:'Infinity'},{fechaEgreso:'2028-02-30'}]){
   const evento=cola.simularModificacionReserva({...datos(),...cambio});await assert.rejects(servicio[metodo](evento.idEvento));assert.equal(evento.estado,'Pendiente');
   assert.equal(escrituras,1);
  }
  const valido=cola.simularModificacionReserva({...datos(),fechaEgreso:'2028-03-04'});await servicio[metodo](valido.idEvento);assert.equal(escrituras,2);
 });
 test(`${canal}: entradas numericas invalidas no crean reservas ni huespedes`,async()=>{
  for(const cambio of [{cantidadHuespedes:-1},{cantidadHuespedes:0},{cantidadHuespedes:1.2},{cantidadHuespedes:[2]},{montoEstimado:'Infinity'},{montoEstimado:'invalido'},{montoEstimado:-1}]){
   const evento=cola.simularNuevaReserva({...datos(),...cambio});await assert.rejects(servicio[metodo](evento.idEvento));assert.equal(evento.estado,'Pendiente');
  }
  assert.equal(escrituras,0);
 });
 test(`${canal}: una reserva externa confirmada conserva el conflicto y se recibe una sola vez`,async()=>{
  conflicto=true;const evento=cola.simularNuevaReserva(datos());const resultado=await servicio[metodo](evento.idEvento);
  assert.equal(resultado.conflictoDetectado,true);assert.equal(escrituras,1);assert.equal(evento.estado,'Procesado');
  await servicio[metodo](evento.idEvento);assert.equal(escrituras,1);
 });
 test(`${canal}: dos entregas simultaneas del mismo evento no duplican reserva ni timeline`,async()=>{
  const evento=cola.simularNuevaReserva(datos());
  const resultados=await Promise.all([servicio[metodo](evento.idEvento),servicio[metodo](evento.idEvento)]);
  assert.equal(resultados.length,2);assert.equal(escrituras,1);assert.equal(memoria.size,1);
  assert.equal(eventos.filter(e=>e.tipo==='RESERVA_RECIBIDA').length,1);assert.equal(evento.estado,'Procesado');
 });
 test(`${canal}: eventos diferentes con el mismo id externo no crean dos reservas`,async()=>{
  const uno=cola.simularNuevaReserva(datos()),dos=cola.simularNuevaReserva(datos());
  await Promise.all([servicio[metodo](uno.idEvento),servicio[metodo](dos.idEvento)]);
  assert.equal(escrituras,1);assert.equal(uno.estado,'Procesado');assert.equal(dos.estado,'Procesado');
 });
}
