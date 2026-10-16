const {test}=require('node:test');
const assert=require('node:assert/strict');
// Ni el repositorio ni la conexión se cargan: el servicio real usa esta fixture.
const id=require.resolve('../src/repositories/CalendarioRepository');
let lecturas=0;const propiedad={idPropiedad:1,nombre:'Propiedad ficticia',estado:'Activa'};
const reservas=[{idReserva:1,idPropiedad:1,fechaIngreso:'2028-02-27',fechaEgreso:'2028-02-29',bloqueaDisponibilidad:true},
 {idReserva:2,idPropiedad:1,fechaIngreso:'2028-02-29',fechaEgreso:'2028-03-02',bloqueaDisponibilidad:true}];
require.cache[id]={id,filename:id,loaded:true,exports:{
 obtenerPropiedades:async()=>{lecturas++;return [propiedad];},
 obtenerReservas:async()=>{lecturas++;return reservas;},
 obtenerConflictos:async()=>{lecturas++;return [];},
}};
const calendario=require('../src/services/CalendarioService');
test('Calendario: febrero bisiesto y reservas contiguas no se superponen al egreso',async()=>{
 const datos=await calendario.obtenerCalendarioMensual(2028,2);
 assert.equal(datos.periodo.cantidadDias,29);assert.equal(datos.periodo.fechaHasta,'2028-03-01');
 const dias=datos.propiedades[0].dias;
 assert.equal(dias[27].reservas[0].idReserva,1);assert.equal(dias[28].reservas[0].idReserva,2);
 assert.equal(dias[28].reservas.length,1);assert.equal(dias.some(d=>d.tieneConflicto),false);
 assert.equal(lecturas,3,'Solo tres consultas de lectura, sin sincronizar reservas o limpiezas.');
});
test('Calendario: 2100 no es bisiesto; diciembre cruza de año sin perder un día',()=>{
 assert.equal(calendario.validarYConstruirPeriodo(2100,2).cantidadDias,28);
 assert.equal(calendario.validarYConstruirPeriodo(2000,2).cantidadDias,29);
 assert.equal(calendario.validarYConstruirPeriodo(2028,12).fechaHasta,'2029-01-01');
 for(const [anio,mes]of [[1999,1],[2101,1],[2028,0],[2028,13],[2028,1.5],['invalido',2]])assert.throws(()=>calendario.validarYConstruirPeriodo(anio,mes));
});
test('Calendario: conflicto real y propiedad inactiva conservan las señales operativas',()=>{
 const periodo=calendario.validarYConstruirPeriodo(2028,2);
 const superpuestas=[reservas[0],{...reservas[1],fechaIngreso:'2028-02-28'}];
 const resultado=calendario.construirCalendarioPropiedad(propiedad,superpuestas,[],periodo,'2028-02-01');
 assert.equal(resultado.dias[27].estado,'Conflicto');
 const inactiva=calendario.construirCalendarioPropiedad({...propiedad,estado:'Inactiva'},reservas,[],periodo,'2028-02-01');
 assert.equal(inactiva.dias[26].estado,'Conflicto');assert.ok(inactiva.conflictos.some(c=>c.tipo==='PROPIEDAD_NO_DISPONIBLE'));
});
