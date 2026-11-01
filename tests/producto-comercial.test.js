const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepararProductoComercial}=require('../src/services/ProductoComercial');
const env={HOSTFLOW_AUTH_COMERCIAL_ENABLED:'1',DB_SERVER:'hostflow.database.windows.net',DB_DATABASE:'HostFlow',HOSTFLOW_EMPRESA_ID:'1',
  HOSTFLOW_AUTH_COMERCIAL_ORIGEN:'https://cuentas.example.invalid',HOSTFLOW_AUTH_COMERCIAL_REMITENTE:'acceso@example.invalid',HOSTFLOW_AUTH_COMERCIAL_DOMINIO:'example.invalid'};
test('producto cerrado por defecto aunque una bandera esté encendida',async()=>{
  let abierto=false;
  const r=await prepararProductoComercial({env,preparar:()=>{abierto=true;}});
  assert.equal(r.montaje,null);assert.equal(r.iniciarWorker,null);assert.equal(abierto,false);
});
test('dependencia ausente o infraestructura rechazada no afecta el login ni expone diagnóstico sensible',async()=>{
  const r=await prepararProductoComercial({env,aprobacion:true});
  assert.equal(r.estado,'no-disponible');assert.equal(r.montaje,null);
  const s=await prepararProductoComercial({env,aprobacion:true,dependencias:{},autenticar:()=>{},preparar:async()=>{throw Error('secreto prohibido');}});
  assert.equal(s.estado,'no-disponible');assert.ok(!JSON.stringify(s).includes('secreto'));
});
test('cableado explícito conserva autenticador real, no arranca supervisor y cierra el runtime',async()=>{
  let arranques=0,cierres=0;const autenticar=()=>{};
  const r=await prepararProductoComercial({env,aprobacion:true,dependencias:{},autenticar,preparar:async opciones=>{
    assert.equal(opciones.dependencias.autenticar,autenticar);
    return {estado:'preparado',handler:()=>{},consultar:()=>({}),iniciarWorker:()=>++arranques,cerrar:async()=>{cierres++;}};
  }});
  assert.equal(r.estado,'preparado');assert.equal(typeof r.montaje,'function');assert.equal(arranques,0);
  await r.iniciarWorker();await r.cerrar();assert.equal(arranques,1);assert.equal(cierres,1);
});
test('cierre fallido queda visible y no publica router ni método de arranque',async()=>{
  const r=await prepararProductoComercial({env,aprobacion:true,dependencias:{},autenticar:()=>{},
    preparar:async()=>({estado:'incompatible',cerrar:async()=>{throw Error('No cerrado');}})});
  assert.equal(r.estado,'cierre-pendiente');assert.equal(r.montaje,null);assert.equal(r.iniciarWorker,null);
  await assert.rejects(r.cerrar());
});
