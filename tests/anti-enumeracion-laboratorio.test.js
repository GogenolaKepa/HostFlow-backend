const {test}=require('node:test'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {crearEntornoComercialHttp}=require('./helpers/entornoComercialHttp');
test('laboratorio HTTP: conocidos/desconocidos, jitter, concurrencia y cuota con ingreso asíncrono',async t=>{
  const e=await crearEntornoComercialHttp({relojReal:true}),server=e.app.listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${server.address().port}/api/cuentas-comerciales/recuperacion/solicitar`;
  let contador=0;const original=e.repository.encolarIngreso.bind(e.repository);
  e.repository.encolarIngreso=async v=>{await new Promise(r=>setTimeout(r,2+contador++%3));return original(v);};
  const lecturas=e.repository.lecturas;
  async function pedir(conocido){const inicio=performance.now();const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:conocido?e.operador.usuario.email:'desconocido@example.invalid'})});return {status:r.status,body:await r.text(),ms:performance.now()-inicio};}
  try{
    // Dos calentamientos, muestra alternada balanceada y dos tandas concurrentes.
    await pedir(true);await pedir(false);
    const grupos=[[],[]],respuestas=[];
    for(let n=0;n<24;n++){const conocido=n%2===0;const r=await pedir(conocido);grupos[conocido?0:1].push(r.ms);respuestas.push(r);}
    const saturacion=await Promise.all(Array.from({length:24},(_,n)=>pedir(n%2===0)));
    assert.ok(respuestas.every(r=>r.status===202&&r.body===respuestas[0].body));
    assert.equal(saturacion.filter(r=>r.status===202).length,14);assert.equal(saturacion.filter(r=>r.status===429).length,10);
    assert.equal(e.repository.ingresos.size,40);assert.equal(e.repository.lecturas,lecturas);
    assert.equal(e.repository.desafios.size,0);assert.equal(e.correos.length,0);
    const resumir=valores=>{const a=[...valores].sort((a,b)=>a-b);return {n:a.length,medianaMs:+a[Math.floor(a.length/2)].toFixed(2),p95Ms:+a[Math.ceil(a.length*.95)-1].toFixed(2)};};
    const resumen={conocidos:resumir(grupos[0]),desconocidos:resumir(grupos[1]),saturacion:resumir(saturacion.map(r=>r.ms)),aceptadas:40,limitadas:10};
    // Límites amplios detectan bloqueos, no prometen tiempo constante ni paridad
    // estadística de producción. La evidencia fuerte es que no se consultan cuentas.
    assert.ok(Math.abs(resumen.conocidos.medianaMs-resumen.desconocidos.medianaMs)<250);
    assert.ok(Math.max(...respuestas.map(r=>r.ms),...saturacion.map(r=>r.ms))<3000);
    t.diagnostic(JSON.stringify(resumen));
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
