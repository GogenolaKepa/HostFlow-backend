const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {crearApiUniversitaria}=require('./helpers/operacionUniversitariaAislada');
let api;
before(async()=>{api=await crearApiUniversitaria();});
after(async()=>api?.cerrar());
const nueva=()=>({nombre:'Propiedad ficticia',tipo:'Casa',direccion:'Ficticia 1',ciudad:'Ficticia',provincia:'Ficticia',capacidadMaxima:2,precioBase:10,estado:'Activa'});
const alta=async()=>{const r=await api.pedir('/propiedades','POST',nueva());assert.equal(r.status,201);return r.data.propiedad.idPropiedad;};

test('alta de propiedad: fallo de la lectura final revierte el INSERT',async()=>{
 const n=api.h.propiedades.size,desde=api.h.consultas.length;
 api.h.fallos.propiedadConsulta=Object.assign(Error('Fallo ficticio'),{code:'EREQUEST'});
 try{const r=await api.pedir('/propiedades','POST',nueva());assert.equal(r.status,503);assert.equal(api.h.propiedades.size,n);assert.equal(r.data.propiedad,undefined);}
 finally{delete api.h.fallos.propiedadConsulta;}
 assert.ok(api.h.consultas.slice(desde).every(q=>typeof q.tx==='number'),'Lecturas e INSERT sin escape al pool');
});

test('edición de propiedad: fallo después de UPDATE revierte y no sincroniza canales',async()=>{
 const id=await alta(),antes=structuredClone(api.h.propiedades.get(id));let lecturas=0;
 api.h.hooks.propiedadConsulta=()=>{if(++lecturas===2)throw Object.assign(Error('Fallo ficticio'),{code:'EREQUEST'});};
 const servicio=require('../src/services/PropiedadCanalService'),original=servicio.sincronizarCambiosPropiedad;let llamadas=0;
 servicio.sincronizarCambiosPropiedad=async()=>{llamadas++;return [];};
 try{const r=await api.pedir('/propiedades/'+id,'PUT',{nombre:'No debe quedar'});assert.equal(r.status,503);assert.deepEqual(api.h.propiedades.get(id),antes);assert.equal(llamadas,0);}
 finally{delete api.h.hooks.propiedadConsulta;servicio.sincronizarCambiosPropiedad=original;}
});

test('dos ediciones parciales cooperantes preservan ambos cambios y el precio',async()=>{
 const id=await alta(),desde=api.h.consultas.length;
 const rs=await Promise.all([api.pedir('/propiedades/'+id,'PUT',{nombre:'Revisada'}),api.pedir('/propiedades/'+id,'PUT',{ciudad:'Otra ciudad'})]);
 assert.ok(rs.every(r=>r.status===200),JSON.stringify(rs));
 const fila=api.h.propiedades.get(id);assert.equal(fila.nombre,'Revisada');assert.equal(fila.ciudad,'Otra ciudad');assert.equal(Number(fila.precioBase),10);
 assert.equal(api.h.consultas.slice(desde).filter(q=>q.texto.includes('sp_getapplock')).length,2);
 assert.ok(api.h.consultas.slice(desde).filter(q=>q.texto.includes('UPDATE dbo.Propiedades')).every(q=>typeof q.tx==='number'));
});

test('commit aplicado sin acuse: HTTP incierto, sin sincronización ni reenvío automático',async()=>{
 const id=await alta(),servicio=require('../src/services/PropiedadCanalService'),original=servicio.sincronizarCambiosPropiedad;let llamadas=0;
 servicio.sincronizarCambiosPropiedad=async()=>{llamadas++;return [];};api.h.acusePerdido=true;
 try{const r=await api.pedir('/propiedades/'+id,'PUT',{nombre:'Guardada sin acuse'});assert.equal(r.status,500);assert.equal(r.data.codigo,'OPERACION_RESULTADO_INCIERTO');assert.equal(llamadas,0);}
 finally{api.h.acusePerdido=false;servicio.sincronizarCambiosPropiedad=original;}
 const r=await api.pedir('/propiedades/'+id);assert.equal(r.data.propiedad.nombre,'Guardada sin acuse');
});

test('fallo externo después del commit informa guardado local, sin inventar rollback',async()=>{
 const id=await alta(),servicio=require('../src/services/PropiedadCanalService'),original=servicio.sincronizarCambiosPropiedad;let llamadas=0;
 servicio.sincronizarCambiosPropiedad=async()=>{llamadas++;throw Error('Fallo ficticio');};
 try{const r=await api.pedir('/propiedades/'+id,'PUT',{nombre:'Guardada localmente'});assert.equal(r.status,500);assert.equal(r.data.codigo,'PROPIEDAD_SINCRONIZACION_PENDIENTE');assert.match(r.data.mensaje,/guardada en HostFlow/);assert.equal(r.data.propiedad,undefined);assert.equal(llamadas,1);}
 finally{servicio.sincronizarCambiosPropiedad=original;}
 assert.equal((await api.pedir('/propiedades/'+id)).data.propiedad.nombre,'Guardada localmente');
});

test('cambio de estado: error en consulta posterior revierte la unidad local',async()=>{
 const id=await alta(),antes=structuredClone(api.h.propiedades.get(id));let lecturas=0;
 api.h.hooks.propiedadConsulta=()=>{if(++lecturas===2)throw Object.assign(Error('Fallo ficticio'),{code:'EREQUEST'});};
 try{const r=await api.pedir('/propiedades/'+id+'/estado','PATCH',{estado:'Inactiva'});assert.equal(r.status,503);assert.deepEqual(api.h.propiedades.get(id),antes);}
 finally{delete api.h.hooks.propiedadConsulta;}
});
