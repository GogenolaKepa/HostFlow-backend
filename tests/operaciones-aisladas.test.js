// Servicios REALES con repositorios en memoria. Ningún driver, .env, servidor
// HTTP existente o conexión Azure puede ejecutarse desde esta fixture.
const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const db=require.resolve('../src/config/database');
require.cache[db]={id:db,filename:db,loaded:true,exports:new Proxy({},{get(){throw Error('Conexión SQL prohibida en esta prueba.');}})};
const repos={},calls=[];
for(const archivo of fs.readdirSync(path.join(__dirname,'../src/repositories'))) {
  if(!archivo.endsWith('.js'))continue;
  const name=archivo.slice(0,-3),target={};repos[name]=target;
  const id=require.resolve(`../src/repositories/${archivo}`);
  require.cache[id]={id,filename:id,loaded:true,exports:new Proxy(target,{get(obj,key){return obj[key] || (()=>{throw Error(`Repositorio no previsto: ${name}.${String(key)}`);});}})};
}
const reservas=new Map(),eventos=[],alertas=new Map();let conflicto=false,estadoPropiedad='Activa',estadoLimpieza='Pendiente',numero=0;
const registrar=(repo,nombre,fn)=>{repos[repo][nombre]=async(...args)=>{calls.push({repo,nombre,args});return fn(...args);};};
const huesped={idHuesped:1,nombre:'Persona',apellido:'Ficticia',email:'persona@example.invalid'};
const datos=()=>({idPropiedad:1,idHuesped:1,fechaIngreso:'2100-01-10',fechaEgreso:'2100-01-13',horaIngreso:'17:20',horaEgreso:'09:40',cantidadHuespedes:2,montoEstimado:500});
const guardar=(d)=>{const fila={...d,idReserva:++numero,canal:d.canal||'Manual',estado:d.estado||'Confirmada',propiedad:'Propiedad ficticia',huesped:'Persona ficticia'};reservas.set(fila.idReserva,fila);return {...fila};};
registrar('ReservaRepository','finalizarReservasVencidas',()=>({idsReservas:[]}));
registrar('ReservaRepository','obtenerPropiedadPorId',()=>({idPropiedad:1,nombre:'Propiedad ficticia',estado:estadoPropiedad,capacidadMaxima:4}));
registrar('ReservaRepository','obtenerHuespedPorId',()=>huesped);
registrar('ReservaRepository','obtenerHuespedPorNombreYApellido',()=>huesped);
registrar('ReservaRepository','obtenerPorId',id=>({...reservas.get(Number(id))}));
registrar('ReservaRepository','obtenerPorHuesped',()=>[...reservas.values()].map(r=>({...r})));
registrar('ReservaRepository','obtenerPorCanalEIdExterno',(canal,id)=>[...reservas.values()].find(r=>r.canal===canal&&r.idExterno===id));
registrar('ReservaRepository','existeConflictoFechas',()=>conflicto);
registrar('ReservaRepository','crearReservaManual',guardar);
registrar('ReservaRepository','conCreacionManualAtomica',ejecutar=>
  ejecutar({...repos.ReservaRepository, conexion:Object.freeze({fixture:true})}));
registrar('ReservaRepository','crearReservaExterna',guardar);
// Solo adapta la nueva frontera: los casos/assertions existentes siguen iguales.
registrar('ReservaRepository','conAltaInboundBookingAtomica',ejecutar=>
  ejecutar({...repos.ReservaRepository, conexion:Object.freeze({fixture:true})}));
registrar('ReservaRepository','cancelarReservaManual',id=>{reservas.get(id).estado='Cancelada';return {...reservas.get(id)};});
// Esta suite prueba reglas con memoria; la transacción real del código se cubre con driver ficticio aparte.
registrar('ReservaRepository','conCancelacionManualAtomica',(_id, ejecutar)=>
  ejecutar({...repos.ReservaRepository, conexion:Object.freeze({fixture:true})}));
registrar('ReservaRepository','conEdicionManualAtomica',(_id, ejecutar)=>
  ejecutar({...repos.ReservaRepository, conexion:Object.freeze({fixture:true})}));
