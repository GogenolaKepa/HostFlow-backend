const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const {prepararMonedasIntegradas}=require('./helpers/monedasIntegradasAisladas');
const h=prepararMonedasIntegradas();
const claves=['HOSTFLOW_MONEDAS_SQL_ENABLED','HOSTFLOW_MONEDAS_WRITE_ENABLED','HOSTFLOW_MONEDAS_RESERVAS_ENABLED','HOSTFLOW_AUTH_SOURCE','HOSTFLOW_CONFIGURACION_ENABLED','HOSTFLOW_EMPRESA_ID','HOSTFLOW_CONFIGURACION_READ_ONLY'];
const anterior=Object.fromEntries(claves.map(k=>[k,process.env[k]]));
Object.assign(process.env,{HOSTFLOW_MONEDAS_SQL_ENABLED:'1',HOSTFLOW_MONEDAS_WRITE_ENABLED:'1',HOSTFLOW_MONEDAS_RESERVAS_ENABLED:'1',HOSTFLOW_AUTH_SOURCE:'sql',HOSTFLOW_CONFIGURACION_ENABLED:'1',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_CONFIGURACION_READ_ONLY:'0'});
const reservas=require('../src/services/ReservaService'),monetario=require('../src/services/AcuerdoMonetarioService');
const fechaAnterior=reservas.obtenerFechaActualArgentina,relojAnterior=monetario.reloj,cotizacionesAnteriores=monetario.cotizaciones;
reservas.obtenerFechaActualArgentina=()=> '2100-01-01';monetario.reloj=()=>new Date('2100-01-10T15:00:00Z');
const actor={idUsuario:999,versionSesion:1,rol:'Administrador'},acuerdo=(c={})=>({moneda:'USD',importe:'100.25',pagoEquivalenteARS:true,fuenteReferencia:'BCRA',confirmar:true,...c});
const crear=(c={})=>reservas.crearReserva({idPropiedad:7,idHuesped:8,fechaIngreso:'2100-01-10',horaIngreso:'15:00',fechaEgreso:'2100-01-12',horaEgreso:'10:00',cantidadHuespedes:1,montoEstimado:125.5,acuerdoMonetario:acuerdo(),...c},actor);
const fijar=p=>monetario.fijar(p.idReserva,actor,{revision:p.acuerdoMonetario.versionRegistro,confirmar:true,cotizacionId:'oficial-ficticia'});
beforeEach(()=>{h.reset();monetario.cotizaciones=()=>({vigente:id=>{assert.equal(id,'oficial-ficticia');return {fuente:'BCRA',tipo:'BCRA_TIPO_COTIZACION',valor:'1250.12345678',fecha:'2100-01-10'};}});});
after(()=>{reservas.obtenerFechaActualArgentina=fechaAnterior;monetario.reloj=relojAnterior;monetario.cotizaciones=cotizacionesAnteriores;for(const [k,v]of Object.entries(anterior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});

for(const falloEvento of [false,true])test(`W3: acuerdo USD sin conversión e historial previo intactos; falloEvento=${falloEvento}`,async()=>{
 const secretoPrevio=process.env.JWT_SECRET;
 process.env.JWT_SECRET=require('node:crypto').randomBytes(32).toString('hex');
 const {versionReserva}=require('../src/security/versionReserva');
 try {
  const p=await crear({montoEstimado:200,acuerdoMonetario:{moneda:'USD',importe:'200.00',pagoEquivalenteARS:false,confirmar:true}});
  const editada=await reservas.modificarReserva(p.idReserva,{fechaEgreso:'2100-01-13'});
  const acuerdoAntes=structuredClone(h.acuerdos.get(p.idReserva)),eventosAntes=structuredClone(h.eventos),filaAntes=structuredClone(h.filas.get(p.idReserva));
  const version=versionReserva(editada);assert.match(version,/^[a-f0-9]{64}$/);
  process.env.HOSTFLOW_MONEDAS_WRITE_ENABLED='0';process.env.HOSTFLOW_CONFIGURACION_READ_ONLY='1';
  const desde=h.consultas.length;
  if(falloEvento){
   h.fallos.evento=Error('Fallo de historial ficticio W3');
   await assert.rejects(reservas.cancelarReserva(p.idReserva,version));
   assert.deepEqual(h.filas.get(p.idReserva),filaAntes);assert.deepEqual(h.eventos,eventosAntes);
  } else {
   const cancelada=await reservas.cancelarReserva(p.idReserva,version);
   assert.equal(cancelada.estado,'Cancelada');assert.equal(cancelada.acuerdoMonetario.importe,'200.00');
   assert.equal(cancelada.acuerdoMonetario.estadoFijacion,'NO_REQUIERE');
   assert.equal(h.filas.size,1);assert.ok(h.filas.has(p.idReserva),'Sin eliminación física');
   assert.deepEqual(h.eventos.slice(0,eventosAntes.length),eventosAntes);
   assert.equal(h.eventos.length,eventosAntes.length+1);assert.equal(h.eventos.at(-1).tipo,'RESERVA_CANCELADA');
   await assert.rejects(reservas.cancelarReserva(p.idReserva,version),e=>e.codigo==='RESERVA_CONFLICTO_CONCURRENCIA');
   await assert.rejects(reservas.cancelarReserva(p.idReserva,versionReserva(cancelada)),/ya se encuentra cancelada/);
   assert.equal(h.eventos.length,eventosAntes.length+1);
  }
  assert.deepEqual(structuredClone(h.acuerdos.get(p.idReserva)),acuerdoAntes,'Incluye revisión, autores, fechas y snapshot sin cambios');
  assert.ok(h.consultas.slice(desde).every(q=>!/\bDELETE\s+FROM\b|\b(?:UPDATE|INSERT\s+INTO)\s+dbo\.AcuerdosMonetariosReserva\b/i.test(q.texto)));
  assert.equal(h.poolRequests,0);assert.ok(h.consultas.every(q=>q.tx!==null));
 } finally {
  process.env.HOSTFLOW_MONEDAS_WRITE_ENABLED='1';process.env.HOSTFLOW_CONFIGURACION_READ_ONLY='0';
  if(secretoPrevio===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secretoPrevio;
 }
});

test('Nueva reserva: acuerdo, reserva e historial obligatorios en una transacción, estimado separado del pactado',async()=>{
 const p=await crear();assert.equal(p.montoEstimado,125.5);assert.equal(p.acuerdoMonetario.importe,'100.25');assert.equal(p.acuerdoMonetario.moneda,'USD');assert.equal(p.acuerdoMonetario.monedaPago,'ARS');assert.equal(p.acuerdoMonetario.estadoFijacion,'PENDIENTE');
 assert.equal(h.filas.size,1);assert.equal(h.acuerdos.size,1);assert.equal(h.eventos.length,1);assert.equal(JSON.parse(h.eventos[0].datosJson).acuerdoMonetario.importe,'100.25');
 assert.equal(h.inicios,1);assert.equal(h.commits,1);h.verificarUnaConexion();
 assert.deepEqual(h.consultas.filter(q=>q.args.recurso).map(q=>q.args.recurso),['HostFlow:Operaciones:FinalizacionReservas','HostFlow:Seguridad:AdministradoresActivos']);
});
test('Nueva reserva: acuerdo obligatorio con activación; esquema apagado no consume SQL y legacy conserva contrato anterior',async()=>{
 await assert.rejects(crear({acuerdoMonetario:undefined}));assert.equal(h.inicios,0);
 process.env.HOSTFLOW_MONEDAS_RESERVAS_ENABLED='0';try{
  await assert.rejects(crear(),e=>e.codigo==='MONEDAS_PENDIENTES');assert.equal(h.inicios,0);
  const p=await crear({acuerdoMonetario:undefined});assert.equal(p.acuerdoMonetario,undefined);assert.equal(h.acuerdos.size,0);assert.equal(h.eventos.length,1);
 }finally{process.env.HOSTFLOW_MONEDAS_RESERVAS_ENABLED='1';}
});
for(const fallo of ['acuerdoInsert','acuerdoLectura','evento','lecturaFinal','modelo','actor'])test(`Acuerdo nuevo: fallo ${fallo} revierte reserva/acuerdo/historial`,async()=>{
 h.fallos[fallo]=Object.assign(Error('Fallo ficticio'),{code:'EREQUEST'});await assert.rejects(crear());assert.equal(h.filas.size,0);assert.equal(h.acuerdos.size,0);assert.equal(h.eventos.length,0);assert.equal(h.commits,0);assert.equal(h.rollbacks,1);assert.equal(h.poolRequests,0);
});
test('Autor y empresa del servidor: sesión revocada/rol sin permiso no pueden confirmar; payload no admite identidad',async()=>{
 h.actor.versionSesion=2;await assert.rejects(crear(),e=>e.status===401);assert.equal(h.acuerdos.size,0);
 h.reset();await assert.rejects(crear({acuerdoMonetario:{...acuerdo(),idEmpresa:2}}),e=>e.status===400);assert.equal(h.inicios,0);
 h.actor.rol='Operador';const p=await crear();assert.equal(p.acuerdoMonetario.idAutor,999,'Operador mantiene su permiso existente de alta, sin poder fijar.');
 await assert.rejects(fijar(p),e=>e.status===403);assert.equal(h.acuerdos.get(p.idReserva).fijadoEn,null);
});
test('Fijación explícita: snapshot exacto y único, evento obligatorio, nunca modifica importe/estado de la reserva',async()=>{
 const p=await crear(),antes=structuredClone(h.filas.get(p.idReserva));const a=await fijar(p);
 assert.equal(a.estadoFijacion,'FIJADA');assert.equal(a.importe,'100.25');assert.equal(a.valorAplicado,'1250.12345678');assert.equal(a.equivalenteARS,'125324.88');assert.equal(a.idUsuarioFijacion,999);
 assert.deepEqual(h.filas.get(p.idReserva),antes);assert.equal(h.eventos.length,2);assert.equal(JSON.parse(h.eventos[1].datosJson).motivoMonetario,'COTIZACION_CHECKIN_FIJADA');
 await assert.rejects(fijar(p),e=>e.status===409);assert.equal(h.eventos.length,2);assert.equal(h.commits,2);
});
test('Dos fijaciones concurrentes: una confirma y la otra relee snapshot, sin duplicar evento',async()=>{
 const p=await crear();const r=await Promise.allSettled([fijar(p),fijar(p)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);assert.equal(h.eventos.length,2);
});
test('Fin de semana/ausencia del día: última oficial requiere aceptación; no se fija antes ni con tasa futura',async()=>{
 const p=await crear();monetario.cotizaciones=()=>({vigente:()=>({fuente:'BCRA',tipo:'BCRA_TIPO_COTIZACION',valor:'1000',fecha:'2100-01-09'})});
 await assert.rejects(fijar(p),/última oficial/);assert.equal(h.eventos.length,1);
 const a=await monetario.fijar(p.idReserva,actor,{revision:p.acuerdoMonetario.versionRegistro,confirmar:true,cotizacionId:'ficticia',aceptarUltimaOficial:true});assert.equal(a.fechaEfectiva,'2100-01-09');
 h.reset();const futura=await crear({fechaIngreso:'2100-01-11'});await assert.rejects(fijar(futura),/check-in/);
 monetario.cotizaciones=()=>({vigente:()=>({fuente:'BCRA',tipo:'BCRA_TIPO_COTIZACION',valor:'1000',fecha:'2100-01-12'})});await assert.rejects(fijar(futura));
});
test('Fuente manual: tasa solo desde configuración guardada del día y confirmación de advertencia',async()=>{
 const p=await crear({acuerdoMonetario:acuerdo({fuenteReferencia:'MANUAL'})});
 h.configuracion={fuente:'MANUAL',tipo:'MANUAL',valor:'1000.00000000',fecha:'2100-01-10',versionRegistro:Buffer.alloc(8,1)};
 await assert.rejects(monetario.fijar(p.idReserva,actor,{revision:p.acuerdoMonetario.versionRegistro,confirmar:true}),e=>e.status===400);
 const a=await monetario.fijar(p.idReserva,actor,{revision:p.acuerdoMonetario.versionRegistro,confirmar:true,confirmarManual:true});assert.equal(a.equivalenteARS,'100250.00');assert.equal(a.fuenteAplicada,'MANUAL');
});
for(const fallo of ['fijacion','evento','acuerdoLectura'])test(`Fijación: fallo ${fallo} conserva acuerdo pendiente y revierte historial nuevo`,async()=>{
 const p=await crear();h.fallos[fallo]=Error('Fallo ficticio');await assert.rejects(fijar(p));assert.equal(h.acuerdos.get(p.idReserva).fijadoEn,null);assert.equal(h.eventos.length,1);assert.equal(h.commits,1);
});
test('Rollback fallido y commit aplicado sin acuse comunican incertidumbre sin duplicación automática',async()=>{
 h.fallos.acuerdoInsert=Error('Fallo ficticio');h.fallos.rollback=Error('Rollback ficticio fallido');await assert.rejects(crear(),e=>e.codigo==='OPERACION_RESULTADO_INCIERTO');
 h.reset();const p=await crear();h.acusePerdido=true;await assert.rejects(fijar(p),e=>e.codigo==='OPERACION_RESULTADO_INCIERTO');assert.ok(h.acuerdos.get(p.idReserva).fijadoEn);assert.equal(h.eventos.length,2);
 h.acusePerdido=false;await assert.rejects(fijar(p),e=>e.status===409);assert.equal(h.eventos.length,2);
});
test('Edición del acuerdo antes de fijar usa CAS; un formulario antiguo o snapshot fijado se rechaza',async()=>{
 const p=await crear();const a=await monetario.guardar(p.idReserva,actor,{revision:p.acuerdoMonetario.versionRegistro,acuerdo:acuerdo({importe:'200.01'})});
 assert.equal(a.importe,'200.01');assert.equal(a.idAutor,999);await assert.rejects(monetario.guardar(p.idReserva,actor,{revision:p.acuerdoMonetario.versionRegistro,acuerdo:acuerdo()}),e=>e.status===409);
 const f=await monetario.fijar(p.idReserva,actor,{revision:a.versionRegistro,confirmar:true,cotizacionId:'oficial-ficticia'});
 await assert.rejects(monetario.guardar(p.idReserva,actor,{revision:f.versionRegistro,acuerdo:acuerdo()}),e=>e.status===409);assert.equal(h.acuerdos.get(p.idReserva).importe,'200.01');
});
test('Edición de estadía conserva acuerdo; check-in fijado no se cambia; egreso y cancelación mantienen snapshot',async()=>{
 const p=await crear();const editada=await reservas.modificarReserva(p.idReserva,{fechaEgreso:'2100-01-13'});assert.equal(editada.acuerdoMonetario.importe,'100.25');
 const a=await fijar(editada);await assert.rejects(reservas.modificarReserva(p.idReserva,{fechaIngreso:'2100-01-11'}),e=>e.status===409);
 const cancelada=await reservas.cancelarReserva(p.idReserva);assert.equal(cancelada.estado,'Cancelada');assert.equal(cancelada.acuerdoMonetario.estadoFijacion,'FIJADA');assert.equal(cancelada.acuerdoMonetario.versionRegistro,a.versionRegistro);
 await assert.rejects(fijar(p),e=>e.status===409);assert.equal(h.filas.get(p.idReserva).estado,'Cancelada');
});
test('Cancelar primero impide fijación; fijar primero permite cancelación sin borrar el acuerdo',async()=>{
 const p=await crear();const r=await Promise.allSettled([reservas.cancelarReserva(p.idReserva),fijar(p)]);assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,'rejected');assert.equal(h.acuerdos.get(p.idReserva).fijadoEn,null);
});
test('Fijación y edición de check-in concurrentes coordinan ambos órdenes sin reinterpretar el contrato',{timeout:3000},async()=>{
 for(const fijarPrimero of [true,false]){
  h.reset();const p=await crear();
  let entrar,continuar;const entro=new Promise(r=>{entrar=r;}),seguir=new Promise(r=>{continuar=r;});
  h.hooks.evento=async(_tx,args)=>{if(args.tipo==='RESERVA_MODIFICADA'){entrar();await seguir;}};
  const primera=fijarPrimero?fijar(p):reservas.modificarReserva(p.idReserva,{fechaIngreso:'2100-01-11'});await entro;
  const segunda=fijarPrimero?reservas.modificarReserva(p.idReserva,{fechaIngreso:'2100-01-11'}):fijar(p);continuar();
  const r=await Promise.allSettled([primera,segunda]);assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,'rejected');
  assert.equal(h.filas.get(p.idReserva).fechaIngreso,fijarPrimero?'2100-01-10':'2100-01-11');assert.equal(Boolean(h.acuerdos.get(p.idReserva).fijadoEn),fijarPrimero);assert.equal(h.eventos.length,2);
 }
});
test('Finalización y fijación coordinan ambos órdenes; finalizar conserva un snapshot ya fijado',{timeout:3000},async()=>{
 const repo=require('../src/repositories/ReservaRepository');
 for(const fijarPrimero of [true,false]){
  h.reset();const p=await crear();
  let entrar,continuar;const entro=new Promise(r=>{entrar=r;}),seguir=new Promise(r=>{continuar=r;});
  h.hooks.evento=async(_tx,args)=>{if(args.tipo===(fijarPrimero?'RESERVA_MODIFICADA':'RESERVA_FINALIZADA')){entrar();await seguir;}};
  const primera=fijarPrimero?fijar(p):repo.finalizarConEventos('2100-01-20');await entro;
  const segunda=fijarPrimero?repo.finalizarConEventos('2100-01-20'):fijar(p);continuar();
  const r=await Promise.allSettled([primera,segunda]);assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,fijarPrimero?'fulfilled':'rejected');
  assert.equal(h.filas.get(p.idReserva).estado,'Finalizada');assert.equal(Boolean(h.acuerdos.get(p.idReserva).fijadoEn),fijarPrimero);assert.equal(h.eventos.filter(e=>e.tipo==='RESERVA_FINALIZADA').length,1);
 }
});
test('Timeout del bloqueo, cero filas por CAS y lectura posterior perdida no confirman una fijación parcial',async()=>{
 const p=await crear();h.resultadoLock=-1;await assert.rejects(fijar(p));assert.equal(h.eventos.length,1);assert.equal(h.commits,1);h.resultadoLock=0;
 h.hooks.fijacion=async(tx)=>{const a=h.acuerdos.get(p.idReserva);tx.acuerdos.set(p.idReserva,{...a,versionRegistro:Buffer.alloc(8,9)});};
 await assert.rejects(fijar(p),e=>e.codigo==='ACUERDO_CONFLICTO');assert.equal(h.acuerdos.get(p.idReserva).fijadoEn,null);assert.equal(h.eventos.length,1);delete h.hooks.fijacion;
 let lecturas=0;h.hooks.acuerdoLectura=async()=>{if(++lecturas===2)throw Error('Lectura final ficticia perdida');};
 await assert.rejects(fijar(p));assert.equal(h.acuerdos.get(p.idReserva).fijadoEn,null);assert.equal(h.eventos.length,1);assert.equal(h.commits,1);
});
test('Canales/legacy no se reinterpretan; acuerdos sin conversión ARS/USD y estados cerrados conservan límites',async()=>{
 const p=await crear({acuerdoMonetario:{moneda:'ARS',importe:'1234.50',pagoEquivalenteARS:false,confirmar:true}});assert.equal(p.acuerdoMonetario.estadoFijacion,'NO_REQUIERE');await assert.rejects(fijar(p));
 const externa=h.sembrar({canal:'Booking'});await assert.rejects(monetario.guardar(externa.idReserva,actor,{revision:null,acuerdo:acuerdo()}),e=>e.codigo==='ACUERDO_CANAL');
 const legacy=h.sembrar({fechaIngreso:'2100-02-01',fechaEgreso:'2100-02-03'});assert.equal(await monetario.leer(legacy,{conexion:h.nuevaConexion()}),null);
});
