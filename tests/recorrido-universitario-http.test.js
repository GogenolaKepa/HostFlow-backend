const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {crearApiUniversitaria}=require('./helpers/operacionUniversitariaAislada');let api;
before(async()=>{api=await crearApiUniversitaria();});after(async()=>api?.cerrar());
const mover=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
test('HTTP real aislado: propiedad → huésped → reserva → calendario → edición → historial → cancelación',async()=>{
 const crearProp=await api.pedir('/propiedades','POST',{nombre:'Alojamiento universitario ficticio',tipo:'Departamento',direccion:'Ficticia 100',ciudad:'Ficticia',provincia:'Ficticia',capacidadMaxima:2,precioBase:10,estado:'Activa'});assert.equal(crearProp.status,201);const p=crearProp.data.propiedad;
 assert.ok(p,JSON.stringify({propiedades:[...api.h.propiedades.keys()],consultas:api.h.consultas.map(q=>({args:q.args,insert:q.texto.includes('INSERT INTO dbo.Propiedades')}))}));
 const crearGuest=await api.pedir('/huespedes','POST',{nombre:'Persona',apellido:'Universitaria',email:'recorrido@example.invalid'});assert.equal(crearGuest.status,201);const g=crearGuest.data.huesped;
 const d=api.h.hoy,egreso=mover(d,2),body={idPropiedad:p.idPropiedad,idHuesped:g.idHuesped,fechaIngreso:d,horaIngreso:'15:00',fechaEgreso:egreso,horaEgreso:'10:00',cantidadHuespedes:1,montoEstimado:0};
 const crear=await api.pedir('/reservas','POST',body);assert.equal(crear.status,201);const id=crear.data.reserva.idReserva;assert.equal(crear.data.reserva.huesped,'Persona Universitaria');
 const ruta=`/calendario?anio=${d.slice(0,4)}&mes=${Number(d.slice(5,7))}&idPropiedad=${p.idPropiedad}`;
 const calendario=await api.pedir(ruta);assert.equal(calendario.status,200);assert.equal(calendario.data.resumen.cantidadReservas,1);const dia=calendario.data.propiedades[0].dias.find(x=>x.fecha===d);assert.equal(dia.reservas[0].idReserva,id);
 const guest=await api.pedir(`/huespedes/${g.idHuesped}`);assert.equal(guest.status,200);assert.equal(guest.data.huesped.historialReservas[0].idReserva,id);
 const renombrar=await api.pedir(`/huespedes/${g.idHuesped}`,'PUT',{nombre:'Persona revisada'});assert.equal(renombrar.status,200);
 const detalle=await api.pedir(`/reservas/${id}`);assert.equal(detalle.data.reserva.huesped,'Persona revisada Universitaria');
 const editar=await api.pedir(`/reservas/${id}`,'PUT',{fechaEgreso:mover(d,3)});assert.equal(editar.status,200);assert.equal(editar.data.reserva.fechaEgreso,mover(d,3));
 const eventos=await api.pedir(`/reservas/${id}/eventos`);assert.equal(eventos.status,200);assert.deepEqual(eventos.data.eventos.map(e=>e.tipo),['RESERVA_CREADA','RESERVA_MODIFICADA']);
 const cancelar=await api.pedir(`/reservas/${id}/cancelar`,'PATCH',{});assert.equal(cancelar.status,200);
 const nuevamente=await api.pedir(ruta);assert.equal(nuevamente.status,200);assert.equal(nuevamente.data.propiedades[0].dias.find(x=>x.fecha===d).estado,'Disponible');
 const final=await api.pedir(`/reservas/${id}/eventos`);assert.deepEqual(final.data.eventos.map(e=>e.tipo),['RESERVA_CREADA','RESERVA_MODIFICADA','RESERVA_CANCELADA']);
 assert.equal((await api.pedir(`/reservas/${id}/cancelar`,'PATCH',{})).status,400);assert.equal(api.h.filas.size,1);assert.equal(api.h.eventos.length,3);
 const reporte=await api.pedir(`/dashboard/reportes?periodo=personalizado&fechaDesde=${d}&fechaHasta=${mover(d,10)}&idPropiedad=${p.idPropiedad}&canal=Manual`);assert.equal(reporte.status,200);assert.equal(reporte.data.reportes.resumen.totalReservasPeriodo,1);assert.equal(reporte.data.reportes.resumen.totalReservasOperativas,0);assert.deepEqual(reporte.data.reportes.porEstado,[{estado:'Cancelada',cantidad:1,porcentaje:100}]);
});
test('HTTP entre módulos: Booking simulado confirmado conserva conflicto, calendario, historial, reporte y ACK sin duplicar',async()=>{
 const d=mover(api.h.hoy,21),egreso=mover(d,2),base={idPropiedad:7,fechaIngreso:d,fechaEgreso:egreso,horaIngreso:'15:00',horaEgreso:'10:00',cantidadHuespedes:1,montoEstimado:10};
 assert.equal((await api.pedir('/reservas','POST',{...base,idHuesped:8})).status,201);
 const simulacion=await api.pedir('/integraciones/booking/simulacion/nueva-reserva','POST',{...base,idExterno:'recorrido-booking-ficticio',nombreHuesped:'Canal',apellidoHuesped:'Universitario',montoEstimado:25});assert.equal(simulacion.status,201);
 const evento=simulacion.data.evento.idEvento,ruta=`/integraciones/booking/eventos/${evento}/procesar`;
 const recepcion=await api.pedir(ruta,'POST',{});assert.equal(recepcion.status,200,JSON.stringify(recepcion.data));const reserva=recepcion.data.reserva;assert.equal(reserva.canal,'Booking');assert.equal(reserva.estado,'Confirmada');assert.equal(reserva.huesped,'Canal Universitario');
 const historia=await api.pedir(`/reservas/${reserva.idReserva}/eventos`);assert.deepEqual(historia.data.eventos.map(e=>e.tipo),['RESERVA_RECIBIDA','CONFLICTO_DETECTADO']);
 const cal=await api.pedir(`/calendario?anio=${d.slice(0,4)}&mes=${Number(d.slice(5,7))}&idPropiedad=7`);assert.equal(cal.status,200);assert.equal(cal.data.propiedades[0].dias.find(x=>x.fecha===d).estado,'Conflicto');
 const reporte=await api.pedir(`/dashboard/reportes?periodo=personalizado&fechaDesde=${d}&fechaHasta=${egreso}&idPropiedad=7&canal=Booking`);assert.equal(reporte.data.reportes.resumen.totalReservasPeriodo,1);assert.deepEqual(reporte.data.reportes.porCanal,[{canal:'Booking',cantidad:1,porcentaje:100}]);
 const antes={reservas:api.h.filas.size,eventos:api.h.eventos.length};assert.equal((await api.pedir(ruta,'POST',{})).status,200);assert.deepEqual({reservas:api.h.filas.size,eventos:api.h.eventos.length},antes);
 const op=await api.pedir(ruta,'POST',{},'Operador');assert.equal(op.status,403);
});
test('Dashboard después de las operaciones: mismos huéspedes y reservas vigentes; GET no reconcilia ni escribe',async()=>{
 const antes=api.h.consultas.length,r=await api.pedir('/dashboard/resumen');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.resumen.huespedesRegistrados,3);assert.equal(r.data.resumen.reservasActivas,2);
 const op=await api.pedir('/dashboard/resumen','GET',undefined,'Operador');assert.equal(op.status,200);assert.equal(Object.hasOwn(op.data.resumen,'ingresosMes'),false);
 for(const q of api.h.consultas.slice(antes)){const codigo=q.texto.replace(/'(?:[^']|'')*'|\/\*[\s\S]*?\*\/|--[^\r\n]*/g,' ');assert.doesNotMatch(codigo,/\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC)\b/i);}
});