registrar('ReservaRepository','obtenerControlEdicion',id=>({idReserva:id,idEstadoReserva:12}));
registrar('ReservaRepository','actualizarReservaManualCondicionada',(id,d)=>{
  Object.assign(reservas.get(id),d);return {idReserva:id};
});
registrar('ReservaRepository','sincronizarEstadoExterno',(id,estado)=>{reservas.get(id).estado=estado;});
registrar('ReservaRepository','sincronizarReservaExterna',(id,d)=>{Object.assign(reservas.get(id),d);});
registrar('ReservaEventoRepository','crearEvento',d=>{eventos.push(d);return d;});
registrar('HuespedRepository','obtenerPorId',()=>huesped);
registrar('LimpiezaRepository','sincronizar',()=>({creadas:0,actualizadas:0}));
registrar('LimpiezaRepository','obtenerTodas',()=>[]);
registrar('LimpiezaRepository','obtenerPorId',()=>({idTareaLimpieza:1,estado:estadoLimpieza}));
registrar('LimpiezaRepository','cambiarEstado',(id,estado)=>({idTareaLimpieza:id,estado}));
registrar('AlertaRepository','obtenerTodas',()=>[...alertas.values()]);
registrar('AlertaRepository','obtenerIncidenciasAlertables',()=>[]);
registrar('AlertaRepository','obtenerSincronizacionesConError',()=>[]);
registrar('AlertaRepository','obtenerCheckinsProximos',()=>[]);
registrar('AlertaRepository','obtenerConflictosActivos',()=>[]);
registrar('AlertaRepository','crearOActualizarPorClave',d=>{alertas.set(d.claveAlerta,{...d,idAlerta:alertas.get(d.claveAlerta)?.idAlerta||alertas.size+1});});
registrar('AlertaRepository','obtenerGeneradasActivas',()=>[...alertas.values()].filter(a=>a.estado!=='Resuelta'));
registrar('AlertaRepository','resolverPorId',id=>{for(const a of alertas.values())if(a.idAlerta===id)a.estado='Resuelta';});
repos.AlertaRepository.conSincronizacion=async ejecutar=>ejecutar(repos.AlertaRepository);
const reservaService=require('../src/services/ReservaService'),limpiezaService=require('../src/services/LimpiezaService');
const huespedService=require('../src/services/HuespedService'),alertaService=require('../src/services/AlertaService');
const channels={Booking:require('../src/services/BookingInboundService'),Airbnb:require('../src/services/AirbnbInboundService')};
const construir=alertaService.construirAlertasOperativas;
beforeEach(()=>{calls.length=0;reservas.clear();eventos.length=0;alertas.clear();numero=0;conflicto=false;estadoPropiedad='Activa';estadoLimpieza='Pendiente';channels.Booking.eventosPendientes=[];channels.Airbnb.eventos=[];alertaService.construirAlertasOperativas=construir;});

