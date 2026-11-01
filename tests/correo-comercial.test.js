const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const {ResendCorreo}=require('../src/security/comercial/ResendCorreo');
const {crearPlantillaCorreo}=require('../src/security/comercial/plantillasCorreo');
const {crearAnilloClavesCorreo}=require('../src/security/comercial/AnilloClavesCorreo');
const {crearToken}=require('../src/security/comercial/credencialesTemporales');
const {EntregaCorreoSeguridad}=require('../src/security/comercial/EntregaCorreoSeguridad');
const {CuentasComercialesAisladas}=require('./helpers/cuentasComercialesAisladas');
const {prepararIntegracionComercial}=require('../src/services/IntegracionComercialPreparada');
const origen='https://cuentas.example.invalid';
const payload=()=>({destinatario:'persona@example.invalid',plantilla:'recuperacion',enlace:`${origen}/cuenta/recuperacion#token=${crearToken('recuperacion').token}`,idempotencyKey:randomUUID()});
function proveedor(extra={}){return new ResendCorreo({origen,remitente:'acceso@example.invalid',dominioVerificado:'example.invalid',obtenerSecreto:async()=>randomBytes(24).toString('hex'),transportar:async()=>({status:200,json:async()=>({id:randomUUID()})}),...extra});}
test('proveedor cerrado por defecto: no lee secretos ni realiza red',async()=>{
  let llamados=0;const p=proveedor({obtenerSecreto:()=>{llamados++;},transportar:()=>{llamados++;}});
  await assert.rejects(p.enviar(payload()),{codigo:'CORREO_INACTIVO'});assert.equal(llamados,0);
});
test('HTTPS fijo, redirecciones cerradas y misma clave/payload para reenvío controlado',async()=>{
  const llamadas=[];const p=proveedor({habilitado:true,obtenerSecreto:async()=>randomBytes(24).toString('hex'),transportar:async(url,options)=>{llamadas.push({url,options});return{status:200,json:async()=>({id:randomUUID()})};}});
  const v=payload();assert.equal((await p.enviar(v)).estado,'aceptada');await p.enviar(v);
  assert.equal(llamadas.length,2);assert.equal(llamadas[0].url,'https://api.resend.com/emails');assert.equal(llamadas[0].options.redirect,'error');
  assert.equal(llamadas[0].options.headers['Idempotency-Key'],llamadas[1].options.headers['Idempotency-Key']);assert.equal(llamadas[0].options.body,llamadas[1].options.body);
  assert.deepEqual(JSON.parse(llamadas[0].options.body).to,['persona@example.invalid']);
});
test('timeout, rechazo y respuesta incompleta son sanitizados sin reintento interno',async()=>{
  let intentos=0;
  const p=proveedor({habilitado:true,timeoutMs:100,transportar:()=>{intentos++;return new Promise(()=>{});}});
  await assert.rejects(p.enviar(payload()),{codigo:'ENTREGA_INCIERTA'});assert.equal(intentos,1);
  for(const respuesta of[{status:429,json:()=>assert.fail('No leer errores sensibles')},{status:200,json:async()=>({message:'contenido privado'})}]){
    await assert.rejects(proveedor({habilitado:true,transportar:async()=>respuesta}).enviar(payload()),e=>!e.message.includes('privado'));
  }
});
test('timeout incluye el secreto y una respuesta tardía no dispara un envío',async()=>{
  let liberar,llamadas=0,signal;
  const p=proveedor({habilitado:true,timeoutMs:100,obtenerSecreto:op=>{signal=op.signal;return new Promise(r=>liberar=r);},transportar:()=>{llamadas++;assert.fail('No enviar después del timeout del secreto');}});
  await assert.rejects(p.enviar(payload()),e=>e.codigo==='CONFIGURACION_CORREO_INVALIDA'&&e.politica==='cuarentena');
  assert.equal(signal.aborted,true);liberar(randomBytes(24).toString('hex'));await Promise.resolve();await Promise.resolve();assert.equal(llamadas,0);
});
test('plantillas profesionales cerradas: recuperación, invitación y aviso sin passwords',()=>{
  const a=payload();const b={...a,plantilla:'invitacion',enlace:`${origen}/cuenta/invitacion#token=${crearToken('invitacion').token}`};
  for(const v of[a,b,{destinatario:a.destinatario,plantilla:'seguridad-cuenta',evento:'recuperacion'}]){
    const r=crearPlantillaCorreo(v,origen);assert.match(r.html,/lang="es"/);assert.match(r.html,/max-width:560px/);assert.match(r.text,/HostFlow/);assert.doesNotMatch(r.html,/<img|<script/i);
  }
  const aviso=crearPlantillaCorreo({destinatario:a.destinatario,plantilla:'seguridad-cuenta',evento:'recuperacion'},origen);assert.ok(!aviso.html.includes('#token='));
  for(const enlace of['http://cuentas.example.invalid/cuenta/recuperacion#token=x',a.enlace.replace('cuentas.example.invalid','hostil.invalid'),a.enlace+'&otro=x'])assert.throws(()=>crearPlantillaCorreo({...a,enlace},origen));
  assert.throws(()=>crearPlantillaCorreo({...a,plantilla:'arbitraria'},origen));
});
test('rotación conserva sobres previos, usa clave activa y rechaza traslado/clave ausente',()=>{
  const vieja={clave:randomBytes(32),keyId:'vieja'},nueva={clave:randomBytes(32),keyId:'nueva'};
  const previo=crearAnilloClavesCorreo({activa:'vieja',claves:[vieja]});const id=randomUUID(),sobre=previo.sellar({dato:'ficticio'},id);
  const rotado=crearAnilloClavesCorreo({activa:'nueva',claves:[vieja,nueva]});assert.deepEqual(rotado.abrir(sobre,id),{dato:'ficticio'});assert.equal(rotado.sellar({},id).keyId,'nueva');
  assert.throws(()=>rotado.abrir(sobre,randomUUID()));assert.throws(()=>crearAnilloClavesCorreo({activa:'nueva',claves:[nueva]}).abrir(sobre,id));
});
test('cuota durable entre workers bloquea antes de enviar y revierte el lease',async()=>{
  const repository=new CuentasComercialesAisladas();let enviados=0;
  const protector=crearAnilloClavesCorreo({activa:'test',claves:[{keyId:'test',clave:randomBytes(32)}]});
  for(let n=0;n<2;n++){const id=randomUUID();await repository.encolar({id,expiraEn:Date.now()+600000,sobre:protector.sellar(payload(),id)});}
  const config={repository,protector,proveedor:{enviar:async()=>{enviados++;}},limiteDiario:1};
  const r=await Promise.all([new EntregaCorreoSeguridad(config).procesarUna(),new EntregaCorreoSeguridad(config).procesarUna()]);
  assert.deepEqual(r.map(x=>x.estado).sort(),['entregada','limite-alcanzado']);assert.equal(enviados,1);
  assert.equal([...repository.entregas.values()].filter(e=>e.estado==='pendiente'&&e.intentos===0).length,1);
});
test('composición inactiva sin side effects y activación exige acreditaciones de servidor',async()=>{
  const inactiva=await prepararIntegracionComercial();assert.deepEqual(inactiva,{estado:'inactiva'});
  assert.equal(inactiva.handler,undefined);await assert.rejects(prepararIntegracionComercial({habilitado:true}));
  const fs=require('node:fs'),path=require('node:path');
  for(const f of ['app.js','server.js','routes/authRoutes.js'])assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),/IntegracionComercialPreparada|ResendCorreo|cuentasComercialesAisladas/);
});
test('cableado prepara puertos y pausa/desactiva sin montar rutas; permisos faltantes bloquean',async()=>{
  const consultas=[];let permiso=1,secretos=0,falloWorker=false,excesivo=0,puerta,inicio,faltaColumna,rolExcesivo,autoridadIncierta=false,fronteraIncierta=false;
  class Transaction{async begin(){}async commit(){}async rollback(){}}
  class Request{
    constructor(){this.params={};}
    input(k,t,v){this.params[k]=arguments.length===2?t:v;return this;}
    async query(q){
      consultas.push(q);
      if(falloWorker&&q.includes('authcom.Ingresos')&&q.includes('UPDATE'))throw Error('Fallo ficticio de persistencia');
      if(puerta&&q.includes(';WITH siguiente AS')&&q.includes('authcom.Ingresos')){inicio();await puerta;}
      if(q.includes('SELECT DB_NAME'))return{recordset:[{base:'Test',servidor:'test',modelo:'authcom-v1'}]};
      if(q.includes('sp_getapplock'))return{recordset:[{resultado:0}]};
      if(q.includes('name=@nombre'))return{recordset:[{modelo:this.params.nombre==='HostFlowAuthIngreso'?'authcom-ingreso-v1':this.params.nombre==='HostFlowAuthResiliencia'?'authcom-resiliencia-v1':'authcom-correo-v1'}]};
      if(q.includes('IS_ROLEMEMBER')&&this.params.rol===rolExcesivo)return{recordset:[{excesivo:1}]};
      if(q.includes('CASE WHEN EXISTS')&&autoridadIncierta)return{recordset:[{excesivo:null}]};
      if(q.includes('CASE WHEN OBJECT_ID')&&fronteraIncierta)return{recordset:[{excesivo:null}]};
      if(q.includes('AS excesivo'))return{recordset:[{excesivo}]};
      if(q.includes('HAS_PERMS_BY_NAME')){
        // Perfiles mínimos: SELECT de columnas, SIN SELECT de tabla completo.
        if(this.params.permiso==='SELECT'&&['dbo.Roles','dbo.Empresas','dbo.Usuarios'].includes(this.params.objeto)&&(!this.params.columna||this.params.columna===faltaColumna))return{recordset:[{permitido:0}]};
        return{recordset:[{permitido:permiso}]};
      }
      if(q.includes('SELECT IdEmpresa'))return{recordset:[{IdEmpresa:1}]};
      if(q.includes('HostFlowAuthIngreso'))return{recordset:[{modelo:'authcom-ingreso-v1'}]};
      if(q.includes('HostFlowAuthCorreo'))return{recordset:[{modelo:'authcom-correo-v1'}]};
      if(q.includes('HostFlowAuthResiliencia'))return{recordset:[{modelo:'authcom-resiliencia-v1'}]};
      return{recordset:[],rowsAffected:[0]};
    }
  }
  const config={habilitado:true,sql:{driver:{Transaction,Request,DateTime2:()=>{},ISOLATION_LEVEL:{SERIALIZABLE:1}},baseEsperada:'Test',servidorEsperado:'test',idEmpresa:1},
    pools:{cuentas:{},ingresoHttp:{},workerIngreso:{},correo:{}},claves:{cifrado:{activa:'activa',claves:[{keyId:'activa',clave:randomBytes(32)}]},indice:randomBytes(32)},
    correo:{origen,remitente:'cuentas@example.invalid',dominioVerificado:'example.invalid',obtenerSecreto:()=>{secretos++;return randomBytes(24).toString('hex');},transportar:()=>assert.fail('Sin entregas no debe existir red')},
    autenticar:()=>{},acreditacion:{referencia:'prueba-ficticia',sqlValidado:true,dominioVerificado:true,recuperacionVerificada:true,seguridadHttpVerificada:true}};
  const integracion=await prepararIntegracionComercial(config);assert.equal(integracion.estado,'preparada');assert.equal(typeof integracion.handler,'function');
  assert.deepEqual(await integracion.procesarUna(),{ingreso:{estado:'sin-pendientes'},correo:{estado:'sin-pendientes'}});assert.equal(secretos,0);
  integracion.desactivar();assert.deepEqual(await integracion.procesarUna(),{estado:'pausada'});
  let estado;const res={status:n=>{estado=n;return res;},set:()=>res,json:()=>res};integracion.handler({},res,()=>assert.fail());assert.equal(estado,503);
  const conFallo=await prepararIntegracionComercial(config);falloWorker=true;
  assert.deepEqual(await conFallo.procesarUna(),{estado:'pausada-por-error'});conFallo.handler({},res,()=>assert.fail());assert.equal(estado,503);
  assert.deepEqual(await conFallo.procesarUna(),{estado:'pausada'});
  falloWorker=false;
  const conCierre=await prepararIntegracionComercial(config);let liberar,iniciada;
  puerta=new Promise(r=>liberar=r);const esperada=new Promise(r=>iniciada=r);inicio=iniciada;
  const operacion=conCierre.procesarUna();await esperada;let cerro=false;const cierre=conCierre.cerrar().then(()=>{cerro=true;});
  await Promise.resolve();assert.equal(cerro,false);liberar();assert.equal((await operacion).correo.estado,'pausada');await cierre;puerta=null;
  excesivo=1;await assert.rejects(prepararIntegracionComercial(config));excesivo=0;
  rolExcesivo='db_datareader';await assert.rejects(prepararIntegracionComercial(config));rolExcesivo=undefined;
  autoridadIncierta=true;await assert.rejects(prepararIntegracionComercial(config));autoridadIncierta=false;
  fronteraIncierta=true;await assert.rejects(prepararIntegracionComercial(config));fronteraIncierta=false;
  for(const columna of ['EmailNormalizado','PasswordHash','Nombre','Activo','IdEmpresa']){
    faltaColumna=columna;await assert.rejects(prepararIntegracionComercial(config));
  }
  faltaColumna=undefined;
  permiso=0;await assert.rejects(prepararIntegracionComercial(config),e=>e.codigo==='PERMISO_COMERCIAL_FALTANTE'&&e.diagnostico.perfil==='cuentas'&&e.diagnostico.objeto==='authcom.Contactos'&&e.diagnostico.resultado==='denegado');
  permiso=null;await assert.rejects(prepararIntegracionComercial(config),e=>e.codigo==='PERMISO_COMERCIAL_FALTANTE'&&e.diagnostico.resultado==='no-acreditado');
  assert.ok(consultas.some(q=>q.includes('HAS_PERMS_BY_NAME')));
});
