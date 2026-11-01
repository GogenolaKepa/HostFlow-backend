const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {randomBytes,randomUUID}=require('node:crypto');
const {AutenticacionComercialSql}=require('../src/repositories/AutenticacionComercialSql');
const {crearEntornoComercialHttp}=require('./helpers/entornoComercialHttp');
const {ResendCorreo}=require('../src/security/comercial/ResendCorreo');
const {ErrorSeguridad}=require('../src/security/seguridadUsuarios');

test('deadlock abortado por mssql acredita rollback; commit incierto nunca reintentable',async()=>{
  let tx,commits=0,rollbacks=0,fallarCommit=false;
  class Transaction extends EventEmitter{constructor(){super();tx=this;}async begin(){}async rollback(){rollbacks++;throw Error('ENOTBEGUN');}async commit(){commits++;if(fallarCommit){this.emit('rollback',true);throw {number:1205};}}}
  class Request{input(){return this;}async query(q){return {recordset:q.includes('sp_getapplock')?[{resultado:0}]:[{base:'Test',servidor:'local',modelo:'authcom-v1'}]};}}
  const repo=new AutenticacionComercialSql({pool:{},driver:{Transaction,Request,ISOLATION_LEVEL:{SERIALIZABLE:4}},baseEsperada:'Test',servidorEsperado:'local',idEmpresa:1,habilitado:true});
  await assert.rejects(repo.transaccion(()=>{tx.emit('rollback',true);throw {number:1205};}),e=>e.codigo==='AUTH_TRANSACCION_REVERTIDA'&&e.reintentable===true);
  assert.equal(rollbacks,0);fallarCommit=true;
  await assert.rejects(repo.transaccion(()=>{}),e=>e.codigo==='CUENTAS_RESULTADO_INCIERTO'&&!e.reintentable);assert.equal(commits,1);
});

test('adaptador restringido usa módulo ligado al desafío; no INSERT directo ni auditoría duplicada',async()=>{
  const consultas=[];class Transaction{async begin(){}async commit(){}async rollback(){}}
  class Request{constructor(){this.p={};}input(k,t,v){this.p[k]=arguments.length===2?t:v;return this;}async query(q){consultas.push({q,p:this.p});return {recordset:q.includes('SELECT DB_NAME')?[{base:'Test',servidor:'local',modelo:'authcom-v1'}]:q.includes('sp_getapplock')?[{resultado:0}]:[{id:42}]};}}
  const repo=new AutenticacionComercialSql({pool:{},driver:{Transaction,Request,ISOLATION_LEVEL:{SERIALIZABLE:4},DateTime2:n=>n},baseEsperada:'Test',servidorEsperado:'local',idEmpresa:1,habilitado:true,altaOperadorRestringida:true});
  const desafioId=randomUUID();await repo.transaccion(async t=>{
    assert.equal(await t.crearInvitado({rol:'Operador',desafioId,consumidaEn:Date.now(),passwordHash:'solo-doble'}),42);
    await t.auditar({tipo:'INVITACION_ACEPTADA',usuarioId:42});
  });
  assert.match(consultas.at(-1).q,/EXEC authcom.CrearOperadorInvitado/);assert.equal(consultas.at(-1).p.desafio,desafioId);
  assert.ok(!consultas.some(c=>/INSERT dbo.Usuarios|INSERT authcom.Auditoria/.test(c.q)));
});

test('revocación mientras se obtiene el secreto impide el POST real del adaptador',async()=>{
  const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:e.operador.usuario.email},{ip:'127.0.0.1'});await e.ingreso.procesarUna();
  let liberar,iniciada,red=0;const esperando=new Promise(r=>iniciada=r),secreto=new Promise(r=>liberar=r);
  e.entrega.proveedor=new ResendCorreo({habilitado:true,origen:'https://cuentas.example.invalid',remitente:'acceso@example.invalid',dominioVerificado:'example.invalid',obtenerSecreto:()=>{iniciada();return secreto;},transportar:()=>{red++;assert.fail('Correo revocado');}});
  const tarea=e.entrega.procesarUna();await esperando;
  await e.repository.transaccion(tx=>tx.revocarRecuperaciones(2,e.ingreso.ahora()));
  liberar(randomBytes(24).toString('hex'));assert.equal((await tarea).estado,'no-enviada');assert.equal(red,0);
  assert.equal([...e.repository.entregas.values()][0].estado,'descartada');
});

