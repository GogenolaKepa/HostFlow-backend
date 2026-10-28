// HTTP/servicios/repositorios reales; identidad y motor estrictamente ficticios.
const {test,before,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto'),jwt=require('jsonwebtoken');
const {prepararMonedasIntegradas}=require('./helpers/monedasIntegradasAisladas');
const h=prepararMonedasIntegradas();
const claves=['HOSTFLOW_MONEDAS_SQL_ENABLED','HOSTFLOW_MONEDAS_WRITE_ENABLED','HOSTFLOW_MONEDAS_RESERVAS_ENABLED','HOSTFLOW_AUTH_SOURCE','HOSTFLOW_CONFIGURACION_ENABLED','HOSTFLOW_EMPRESA_ID','HOSTFLOW_CONFIGURACION_READ_ONLY','JWT_SECRET'];
const anterior=Object.fromEntries(claves.map(k=>[k,process.env[k]]));Object.assign(process.env,{HOSTFLOW_MONEDAS_SQL_ENABLED:'1',HOSTFLOW_MONEDAS_WRITE_ENABLED:'1',HOSTFLOW_MONEDAS_RESERVAS_ENABLED:'1',HOSTFLOW_AUTH_SOURCE:'sql',HOSTFLOW_CONFIGURACION_ENABLED:'1',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_CONFIGURACION_READ_ONLY:'0',JWT_SECRET:randomBytes(32).toString('hex')});
const auth=require('../src/services/AuthService'),authAnterior=auth.obtenerUsuarioSesion;
auth.obtenerUsuarioSesion=async(id,payload)=>{const u=h.actores.get(id);if(!u||payload.versionSesion!==u.versionSesion)throw Object.assign(Error('Sesion ficticia inválida'),{status:401,codigo:'SESION_INVALIDA'});return {...u,email:`monetaria-${id}@example.invalid`,nombre:'Cuenta ficticia'};};
const monedas=require('../src/services/MonedasService'),{MonedasRepository}=require('../src/repositories/MonedasRepository'),repoAnterior=monedas.repository;
monedas.repository=new MonedasRepository({getPool:async()=>h.pool,driver:h.driver});
const monetario=require('../src/services/AcuerdoMonetarioService'),relojAnterior=monetario.reloj;monetario.reloj=()=>new Date('2100-01-10T15:00:00Z');
const reservaService=require('../src/services/ReservaService'),fechaAnterior=reservaService.obtenerFechaActualArgentina;reservaService.obtenerFechaActualArgentina=()=> '2100-01-01';
const poolAnterior=h.pool.request;
h.pool.request=()=>{h.poolRequests++;const tx={id:'GET-SIN-TRANSACCION',ocupada:false,cambios:new Map(),eventos:[],creadas:new Set(),editadas:new Set(),lecturas:new Map()};const req=h.requestPara(tx),query=req.query;req.query=texto=>{assert.doesNotMatch(texto,/\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC)\b/i,'Los GET no pueden modificar ni iniciar comandos');return query(texto);};return req;};
const app=require('../src/app');let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;});
beforeEach(()=>{h.reset();h.actores=new Map([[999,{...h.actor}],[998,{...h.actor,idUsuario:998,rol:'Operador'}]]);h.configuracion={fuente:'MANUAL',tipo:'MANUAL',valor:'1000.00000000',fecha:'2100-01-10',versionRegistro:Buffer.alloc(8,1)};});
after(async()=>{await new Promise(r=>server.close(r));h.pool.request=poolAnterior;auth.obtenerUsuarioSesion=authAnterior;monedas.repository=repoAnterior;monetario.reloj=relojAnterior;reservaService.obtenerFechaActualArgentina=fechaAnterior;for(const [k,v]of Object.entries(anterior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const cabeceras=(id=999)=>({'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({idUsuario:id,email:`monetaria-${id}@example.invalid`,origen:'sql',versionSesion:1},process.env.JWT_SECRET,{expiresIn:'5m'})}`});
async function pedir(ruta,method='GET',body,id=999){const res=await fetch(base+ruta,{method,headers:cabeceras(id),...(body!==undefined?{body:JSON.stringify(body)}:{})});return {res,data:method==='HEAD'?null:await res.json()};}
const bodyReserva=(idPropiedad=7)=>({idPropiedad,idHuesped:8,fechaIngreso:'2100-01-10',horaIngreso:'15:00',fechaEgreso:'2100-01-12',horaEgreso:'10:00',cantidadHuespedes:1,montoEstimado:0,acuerdoMonetario:{moneda:'USD',importe:'100.25',pagoEquivalenteARS:true,fuenteReferencia:'MANUAL',confirmar:true}});

test('HTTP integrado: propiedad/tarifa, reserva/acuerdo, revisión, fijación, edición, lectura y cancelación preservan historial',async()=>{
 const p=await pedir('/monedas/propiedades','POST',{propiedad:{nombre:'Integracion ficticia',tipo:'Departamento',direccion:'Ficticia 1',ciudad:'Ficticia',provincia:'Ficticia',capacidadMaxima:2},moneda:'USD',precio:'99.99',confirmar:true});assert.equal(p.res.status,201);assert.equal(h.poolRequests,0);
 const alta=await pedir('/reservas','POST',bodyReserva(p.data.propiedad.idPropiedad));assert.equal(alta.res.status,201,JSON.stringify(alta.data));assert.equal(h.poolRequests,0);const r=alta.data.reserva;
 const acuerdo=await pedir(`/monedas/reservas/${r.idReserva}/acuerdo`,'PUT',{revision:r.acuerdoMonetario.versionRegistro,acuerdo:{...bodyReserva().acuerdoMonetario,importe:'200.50'}});assert.equal(acuerdo.res.status,200);assert.equal(h.poolRequests,0);
 const fija=await pedir(`/monedas/reservas/${r.idReserva}/fijacion`,'POST',{revision:acuerdo.data.acuerdo.versionRegistro,confirmar:true,confirmarManual:true});assert.equal(fija.res.status,200);assert.equal(fija.data.acuerdo.equivalenteARS,'200500.00');assert.equal(h.poolRequests,0);
 const edicion=await pedir(`/reservas/${r.idReserva}`,'PUT',{fechaEgreso:'2100-01-13',versionEdicion:r.versionEdicion});assert.equal(edicion.res.status,200);assert.equal(edicion.data.reserva.acuerdoMonetario.versionRegistro,fija.data.acuerdo.versionRegistro);
 const lectura=await pedir(`/reservas/${r.idReserva}`);assert.equal(lectura.res.status,200);assert.equal(lectura.data.reserva.montoEstimado,0);assert.equal(lectura.data.reserva.acuerdoMonetario.importe,'200.50');
 const previas=h.consultas.length;await pedir(`/monedas/reservas/${r.idReserva}/acuerdo`,'HEAD');assert.equal(h.consultas.slice(previas).some(q=>/\b(?:INSERT|UPDATE|DELETE|EXEC)\b/i.test(q.texto)),false);
 const cancelada=await pedir(`/reservas/${r.idReserva}/cancelar`,'PATCH',{versionEdicion:lectura.data.reserva.versionEdicion});assert.equal(cancelada.res.status,200);assert.equal(cancelada.data.reserva.estado,'Cancelada');assert.equal(cancelada.data.reserva.acuerdoMonetario.equivalenteARS,'200500.00');
 assert.equal(h.eventos.length,5);assert.equal(h.eventos.filter(e=>e.tipo==='RESERVA_CREADA').length,1);assert.equal(h.eventos.filter(e=>e.tipo==='RESERVA_CANCELADA').length,1);
 const n=h.eventos.length;const repetida=await pedir(`/monedas/reservas/${r.idReserva}/fijacion`,'POST',{revision:fija.data.acuerdo.versionRegistro,confirmar:true,confirmarManual:true});assert.equal(repetida.res.status,409);assert.equal(h.eventos.length,n);
});
test('HTTP integrado: Operador conserva alta, pero no fija/consulta importes nuevos; 401/403/400 preceden a BEGIN',async()=>{
 const sinSesion=await fetch(base+'/monedas/reservas/7/acuerdo');assert.equal(sinSesion.status,401);await sinSesion.text();
 for(const [ruta,method,body]of [['/monedas/reservas/7/acuerdo','GET'],['/monedas/reservas/7/fijacion','POST',{}]])assert.equal((await pedir(ruta,method,body,998)).res.status,403);
 assert.equal((await pedir('/monedas/reservas/0/acuerdo')).res.status,400);assert.equal(h.inicios,0);
 const a=await pedir('/reservas','POST',bodyReserva(),998);assert.equal(a.res.status,201);assert.equal(a.data.reserva.acuerdoMonetario.moneda,'USD');assert.equal(a.data.reserva.acuerdoMonetario.importe,undefined);assert.equal(a.data.reserva.acuerdoMonetario.equivalenteARS,undefined);
 const listado=await pedir('/reservas','GET',undefined,998);assert.equal(listado.res.status,200);assert.equal(listado.data.reservas[0].acuerdoMonetario.importe,undefined);
 const historial=await pedir(`/reservas/${a.data.reserva.idReserva}/eventos`,'GET',undefined,998);assert.equal(historial.data.eventos[0].datosJson.acuerdoMonetario.importe,undefined);
});
test('HTTP integrado: commit aplicado sin acuse es 500 seguro, recarga acredita snapshot y no se duplica fijación',async()=>{
 const a=await pedir('/reservas','POST',bodyReserva());const id=a.data.reserva.idReserva,revision=a.data.reserva.acuerdoMonetario.versionRegistro;h.acusePerdido=true;
 const r=await pedir(`/monedas/reservas/${id}/fijacion`,'POST',{revision,confirmar:true,confirmarManual:true});assert.equal(r.res.status,500,JSON.stringify(r.data));assert.equal(r.data.codigo,'OPERACION_RESULTADO_INCIERTO');assert.match(r.data.mensaje,/Recargá/);assert.equal(r.res.headers.get('Retry-After'),null);assert.equal(Object.hasOwn(r.data,'acuerdo'),false);assert.equal(h.eventos.length,2);
 h.acusePerdido=false;const lectura=await pedir(`/monedas/reservas/${id}/acuerdo`);assert.equal(lectura.data.acuerdo.estadoFijacion,'FIJADA');assert.equal(h.eventos.length,2);
 const otra=await pedir(`/monedas/reservas/${id}/fijacion`,'POST',{revision,confirmar:true,confirmarManual:true});assert.equal(otra.res.status,409);assert.equal(h.eventos.length,2);assert.equal(h.commits,2);
});
