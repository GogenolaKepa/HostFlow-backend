const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {crearEntornoComercialHttp}=require('./helpers/entornoComercialHttp');
const {EntregaCorreoSeguridad}=require('../src/security/comercial/EntregaCorreoSeguridad');
const {SupervisorComercial}=require('../src/services/SupervisorComercial');

async function entorno({bloqueado=false,fallarVinculo=false}={}){
  const e=await crearEntornoComercialHttp();
  await e.cuentas.solicitarRecuperacion({email:e.operador.usuario.email},{ip:'127.0.0.1'});
  const idProveedor=randomUUID(),destino=randomBytes(32),llamadas=[];
  // DOBLE: el SQL durable del puerto se valida por separado; no acredita motor.
  const eventos={persistencia:'sql-durable',prepararMensaje:async v=>{llamadas.push(['preparar',v]);return {estado:bloqueado?'bloqueado':'preparado'};},
    vincularAceptacion:async v=>{llamadas.push(['vincular',v]);if(fallarVinculo)throw Error('Fallo ficticio');return {estado:'vinculado'};}};
  const worker=new EntregaCorreoSeguridad({repository:e.repository,protector:e.entrega.protector,
    ahora:e.entrega.ahora,eventos,indiceDestino:()=>Buffer.from(destino),proveedor:{enviar:async(p,{antesDeEnviar})=>{
      assert.equal(await antesDeEnviar(),true);llamadas.push(['enviar',p.idempotencyKey]);return {id:idProveedor};
    }}});
  return {...e,worker,llamadas,idProveedor,destino};
}
test('outbox se vincula al ID aceptado antes de borrar el sobre; HMAC estable y sin email en correlación',async()=>{
  const e=await entorno();assert.equal((await e.worker.procesarUna()).estado,'entregada');
  assert.deepEqual(e.llamadas.map(x=>x[0]),['preparar','preparar','enviar','vincular']);
  const entrega=[...e.repository.entregas.values()][0];assert.equal(entrega.sobre,null);
  assert.deepEqual(e.llamadas.at(-1)[1],{outboxId:entrega.id,proveedorId:e.idProveedor});
  assert.ok(e.llamadas[0][1].destino.equals(e.destino));assert.ok(!JSON.stringify(e.llamadas).includes(e.operador.usuario.email));
});
test('destino suprimido entra en cuarentena sin llamar al proveedor',async()=>{
  const e=await entorno({bloqueado:true});assert.equal((await e.worker.procesarUna()).estado,'fallida');
  assert.deepEqual(e.llamadas.map(x=>x[0]),['preparar']);
  assert.equal([...e.repository.entregas.values()][0].enCuarentena,true);
});
test('aceptación sin correlación acreditada pausa supervisor, conserva sobre y nunca reenvía',async()=>{
  const e=await entorno({fallarVinculo:true}),supervisor=new SupervisorComercial({procesar:()=>e.worker.procesarUna(),intervaloMs:100});
  await supervisor.iniciar();assert.equal(supervisor.consultar().estado,'pausado');
  assert.ok([...e.repository.entregas.values()][0].sobre);assert.equal(e.llamadas.filter(x=>x[0]==='enviar').length,1);
  assert.throws(()=>supervisor.iniciar(),/Inspección/);await supervisor.detener();
});
test('correlación opcional rechaza adaptador incompleto al construir el worker',async()=>{
  const e=await crearEntornoComercialHttp();
  assert.throws(()=>new EntregaCorreoSeguridad({...e.entrega,eventos:{persistencia:'memoria'}}),/Correlación/);
});
test('sin eventos también registra incertidumbre antes del POST y la limpia solo al finalizar una aceptación conocida',async()=>{
  const e=await crearEntornoComercialHttp();await e.cuentas.solicitarRecuperacion({email:e.operador.usuario.email},{ip:'127.0.0.1'});
  let envios=0;e.entrega.proveedor={enviar:async p=>{envios++;assert.equal(e.repository.entregas.get(p.idempotencyKey).codigoFallo,'RESULTADO_INCIERTO');return {id:randomUUID()};}};
  assert.equal((await e.entrega.procesarUna()).estado,'entregada');assert.equal(envios,1);
  assert.equal([...e.repository.entregas.values()][0].codigoFallo,null);
});
