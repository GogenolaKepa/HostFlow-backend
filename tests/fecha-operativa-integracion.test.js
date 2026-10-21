const {test}=require('node:test'),assert=require('node:assert/strict');
const {crearApiUniversitaria}=require('./helpers/operacionUniversitariaAislada');
test('Día operativo: calendario, huésped y parámetros SQL coinciden con Buenos Aires aunque el servidor use UTC',async t=>{
 const tz=process.env.TZ;process.env.TZ='UTC';t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-01T01:30:00Z')});
 let api;try{
  api=await crearApiUniversitaria();const calendario=require('../src/services/CalendarioService');assert.equal(calendario.obtenerFechaHoy(),'2026-10-31');
  api.h.huespedes.set(101,{idHuesped:101,nombre:'Fecha',apellido:'Ficticia',email:null});api.h.filas.set(901,{idReserva:901,idPropiedad:7,idHuesped:101,fechaIngreso:'2026-10-31',fechaEgreso:'2026-11-01',estado:'Confirmada'});
  const g=await api.pedir('/huespedes/101');assert.equal(g.status,200);assert.equal(g.data.huesped.reservasActivas.length,1,'No adelanta el egreso al día UTC siguiente');
  await api.pedir('/huespedes');await api.pedir('/propiedades');await api.pedir('/propiedades/7');
  const lecturas=api.h.consultas.filter(q=>q.texto.includes('AS tieneReservaActiva')||q.texto.includes('AS situacion'));
  assert.ok(lecturas.length>=3);for(const q of lecturas){assert.equal(q.args.fechaHoy,'2026-10-31');assert.equal(q.texto.includes('GETDATE()'),false);
   assert.match(q.texto,/CAST\(r\.FechaIngreso AS DATE\)\s*<=\s*@fechaHoy/,'La estadía es por días: un ingreso a las 15 no se compara contra medianoche');
   assert.match(q.texto,/CAST\(r\.FechaEgreso AS DATE\)\s*>\s*@fechaHoy/,'El día de egreso no permanece ocupado por una hora distinta de cero');
  }
 }finally{await api?.cerrar();t.mock.timers.reset();if(tz===undefined)delete process.env.TZ;else process.env.TZ=tz;}
});
