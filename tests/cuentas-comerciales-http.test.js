const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {crearEntornoComercialHttp}=require('./helpers/entornoComercialHttp');
const {IngresoComercialSql}=require('../src/repositories/IngresoComercialSql');

async function ejecutar(fn){const e=await crearEntornoComercialHttp();const server=e.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/cuentas-comerciales`;
  const pedir=(ruta,body,token,metodo='POST')=>fetch(base+ruta,{method:metodo,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  try{await fn(e,pedir,base);}finally{await new Promise(r=>server.close(r));}}
const password=()=>randomBytes(18).toString('hex');
test('ingreso HTTP neutral encola antes de buscar cuenta, cabeceras y sin proveedor en request',()=>ejecutar(async(e,pedir)=>{
  const antes=e.repository.lecturas;
  const a=await pedir('/recuperacion/solicitar',{email:e.operador.usuario.email}),b=await pedir('/recuperacion/solicitar',{email:'ausente@example.invalid'});
  assert.equal(a.status,202);assert.equal(b.status,202);assert.deepEqual(await a.json(),await b.json());
  assert.equal(a.headers.get('cache-control'),'no-store');assert.equal(a.headers.get('referrer-policy'),'no-referrer');
  assert.equal(e.repository.lecturas,antes);assert.equal(e.repository.ingresos.size,2);assert.equal(e.repository.desafios.size,0);assert.equal(e.correos.length,0);
  assert.ok(!JSON.stringify([...e.repository.ingresos]).includes(e.operador.usuario.email));
  await e.procesar();await e.procesar();assert.equal(e.correos.length,1);
}));
test('recuperación completa HTTP, token leído sin consumir, sesión anterior invalidada y login nuevo',()=>ejecutar(async(e,pedir)=>{
  await pedir('/recuperacion/solicitar',{email:e.operador.usuario.email});await e.procesar();const token=e.tokenCorreo(),nueva=password();
  assert.equal((await pedir('/recuperacion/validar',{token})).status,204);assert.equal([...e.repository.desafios.values()][0].consumidaEn,null);
  // Reabrir/verificar no agota el presupuesto separado de confirmación.
  for(let n=0;n<5;n++)assert.equal((await pedir('/recuperacion/validar',{token})).status,204);
  assert.equal((await pedir('/recuperacion/confirmar',{token,passwordNueva:nueva})).status,204);
  assert.equal(await e.auth.obtenerUsuarioSesion(2,{origen:'sql',versionSesion:1}),null);
  assert.equal((await pedir('/invitaciones',undefined,e.tokenOperador(),'GET')).status,401);
  await assert.rejects(e.auth.login(e.operador.usuario.email,e.operador.password));
  assert.ok((await e.auth.login(e.operador.usuario.email,nueva)).token);
  assert.equal((await pedir('/recuperacion/confirmar',{token,passwordNueva:nueva})).status,400);
}));
test('invitaciones revalidan Admin, destino duplicado neutral y campos cerrados',()=>ejecutar(async(e,pedir)=>{
  const body={nombre:'Persona ficticia',email:'persona@example.invalid'};
  assert.equal((await pedir('/invitaciones',body,e.tokenOperador())).status,403);
  assert.equal((await pedir('/invitaciones',{...body,rol:'Administrador'},e.tokenAdmin())).status,400);
  const a=await pedir('/invitaciones',body,e.tokenAdmin()),b=await pedir('/invitaciones',body,e.tokenAdmin());assert.equal(a.status,202);assert.deepEqual(await a.json(),await b.json());
  const lista=await pedir('/invitaciones',undefined,e.tokenAdmin(),'GET');assert.equal(lista.status,200);const datos=await lista.json();assert.equal(datos.invitaciones.length,1);assert.equal(datos.invitaciones[0].estado,'Pendiente');assert.ok(!JSON.stringify(datos).includes('hash'));
  assert.equal((await pedir('/invitaciones',undefined,e.tokenOperador(),'GET')).status,403);
}));
test('aceptación concurrente crea solo un Operador y permite login ficticio',()=>ejecutar(async(e,pedir)=>{
  await pedir('/invitaciones',{nombre:'Persona',email:'nueva@example.invalid'},e.tokenAdmin());await e.procesar();const token=e.tokenCorreo(),nueva=password();
  const resultados=await Promise.all([pedir('/invitaciones/confirmar',{token,passwordNueva:nueva}),pedir('/invitaciones/confirmar',{token,passwordNueva:nueva})]);
  assert.deepEqual(resultados.map(r=>r.status).sort(),[204,400]);assert.equal(e.repository.filas.size,3);
  assert.equal((await e.auth.login('nueva@example.invalid',nueva)).usuario.rol,'Operador');
  assert.equal((await (await pedir('/invitaciones',undefined,e.tokenAdmin(),'GET')).json()).invitaciones[0].estado,'Aceptada');
}));
test('revocación y expiración de enlaces rechazan sin cambiar cuentas existentes',()=>ejecutar(async(e,pedir)=>{
  await pedir('/invitaciones',{nombre:'Persona',email:'revocada@example.invalid'},e.tokenAdmin());await e.procesar();const token=e.tokenCorreo(),id=[...e.repository.desafios.keys()][0];
  assert.equal((await pedir(`/invitaciones/${id}/revocar`,{},e.tokenOperador())).status,403);
  assert.equal((await pedir(`/invitaciones/${id}/revocar`,{},e.tokenAdmin())).status,204);
  assert.equal((await pedir('/invitaciones/validar',{token})).status,400);
  await pedir('/recuperacion/solicitar',{email:e.operador.usuario.email});await e.procesar();const otro=e.tokenCorreo();e.avanzar(900000);
  assert.equal((await pedir('/recuperacion/validar',{token:otro})).status,400);assert.equal(e.repository.filas.size,2);
}));
test('ingreso/consumo/outbox comparten rollback y dos workers no duplican procesamiento',()=>ejecutar(async(e,pedir)=>{
  await pedir('/recuperacion/solicitar',{email:e.operador.usuario.email});e.repository.fallarOutbox=true;
  await assert.rejects(e.ingreso.procesarUna());assert.equal(e.repository.desafios.size,0);assert.equal([...e.repository.ingresos.values()][0].estado,'pendiente');
  assert.equal([...e.repository.ingresos.values()][0].intentos,1);e.avanzar(120001); // Inspección y vencimiento del lease antes de reanudar.
  e.repository.fallarOutbox=false;
  const r=await Promise.all([e.ingreso.procesarUna(),e.ingreso.procesarUna()]);assert.deepEqual(r.map(x=>x.estado).sort(),['procesada','sin-pendientes']);
  assert.equal(e.repository.desafios.size,1);assert.equal([...e.repository.ingresos.values()][0].sobre,null);
}));
test('fallo de entrega ficticia no cambia respuesta pública ni expone datos',()=>ejecutar(async(e,pedir)=>{
  e.fallarCorreo(true);const r=await pedir('/recuperacion/solicitar',{email:e.operador.usuario.email});assert.equal(r.status,202);await e.procesar();assert.equal(e.correos.length,0);
  assert.equal([...e.repository.entregas.values()][0].estado,'fallida');assert.doesNotMatch(JSON.stringify(await r.json()),/hash|token|fallo/i);
}));
test('tokens fuera de URL, JSON malformado sanitizado, límites y sesión obsoleta',()=>ejecutar(async(e,pedir,base)=>{
  const token=randomBytes(32).toString('base64url');const url=await fetch(base+'/recuperacion/validar?token='+token);assert.equal(url.status,400);assert.ok(!(await url.text()).includes(token));
  const roto=await fetch(base+'/recuperacion/confirmar',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"token":"dato-sensible"'});assert.equal(roto.status,400);assert.ok(!(await roto.text()).includes('dato-sensible'));
  e.repository.filas.get(1).versionSesion++;assert.equal((await pedir('/invitaciones',{nombre:'Ficticio',email:'no@example.invalid'},e.tokenAdmin())).status,401);
  let ultimo;for(let n=0;n<41;n++)ultimo=await pedir('/recuperacion/solicitar',{email:'ausente@example.invalid'});assert.equal(ultimo.status,429);
}));
test('puertos SQL de ingreso cerrados y esquema nuevo bloqueado sin montaje operativo',async()=>{
  let llamadas=0;const repo=new IngresoComercialSql({repository:{transaccion:async()=>{llamadas++;}}});
  await assert.rejects(repo.transaccion(()=>{}),{codigo:'INGRESO_COMERCIAL_INACTIVO'});assert.equal(llamadas,0);
  for(const p of ['app.js','server.js','routes/authRoutes.js','routes/usuarioRoutes.js'])assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src',p),'utf8'),/cuentasComercialesAisladas|IngresoRecuperacionService|IngresoComercialSql/);
  assert.match(fs.readFileSync(path.join(__dirname,'../sql/proposals/autenticacion_comercial/04_ingreso_bloqueado.sql'),'utf8'),/@Aplicar bit=0/);
});
test('paginación acotada y explícita sin admitir parámetros ajenos ni revelar hashes',()=>ejecutar(async(e,pedir)=>{
  for(let n=0;n<55;n++)await e.repository.insertarDesafio({id:randomUUID(),hash:n.toString(16).padStart(64,'0'),proposito:'invitacion',idEmpresa:1,email:`persona${n}@example.invalid`,nombre:`Persona ${n}`,expiraEn:Date.now()+86400000,consumidaEn:null,revocadaEn:null});
  const uno=await (await pedir('/invitaciones?pagina=1',undefined,e.tokenAdmin(),'GET')).json();
  const dos=await (await pedir('/invitaciones?pagina=2',undefined,e.tokenAdmin(),'GET')).json();
  assert.equal(uno.invitaciones.length,50);assert.equal(uno.hayMas,true);assert.equal(dos.invitaciones.length,5);assert.equal(dos.pagina,2);assert.equal(dos.hayMas,false);
  assert.ok(!JSON.stringify(uno).includes('hash'));
  for(const query of ['pagina=0','pagina=10001','pagina=1&pagina=2','pagina=1&idEmpresa=2'])assert.equal((await pedir('/invitaciones?'+query,undefined,e.tokenAdmin(),'GET')).status,400);
}));