test('detalle de huésped lee historial sin finalizar reservas ni sincronizar operaciones',async()=>{
 guardar(datos());const h=await huespedService.obtenerHuespedPorId(1);
 assert.equal(h.historialReservas.length,1);assert.equal(h.proximaReserva.idReserva,1);
 assert.deepEqual(calls.map(c=>c.nombre),['obtenerPorId','obtenerPorHuesped']);
});
test('reserva manual conserva horas explícitas y registra evento de creación',async()=>{
 const r=await reservaService.crearReserva(datos());
 assert.equal(r.horaIngreso,'17:20');assert.equal(r.horaEgreso,'09:40');assert.equal(r.canal,'Manual');
 assert.equal(eventos.filter(e=>e.tipo==='RESERVA_CREADA').length,1);assert.equal(reservas.size,1);
});
test('validaciones existentes: rango, hora, capacidad, disponibilidad y propiedad no disponible',async()=>{
 for(const invalido of [{fechaEgreso:'2100-01-09'},{fechaIngreso:'fecha-invalida'},{fechaIngreso:'2100-02-30',fechaEgreso:'2100-03-10'},{horaIngreso:'24:00'},{cantidadHuespedes:5}])await assert.rejects(reservaService.crearReserva({...datos(),...invalido}));
 conflicto=true;await assert.rejects(reservaService.crearReserva(datos()),/rango de fechas/);
 conflicto=false;estadoPropiedad='Inactiva';await assert.rejects(reservaService.crearReserva(datos()),/no se encuentra disponible/);
 assert.equal(reservas.size,0);assert.equal(eventos.length,0);
});
test('cancelación manual conserva fila, registra evento y respeta canal/estado cerrado',async()=>{
 const r=guardar(datos());await reservaService.cancelarReserva(r.idReserva);assert.equal(reservas.size,1);assert.equal(reservas.get(r.idReserva).estado,'Cancelada');
 await assert.rejects(reservaService.cancelarReserva(r.idReserva),/cancelada/);
 for(const canal of ['Airbnb','Booking']){const ext=guardar({...datos(),canal});await assert.rejects(reservaService.cancelarReserva(ext.idReserva),/no pueden cancelarse directamente/);}
 assert.equal(eventos.filter(e=>e.tipo==='RESERVA_CANCELADA').length,1);
});
test('GET de limpiezas solo consulta; el comando explícito conserva horizonte/zona existentes',async()=>{
 await limpiezaService.obtenerLimpiezas();assert.deepEqual(calls.map(c=>c.nombre),['obtenerTodas']);
 await limpiezaService.sincronizarLimpiezas();
 const [desde,hasta]=calls[1].args;assert.equal((Date.parse(hasta)-Date.parse(desde))/86400000,365);assert.equal(limpiezaService.zonaHoraria,'America/Argentina/Buenos_Aires');
});
test('tarea cancelada automáticamente, estado desconocido e ID inválido no se actualizan',async()=>{
 estadoLimpieza='Cancelada';await assert.rejects(limpiezaService.cambiarEstado(1,'Completada'),/cancelada automáticamente/);
 await assert.rejects(limpiezaService.cambiarEstado(1,'Cancelada'));await assert.rejects(limpiezaService.cambiarEstado(-1,'Pendiente'));
 assert.equal(calls.some(c=>c.nombre==='cambiarEstado'),false);
});
test('alertas persistidas solo leen; sincronización resuelve únicamente condiciones terminadas',async()=>{
 await alertaService.obtenerAlertasPersistidas();assert.deepEqual(calls.map(c=>c.nombre),['obtenerTodas']);
 alertas.set('vigente',{idAlerta:1,claveAlerta:'vigente',estado:'Nueva'});alertas.set('terminada',{idAlerta:2,claveAlerta:'terminada',estado:'Nueva'});
 alertaService.construirAlertasOperativas=async()=>[{claveAlerta:'vigente',estado:'Nueva'}];
 const resultado=await alertaService.sincronizarAlertasOperativas();assert.equal(resultado.resueltasAutomaticamente,1);assert.equal(alertas.get('terminada').estado,'Resuelta');
 assert.equal(alertas.get('vigente').estado,'Nueva');
});
for(const canal of ['Booking','Airbnb']) {
 test(`${canal}: fecha inválida no crea reserva ni confirma el evento entrante`,async()=>{
   const ev=channels[canal].simularNuevaReserva({...datos(),idExterno:'fecha-invalida-ficticia',fechaIngreso:'no-es-fecha'});
   await assert.rejects(reservaService[`procesarEvento${canal}`](ev.idEvento),/fechas inválido/);
   assert.equal(reservas.size,0);assert.equal(ev.estado,'Pendiente');assert.equal(eventos.length,0);
 });
 test(`${canal}: alta, ID externo duplicado, reproceso, modificación y cancelación sin duplicar reserva`,async()=>{
   const cola=channels[canal],procesar=id=>reservaService[`procesarEvento${canal}`](id),payload={...datos(),idExterno:`${canal}-ficticio`,nombreHuesped:'Persona',apellidoHuesped:'Ficticia'};
   const evento=cola.simularNuevaReserva(payload),primera=await procesar(evento.idEvento);assert.equal(primera.reserva.canal,canal);assert.equal(reservas.size,1);
   assert.equal((await procesar(evento.idEvento)).reprocesado,true);
   assert.equal((await procesar(cola.simularNuevaReserva(payload).idEvento)).duplicada,true);assert.equal(reservas.size,1);
   await procesar(cola.simularModificacionReserva({...payload,horaIngreso:'18:30'}).idEvento);assert.equal(reservas.get(1).horaIngreso,'18:30');
   await procesar(cola.simularCancelacionReserva(payload).idEvento);assert.equal(reservas.get(1).estado,'Cancelada');assert.equal(reservas.size,1);
   assert.equal(eventos.filter(e=>e.tipo==='RESERVA_RECIBIDA').length,1);assert.equal(eventos.filter(e=>e.tipo==='RESERVA_MODIFICADA').length,1);assert.equal(eventos.filter(e=>e.tipo==='RESERVA_CANCELADA').length,1);
 });
 test(`${canal}: conflicto externo confirmado conserva la reserva y registra advertencia`,async()=>{
   conflicto=true;const ev=channels[canal].simularNuevaReserva({...datos(),idExterno:'conflicto-ficticio'});
   const resultado=await reservaService[`procesarEvento${canal}`](ev.idEvento);assert.equal(resultado.conflictoDetectado,true);assert.equal(reservas.size,1);
   assert.equal(eventos.filter(e=>e.tipo==='CONFLICTO_DETECTADO').length,1);assert.equal(ev.estado,'Procesado');
 });
}
