const {test}=require('node:test');
const assert=require('node:assert/strict');
const https=require('node:https');
const originalRequest=https.request;
https.request=()=>{throw Error('Red externa prohibida en esta prueba.');};
const servicio=require('../src/services/IaService');
const {after}=require('node:test');after(()=>{https.request=originalRequest;});
const base={id:'limpieza-ficticia',tipo:'limpieza_prioritaria',prioridad:'Alta',titulo:'Limpieza pendiente',descripcion:'Margen operativo reducido',accion:'Revisar tarea',evidencia:{minutosDisponibles:60}};
const texto={id:base.id,titulo:'Revisar limpieza',descripcion:'La tarea tiene poco margen',accion:'Consultar preparación',fundamento:'Margen de 60 minutos'};
async function enriquecer(items){
 const aislado=Object.create(Object.getPrototypeOf(servicio));
 aislado.modelo='modelo-ficticio';aislado.estaConfigurada=()=>true;
 aislado.solicitarGemini=async()=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({recomendaciones:items})}]}]});
 return aislado.enriquecerRecomendaciones({fechaNegocio:'2028-02-28',recomendaciones:[base]});
}
test('FlowIA generativo: texto malformado no reemplaza el contenido determinístico',async()=>{
 for(const campos of [{titulo:{}},{descripcion:[]},{accion:0},{fundamento:{}},{titulo:' '},{accion:undefined}]){
  const resultado=await enriquecer([{...texto,...campos}]);assert.equal(resultado.aplicada,false);assert.deepEqual(resultado.recomendaciones,[]);
 }
});
test('FlowIA generativo: IDs ajenos o duplicados no eligen una explicación arbitraria',async()=>{
 for(const items of [[{...texto,id:'ajeno'}],[texto,{...texto,titulo:'Otra versión'}],[null,{}]]){
  const resultado=await enriquecer(items);assert.equal(resultado.aplicada,false);assert.deepEqual(resultado.recomendaciones,[]);
 }
});
test('FlowIA generativo: texto válido conserva ID y excluye campos que el proveedor no puede decidir',async()=>{
 const resultado=await enriquecer([{...texto,prioridad:'Baja',destino:{seccion:'usuarios'},importe:999}]);
 assert.equal(resultado.aplicada,true);assert.deepEqual(resultado.recomendaciones,[texto]);assert.equal(base.prioridad,'Alta');
});
