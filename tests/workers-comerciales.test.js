const {test}=require('node:test');
const assert=require('node:assert/strict');
const {crearEntornoComercialHttp}=require('./helpers/entornoComercialHttp');
const {ErrorSeguridad}=require('../src/security/seguridadUsuarios');
const {ResendCorreo,ErrorCorreo}=require('../src/security/comercial/ResendCorreo');
const {SupervisorComercial}=require('../src/services/SupervisorComercial');
const {AutenticacionComercialSql}=require('../src/repositories/AutenticacionComercialSql');
const {randomBytes,randomUUID}=require('node:crypto');
const ip={ip:'127.0.0.1'};
test('sobre alterado o clave ausente queda en cuarentena sin bloquear el siguiente ingreso',async()=>{
  for(const causa of ['tag','keyId']){
    const e=await crearEntornoComercialHttp();
    await e.ingreso.solicitar({email:'2@example.invalid'},ip);await e.ingreso.solicitar({email:'2@example.invalid'},ip);
    const primero=[...e.repository.ingresos.values()][0];primero.sobre[causa]=causa==='tag'?randomBytes(16).toString('base64url'):'retirada';
    const copia=structuredClone(primero.sobre);
    assert.equal((await e.ingreso.procesarUna()).estado,'cuarentena');
    assert.deepEqual(e.repository.ingresos.get(primero.id).sobre,copia);assert.equal(e.repository.desafios.size,0);
    assert.equal((await e.ingreso.procesarUna()).estado,'procesada');assert.equal(e.repository.desafios.size,1);
    assert.equal((await e.ingreso.procesarUna()).estado,'sin-pendientes');
  }
});
test('payload inválido cifrado no consume cuenta ni se confunde con proveedor caído',async()=>{
  const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:'2@example.invalid'},ip);
  const i=[...e.repository.ingresos.values()][0];i.sobre=e.ingreso.protector.sellar({email:'2@example.invalid',ip:'no-es-ip'},i.id);
  assert.equal((await e.ingreso.procesarUna()).estado,'cuarentena');assert.equal(e.repository.ingresoFallos.get(i.id).codigo,'PAYLOAD_INVALIDO');
  assert.equal(e.repository.desafios.size,0);assert.equal(e.repository.filas.get(2).versionSesion,1);
});
test('rollback confirmado permite backoff durable 60s/300s, luego cuarentena sin bucle',async()=>{
  const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:'2@example.invalid'},ip);
  e.cuentas.procesarSolicitudRecuperacion=async()=>{const error=new ErrorSeguridad(503,'AUTH_TRANSACCION_REVERTIDA','Fallo ficticio');error.reintentable=true;throw error;};
  for(const demora of [60000,300000]){
    assert.equal((await e.ingreso.procesarUna()).estado,'reintento-programado');assert.equal((await e.ingreso.procesarUna()).estado,'sin-pendientes');e.avanzar(demora);
  }
  assert.equal((await e.ingreso.procesarUna()).estado,'cuarentena');assert.equal((await e.ingreso.procesarUna()).estado,'sin-pendientes');
  assert.ok([...e.repository.ingresos.values()][0].sobre);assert.equal(e.repository.desafios.size,0);
});
test('resultado incierto no programa reintento ni borra evidencia',async()=>{
  const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:'2@example.invalid'},ip);
  e.cuentas.procesarSolicitudRecuperacion=async()=>{throw new ErrorSeguridad(503,'CUENTAS_RESULTADO_INCIERTO','Incierto');};
  await assert.rejects(e.ingreso.procesarUna(),{codigo:'CUENTAS_RESULTADO_INCIERTO'});assert.equal(e.repository.ingresoFallos.size,0);assert.ok([...e.repository.ingresos.values()][0].sobre);
});
test('leases de ingreso son durables: caída, recuperación acotada y propietario anterior rechazado',async()=>{
  const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:'2@example.invalid'},ip);
  let anterior;
  for(let intento=1;intento<=3;intento++){
    const lease=randomUUID();const r=await e.repository.transaccion(tx=>tx.reservarIngreso({lease,ahora:e.ingreso.ahora()}));assert.ok(r);
    assert.equal([...e.repository.ingresos.values()][0].intentos,intento);
    assert.equal(await e.repository.transaccion(tx=>tx.reservarIngreso({lease:randomUUID(),ahora:e.ingreso.ahora()})),null);
    if(anterior)assert.equal(await e.repository.transaccion(tx=>tx.finalizarIngreso(r.id,e.ingreso.ahora(),anterior)),false);
    anterior=lease;e.avanzar(120001);
  }
  assert.equal((await e.ingreso.procesarUna()).estado,'sin-pendientes');assert.equal([...e.repository.ingresoFallos.values()][0].estado,'cuarentena');assert.ok([...e.repository.ingresos.values()][0].sobre);assert.equal(e.repository.desafios.size,0);
});
test('429 respeta Retry-After, 5xx admite reintento y rechazo permanente conserva outbox',async()=>{
  const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:'2@example.invalid'},ip);await e.ingreso.procesarUna();
  let codigo=429,solicitudes=0;const clave=randomBytes(24).toString('hex');
  e.entrega.proveedor=new ResendCorreo({habilitado:true,origen:'https://cuentas.example.invalid',remitente:'cuentas@example.invalid',dominioVerificado:'example.invalid',obtenerSecreto:async()=>clave,
    transportar:async()=>{solicitudes++;return{status:codigo,headers:{get:()=> '120'},json:()=>assert.fail('No leer error sensible')};}});
  assert.equal((await e.entrega.procesarUna()).estado,'fallida');assert.equal((await e.entrega.procesarUna()).estado,'sin-pendientes');assert.equal(solicitudes,1);
  e.avanzar(120000);codigo=503;assert.equal((await e.entrega.procesarUna()).estado,'fallida');assert.equal([...e.repository.entregas.values()][0].enCuarentena,false);
  assert.equal([...e.repository.entregas.values()][0].codigoFallo,'RESULTADO_INCIERTO');
  e.avanzar(300000);codigo=422;assert.equal((await e.entrega.procesarUna()).estado,'fallida');const entrega=[...e.repository.entregas.values()][0];
  assert.equal(entrega.enCuarentena,true);assert.equal(entrega.codigoFallo,'PROVEEDOR_PERMANENTE');assert.ok(entrega.sobre);
  assert.equal((await e.entrega.procesarUna()).estado,'sin-pendientes');assert.equal(solicitudes,3);
});
test('clave faltante en correo no se reintenta automáticamente ni elimina ciphertext',async()=>{
  const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:'2@example.invalid'},ip);await e.ingreso.procesarUna();
  const entrega=[...e.repository.entregas.values()][0];entrega.sobre.keyId='no-disponible';
  assert.equal((await e.entrega.procesarUna()).estado,'pausada-configuracion');assert.equal(entrega.enCuarentena,true);assert.equal(entrega.codigoFallo,'CONFIGURACION');assert.ok(entrega.sobre);
  assert.equal((await e.entrega.procesarUna()).estado,'sin-pendientes');assert.equal(e.correos.length,0);
});
test('timeout con enlace vencido conserva evidencia incierta y no vuelve a enviar',async()=>{
  const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:'2@example.invalid'},ip);await e.ingreso.procesarUna();let envios=0;
  e.entrega.proveedor.enviar=async()=>{envios++;throw new ErrorCorreo('ENTREGA_INCIERTA');};
  await e.entrega.procesarUna();e.avanzar(900001);assert.equal((await e.entrega.procesarUna()).estado,'sin-pendientes');
  const fila=[...e.repository.entregas.values()][0];assert.equal(fila.enCuarentena,true);assert.ok(fila.sobre);assert.equal(envios,1);
});
test('supervisor no solapa ciclos y detener espera al procesamiento en curso',async()=>{
  let liberar,empezo;const iniciado=new Promise(r=>empezo=r);let llamadas=0;
  const s=new SupervisorComercial({procesar:async()=>{llamadas++;empezo();await new Promise(r=>liberar=r);return {estado:'sin-pendientes'};},esperar:()=>assert.fail('No iniciar otra espera tras detener')});
  const tarea=s.iniciar();assert.equal(s.iniciar(),tarea);await iniciado;
  let cerrado=false;const cierre=s.detener().then(()=>{cerrado=true;});await Promise.resolve();assert.equal(cerrado,false);
  liberar();await cierre;await tarea;assert.equal(llamadas,1);assert.equal(s.consultar().estado,'detenido');
});
test('supervisor pausa resultados inciertos; no se reinicia sin inspección',async()=>{
  const s=new SupervisorComercial({procesar:async()=>({correo:{estado:'resultado-incierto'}}),esperar:()=>assert.fail()});
  await s.iniciar();assert.equal(s.consultar().estado,'pausado');assert.throws(()=>s.iniciar());await s.detener();
});
test('solo ingreso HTTP evita applock global; commit incierto nunca habilita reintento',async()=>{
  let locks=0,falloCommit=false,falloRollback=false;const consultas=[];
  class Transaction{async begin(){}async commit(){if(falloCommit)throw Error();}async rollback(){if(falloRollback)throw Error();}}
  class Request{input(){return this;}async query(q){consultas.push(q);if(q.includes('sp_getapplock')){locks++;return{recordset:[{resultado:0}]};}return{recordset:[{base:'Test',servidor:'local',modelo:'authcom-v1'}]};}}
  const config={pool:{},driver:{Transaction,Request,ISOLATION_LEVEL:{SERIALIZABLE:1}},baseEsperada:'Test',servidorEsperado:'local',idEmpresa:1,habilitado:true};
  await new AutenticacionComercialSql({...config,perfil:'ingreso-http'}).transaccion(()=>{});assert.equal(locks,0);
  const repo=new AutenticacionComercialSql(config);await repo.transaccion(()=>{});assert.equal(locks,1);
  await new AutenticacionComercialSql({...config,perfil:'worker-ingreso'}).transaccion(tx=>tx.usuario(-1));
  const proyeccion=consultas.find(q=>q.includes('FROM dbo.Usuarios'));assert.ok(!proyeccion.includes('u.PasswordHash'));assert.match(proyeccion,/NULL AS passwordHash/);
  await assert.rejects(repo.transaccion(()=>{throw Object.assign(Error(),{number:1205});}),e=>e.codigo==='AUTH_TRANSACCION_REVERTIDA'&&e.reintentable===true);
  falloRollback=true;await assert.rejects(repo.transaccion(()=>{throw Object.assign(Error(),{number:1205});}),e=>e.codigo==='CUENTAS_RESULTADO_INCIERTO'&&!e.reintentable);
  falloRollback=false;falloCommit=true;await assert.rejects(repo.transaccion(()=>{}),e=>e.codigo==='CUENTAS_RESULTADO_INCIERTO'&&!e.reintentable);
});