test('vencimiento del desafío y lease insuficiente bloquean correo incluso con outbox más larga',async()=>{
  for(const modo of ['desafio','lease']){
    const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:e.operador.usuario.email},{ip:'127.0.0.1'});await e.ingreso.procesarUna();
    let envios=0;const abrir=e.entrega.protector.abrir.bind(e.entrega.protector);
    e.entrega.protector={abrir:(...args)=>{const r=abrir(...args);if(modo==='desafio')[...e.repository.desafios.values()][0].expiraEn=e.ingreso.ahora()-1;else e.avanzar(95000);return r;}};
    e.entrega.proveedor={enviar:()=>{envios++;}};
    assert.equal((await e.entrega.procesarUna()).estado,'no-enviada');assert.equal(envios,0);
  }
});

test('solicitud legacy/admin no genera enlace; recuperación Operador conserva login y revoca sesiones',async()=>{
  const e=await crearEntornoComercialHttp(),ip={ip:'127.0.0.1'};
  for(const email of [e.admin.usuario.email,'ausente@example.invalid']){await e.ingreso.solicitar({email},ip);await e.ingreso.procesarUna();}
  e.repository.filas.get(2).emailVerificadoEn=null;
  await e.ingreso.solicitar({email:e.operador.usuario.email},ip);await e.ingreso.procesarUna();assert.equal(e.repository.desafios.size,0);
  e.avanzar(900001);Object.assign(e.repository.filas.get(2),{emailVerificadoEn:new Date(e.ingreso.ahora()-60000).toISOString(),versionContacto:2});
  await e.ingreso.solicitar({email:e.operador.usuario.email},ip);await e.procesar();
  const token=e.tokenCorreo(),password=randomBytes(18).toString('hex');
  await e.cuentas.validarEnlace('recuperacion',token,ip);assert.equal([...e.repository.desafios.values()][0].consumidaEn,null);
  await e.cuentas.confirmarRecuperacion({token,passwordNueva:password},ip);
  assert.equal(await e.auth.obtenerUsuarioSesion(2,{origen:'sql',versionSesion:1}),null);
  assert.ok((await e.auth.login(e.operador.usuario.email,password)).token);
  await assert.rejects(e.cuentas.confirmarRecuperacion({token,passwordNueva:password},ip),{codigo:'ENLACE_INVALIDO'});
});

test('incertidumbre SQL de vigencia pausa sin transporte ni otra escritura de finalización',async()=>{
  for(const falloEn of [1,2]){
    const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:e.operador.usuario.email},{ip:'127.0.0.1'});await e.ingreso.procesarUna();
    const validar=e.repository.entregaVigente.bind(e.repository);let consultas=0,finalizaciones=0;
    e.repository.entregaVigente=v=>{if(++consultas===falloEn)throw new ErrorSeguridad(503,'CUENTAS_RESULTADO_INCIERTO','Sin datos');return validar(v);};
    e.repository.finalizarEntrega=()=>{finalizaciones++;assert.fail('No escribir tras incertidumbre de SQL');};
    e.entrega.proveedor=new ResendCorreo({habilitado:true,origen:'https://cuentas.example.invalid',remitente:'acceso@example.invalid',dominioVerificado:'example.invalid',obtenerSecreto:async()=>randomBytes(24).toString('hex'),transportar:()=>assert.fail('No enviar ante incertidumbre')});
    assert.equal((await e.entrega.procesarUna()).estado,'resultado-incierto');assert.equal(finalizaciones,0);
    assert.ok([...e.repository.entregas.values()][0].lease);
  }
});

test('correo incierto seguido de revocación conserva sobre y código en cuarentena, sin reenvío',async()=>{
  const e=await crearEntornoComercialHttp();await e.ingreso.solicitar({email:e.operador.usuario.email},{ip:'127.0.0.1'});await e.ingreso.procesarUna();
  let n=0;e.entrega.proveedor={enviar:()=>{n++;throw Object.assign(Error(),{codigo:'ENTREGA_INCIERTA'});}};
  assert.equal((await e.entrega.procesarUna()).estado,'fallida');
  const entrega=[...e.repository.entregas.values()][0],sobre=structuredClone(entrega.sobre);
  await e.repository.transaccion(tx=>tx.revocarRecuperaciones(2,e.ingreso.ahora()));e.avanzar(60000);
  assert.equal((await e.entrega.procesarUna()).estado,'sin-pendientes');assert.equal(n,1);
  assert.equal(entrega.enCuarentena,true);assert.equal(entrega.codigoFallo,'RESULTADO_INCIERTO');assert.deepEqual(entrega.sobre,sobre);
});
