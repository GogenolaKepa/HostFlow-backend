const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {crearApiUniversitaria}=require('./helpers/operacionUniversitariaAislada');let api;
before(async()=>{api=await crearApiUniversitaria();});after(async()=>api?.cerrar());
test('Reportes HTTP: fechas imposibles no llegan al driver, bisiesto y límite inclusivo son reales',async()=>{
 for(const fecha of ['2026-02-29','2026-02-31','2026-13-01','0000-01-01','9999-12-31']){
  const antes=api.h.consultas.length,r=await api.pedir(`/dashboard/reportes?periodo=personalizado&fechaDesde=${fecha}&fechaHasta=${fecha}`);assert.equal(r.status,400,fecha);assert.equal(api.h.consultas.length,antes);
 }
 const r=await api.pedir('/dashboard/reportes?periodo=personalizado&fechaDesde=2028-02-29&fechaHasta=2028-02-29');assert.equal(r.status,200);assert.equal(r.data.reportes.periodo.fechaHasta,'2028-02-29');
 const consultas=api.h.consultas.filter(q=>q.args.fechaDesde==='2028-02-29');assert.equal(consultas.length,2);for(const q of consultas)assert.equal(q.args.fechaHasta,'2028-03-01');
});
