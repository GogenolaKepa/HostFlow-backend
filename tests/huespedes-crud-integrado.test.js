const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {crearApiUniversitaria}=require('./helpers/operacionUniversitariaAislada');let api;
before(async()=>{api=await crearApiUniversitaria();});after(async()=>api?.cerrar());
const nuevo=()=>({nombre:'Persona',apellido:'Ficticia',email:'persona-nocturna@example.invalid',telefono:'',dni:'',nacionalidad:''});
test('Huéspedes HTTP: espacios, tipos, longitudes y email inválido se rechazan antes de SQL',async()=>{
 for(const cambio of [{nombre:'   '},{apellido:'\t'},{nombre:9},{nombre:'n'.repeat(101)},{email:'correo-invalido'},{telefono:'1'.repeat(51)}]){
  const antes=api.h.consultas.length,r=await api.pedir('/huespedes','POST',{...nuevo(),...cambio});assert.equal(r.status,400);assert.equal(api.h.consultas.length,antes);
 }
});
test('Huéspedes HTTP: alta/lectura/edición conservan identidad, opcionales y normalización sin duplicar',async()=>{
 const r=await api.pedir('/huespedes','POST',{...nuevo(),nombre:' Persona ',apellido:' Ficticia ',email:' persona-unica@example.invalid '});assert.equal(r.status,201);const g=r.data.huesped;
 assert.equal(g.nombre,'Persona');assert.equal(g.email,'persona-unica@example.invalid');assert.equal(g.telefono,'No registrado');
 const e=await api.pedir(`/huespedes/${g.idHuesped}`,'PUT',{nombre:'Nombre revisado',telefono:'123'});assert.equal(e.status,200);assert.equal(e.data.huesped.email,g.email);
 const detalle=await api.pedir(`/huespedes/${g.idHuesped}`);assert.equal(detalle.status,200);assert.equal(detalle.data.huesped.nombre,'Nombre revisado');assert.deepEqual(detalle.data.huesped.historialReservas,[]);
 const n=api.h.huespedes.size,duplicado=await api.pedir('/huespedes','POST',{...nuevo(),email:g.email});assert.equal(duplicado.status,400);assert.equal(api.h.huespedes.size,n);
});
