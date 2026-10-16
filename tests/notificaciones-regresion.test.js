const {test}=require('node:test'),assert=require('node:assert/strict');
const {NotificacionService}=require('../src/services/NotificacionService');
const {NotificacionRepository}=require('../src/repositories/NotificacionRepository');
const tabla=[
  {idAlerta:101,tipo:'CONFLICTO_RESERVAS',prioridad:'Critica',estado:'Nueva',fecha:'2026-09-27T05:10:00Z'},
  {idAlerta:102,tipo:'CONFLICTO_RESERVAS',prioridad:'Critica',estado:'Leida',fecha:'2026-09-26T05:10:00Z'},
  {idAlerta:103,tipo:'CHECKIN_PROXIMO',prioridad:'Alta',estado:'Resuelta',fecha:'2026-09-25T05:10:00Z'},
  {idAlerta:104,tipo:'INCIDENCIA_ABIERTA',prioridad:'Media',estado:'Resuelta',fecha:'2026-09-24T05:10:00Z'},
];
test('Identidades 101/102: Critica se conserva, Leida se incluye y Resuelta no ingresa',async()=>{
  // El doble evalúa el WHERE sobre una tabla ficticia y verifica las constantes
  // del SQL real. No pretende reemplazar una ejecución del motor ni su collation.
  let consultas=0;
  const request=async()=>({input(){return this;},async query(sql){
    consultas++;assert.ok(sql.includes("IN(N'Nueva',N'Leida')"));assert.equal(sql.includes("N'Leída'"),false);
    assert.equal(/\b(UPDATE|INSERT|DELETE|EXEC)\b/.test(sql),false);
    const filas=tabla.filter(a=>['Nueva','Leida'].includes(a.estado));return{recordsets:[[{total:filas.length,totalSinFiltros:filas.length}],filas]};
  }});
  const service=new NotificacionService({repository:new NotificacionRepository({request})});
  for(const rol of ['Administrador','Operador']){
    const data=await service.avisos({rol},{});assert.deepEqual(data.avisos.map(a=>a.idAviso),[101,102]);
    assert.deepEqual(data.avisos.map(a=>a.prioridad),['Critica','Critica']);assert.equal(data.paginacion.total,2);
    assert.equal(data.avisos[0].fecha,'2026-09-27T05:10:00.000Z');
  }assert.equal(consultas,2);
  assert.equal(tabla.length,4);assert.equal(tabla.filter(a=>a.prioridad==='Critica'&&a.estado!=='Resuelta').length,2);
});
test('No se inventa Media para valores desconocidos; Informativa y fecha ausente se preservan',async()=>{
  const valores=['Critica','Alta','Media','Informativa',null,'Urgente','Baja'];
  const service=new NotificacionService({repository:{avisos:async()=>({total:7,filas:valores.map((prioridad,i)=>({idAlerta:i+1,tipo:'CHECKIN_PROXIMO',prioridad,fecha:i===0?'invalida':null}))})}});
  const r=await service.avisos({rol:'Operador'},{});assert.deepEqual(r.avisos.map(a=>a.prioridad),['Critica','Alta','Media','Informativa','NoDefinida','NoDefinida','NoDefinida']);assert.ok(r.avisos.every(a=>a.fecha===null));
  assert.equal(JSON.stringify(r).includes('Urgente'),false);
});
test('El generador operativo real produce Critica para conflictos, sin invocar sincronización',async()=>{
  const id=require.resolve('../src/repositories/AlertaRepository');
  require.cache[id]={id,filename:id,loaded:true,exports:{obtenerIncidenciasAlertables:async()=>[],obtenerSincronizacionesConError:async()=>[],obtenerCheckinsProximos:async()=>[],obtenerConflictosActivos:async()=>[{idReservaA:5,idReservaB:2,idPropiedad:1,propiedad:'Ficticia'}]}};
  const alertas=await require('../src/services/AlertaService').construirAlertasOperativas();
  assert.equal(alertas.length,1);assert.equal(alertas[0].severidad,'Critica');assert.equal(alertas[0].claveAlerta,'CONFLICTO:2:5');
});
