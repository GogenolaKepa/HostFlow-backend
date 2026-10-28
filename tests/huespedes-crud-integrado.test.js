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


test('dos altas concurrentes con el mismo email: una fila, segunda lectura tras el lock',async()=>{
 const email='concurrente@example.invalid',n=api.h.huespedes.size,desde=api.h.consultas.length;
 const rs=await Promise.all([api.pedir('/huespedes','POST',{...nuevo(),email}),api.pedir('/huespedes','POST',{...nuevo(),email})]);
 assert.deepEqual(rs.map(r=>r.status).sort(),[201,400]);assert.equal(api.h.huespedes.size,n+1);
 const qs=api.h.consultas.slice(desde);assert.ok(qs.every(q=>typeof q.tx==='number'),'Sin escape al pool');
 assert.equal(qs.filter(q=>q.texto.includes('INSERT INTO dbo.Huespedes')).length,1);
 assert.equal(qs.filter(q=>q.texto.includes('sp_getapplock')).length,2);
});

test('ediciones concurrentes con campos omitidos releen la última fila y preservan ambos cambios',async()=>{
 const alta=await api.pedir('/huespedes','POST',{...nuevo(),email:'ediciones@example.invalid'}),id=alta.data.huesped.idHuesped;
 const rs=await Promise.all([api.pedir('/huespedes/'+id,'PUT',{nombre:'Revisada'}),api.pedir('/huespedes/'+id,'PUT',{telefono:'321'})]);
 assert.ok(rs.every(r=>r.status===200));assert.equal(api.h.huespedes.get(id).nombre,'Revisada');assert.equal(api.h.huespedes.get(id).telefono,'321');
});

test('fallo en lectura posterior al UPDATE revierte el huésped completo y no anuncia éxito',async()=>{
 const alta=await api.pedir('/huespedes','POST',{...nuevo(),email:'rollback@example.invalid'}),id=alta.data.huesped.idHuesped;
 const antes=structuredClone(api.h.huespedes.get(id));let lecturas=0;
 api.h.hooks.huespedConsulta=()=>{if(++lecturas===2)throw Object.assign(Error('Fallo ficticio posterior'),{code:'EREQUEST'});};
 try{const r=await api.pedir('/huespedes/'+id,'PUT',{nombre:'No debe quedar'});assert.equal(r.status,503);assert.deepEqual(api.h.huespedes.get(id),antes);assert.equal(r.data.huesped,undefined);}
 finally{delete api.h.hooks.huespedConsulta;}
});

test('alta con commit aplicado y acuse perdido: HTTP 500 incierto; relectura y duplicado no crean otra fila',async()=>{
 const email='acuse@example.invalid',n=api.h.huespedes.size;api.h.acusePerdido=true;
 try{const r=await api.pedir('/huespedes','POST',{...nuevo(),email});assert.equal(r.status,500);assert.equal(r.data.codigo,'OPERACION_RESULTADO_INCIERTO');assert.equal(r.data.huesped,undefined);}
 finally{api.h.acusePerdido=false;}
 assert.equal(api.h.huespedes.size,n+1);const r=await api.pedir('/huespedes','POST',{...nuevo(),email});assert.equal(r.status,400);assert.equal(api.h.huespedes.size,n+1);
});

test('dos huéspedes no pueden adoptar simultáneamente el mismo email mediante escritores cooperantes',async()=>{
 const ids=[];for(const email of ['primero@example.invalid','segundo@example.invalid'])ids.push((await api.pedir('/huespedes','POST',{...nuevo(),email})).data.huesped.idHuesped);
 const rs=await Promise.all(ids.map(id=>api.pedir('/huespedes/'+id,'PUT',{email:'destino@example.invalid'})));
 assert.deepEqual(rs.map(r=>r.status).sort(),[200,400]);assert.equal([...api.h.huespedes.values()].filter(g=>g.email==='destino@example.invalid').length,1);
});
