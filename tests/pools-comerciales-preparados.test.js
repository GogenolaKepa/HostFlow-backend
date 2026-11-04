const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirPoolsComerciales,PERFILES}=require('../src/services/PoolsComercialesPreparados');
const {prepararRuntimeComercial}=require('../src/services/RuntimeComercialPreparado');
const identidades=()=>Object.fromEntries(PERFILES.map(perfil=>[perfil,{tipo:'sql',principal:'hf_prueba_'+perfil}]));
function escenario({fallar,identidadIncorrecta=false,fallarCierre=false}={}){
  const creados=[];
  class ConnectionPool{
    constructor(config){this.config=config;this.indice=creados.length;this.cierres=0;creados.push(this);}
    on(){}
    async connect(){if(this.indice===fallar)throw Error('error sensible del driver');this.connected=true;return this;}
    request(){return{query:async()=>({recordset:[{base:'HostFlow',servidor:'hostflow',motor:5,principal:identidadIncorrecta?'dbo':this.config.user||PERFILES.map(p=>'hf_prueba_'+p)[this.indice]}]})};}
    async close(){this.cierres++;this.connected=false;if(fallarCierre)throw Error('detalle privado');}
  }
  return {driver:{ConnectionPool},creados,obtenerCredencial:async({principal})=>({user:principal,password:'valor exclusivamente ficticio'})};
}
test('importación/default no abre SQL, no pide secretos ni monta runtime',async()=>{
  assert.deepEqual(await abrirPoolsComerciales(),{estado:'inactivo'});
  assert.deepEqual(await prepararRuntimeComercial(),{estado:'inactivo'});
});
test('cuatro pools explícitos, TLS validado y cierre único de todos los perfiles',async()=>{
  const e=escenario(),r=await abrirPoolsComerciales({habilitado:true,...e,identidades:identidades()});
  assert.deepEqual(Object.keys(r.pools),PERFILES);assert.equal(e.creados.length,4);
  for(const p of e.creados){assert.equal(p.config.options.encrypt,true);assert.equal(p.config.options.trustServerCertificate,false);assert.equal(p.config.server,'hostflow.database.windows.net');}
  assert.equal(JSON.stringify(r.consultar()).includes('ficticio'),false);
  await Promise.all([r.cerrar(),r.cerrar()]);assert.ok(e.creados.every(p=>p.cierres===1));
});
test('identidades privilegiadas/duplicadas y tipo inválido fallan antes de pedir credenciales',async()=>{
  for(const cambio of ['HostFlowAdmin','hostflow_app','dbo','guest','public','hostflow_authcom_owner','hf_prueba_correo','nombre;SQL']){
    const ids=identidades();ids.ingresoHttp.principal=cambio;
    await assert.rejects(abrirPoolsComerciales({habilitado:true,driver:escenario().driver,identidades:ids,obtenerCredencial:()=>assert.fail()}),e=>e.codigo==='IDENTIDAD_INVALIDA');
  }
});
test('fallo parcial e identidad inesperada cierran todos los pools sin filtrar el error',async()=>{
  for(const opciones of [{fallar:2},{identidadIncorrecta:true}]){
    const e=escenario(opciones);await assert.rejects(abrirPoolsComerciales({habilitado:true,...e,identidades:identidades()}),v=>!v.message.includes('sensible'));
    assert.ok(e.creados.every(p=>p.cierres===1));
  }
});
test('credencial lenta se aborta sin abrir un pool; cierre fallido queda explícito',async()=>{
  const e=escenario();let abortada=false;
  await assert.rejects(abrirPoolsComerciales({habilitado:true,...e,identidades:identidades(),timeoutMs:100,obtenerCredencial:({signal})=>{signal.addEventListener('abort',()=>{abortada=true;});return new Promise(()=>{});}}));
  assert.equal(abortada,true);assert.equal(e.creados.length,0);
  const f=escenario({fallar:1,fallarCierre:true});await assert.rejects(abrirPoolsComerciales({habilitado:true,...f,identidades:identidades()}),v=>v.codigo==='CIERRE_INCOMPLETO');
});
test('Entra acepta token solo mediante callback explícito y rechaza expiración próxima',async()=>{
  const ids=identidades();for(const i of Object.values(ids))i.tipo='entra';
  const e=escenario();const r=await abrirPoolsComerciales({habilitado:true,...e,identidades:ids,obtenerCredencial:async()=>({token:'token-ficticio-no-real',expiraEn:Date.now()+120000})});
  assert.equal(e.creados[0].config.authentication.type,'azure-active-directory-access-token');await r.cerrar();
  await assert.rejects(abrirPoolsComerciales({habilitado:true,...escenario(),identidades:ids,obtenerCredencial:async()=>({token:'ficticio',expiraEn:Date.now()})}));
});
test('ensamblado rechaza infraestructura faltante, cierra pools y no ofrece handler',async()=>{
  const e=escenario();await assert.rejects(prepararRuntimeComercial({configuracion:{habilitado:true},...e,identidades:identidades()}));assert.ok(e.creados.every(p=>p.cierres===1));
});
test('identidades quedan fijadas antes de cualquier espera asíncrona',async()=>{
  const e=escenario(),ids=identidades();
  const r=await abrirPoolsComerciales({habilitado:true,...e,identidades:ids,obtenerCredencial:async({principal})=>{ids.correo.principal='HostFlowAdmin';return{user:principal,password:'solo-ficticio'};}});
  assert.equal(e.creados[3].config.user,'hf_prueba_correo');await r.cerrar();
});
test('runtime completo prepara contratos existentes, no inicia correo/worker y desactiva antes de cerrar',async()=>{
  const e=escenario();let secretos=0,permiso=1,marcaAlta='authcom-operador-v1';
  class Transaction{async begin(){}async commit(){}async rollback(){}}
  class Request{
    constructor(){this.p={};}input(k,t,v){this.p[k]=arguments.length===2?t:v;return this;}
    async query(q){
      if(q.includes('SELECT DB_NAME'))return{recordset:[{base:'HostFlow',servidor:'hostflow',modelo:'authcom-v1'}]};
      if(q.includes('sp_getapplock'))return{recordset:[{resultado:0}]};
      if(q.includes('name=@nombre'))return{recordset:[{modelo:{HostFlowAuthIngreso:'authcom-ingreso-v1',HostFlowAuthCorreo:'authcom-correo-v1',HostFlowAuthResiliencia:'authcom-resiliencia-v1'}[this.p.nombre]}]};
      if(q.includes('HostFlowAuthAlta'))return{recordset:[{modelo:marcaAlta}]};
      if(q.includes('AS excesivo'))return{recordset:[{excesivo:0}]};
      if(q.includes('HAS_PERMS_BY_NAME'))return{recordset:[{permitido:permiso}]};
      if(q.includes('SELECT IdEmpresa'))return{recordset:[{IdEmpresa:1}]};
      return{recordset:[],rowsAffected:[0]};
    }
  }
  Object.assign(e.driver,{Transaction,Request,DateTime2:()=>{},ISOLATION_LEVEL:{SERIALIZABLE:4}});
  const opciones={...e,identidades:identidades(),
    configuracion:{habilitado:true,sql:{baseEsperada:'HostFlow',servidorEsperado:'hostflow',idEmpresa:1},correo:{origen:'https://cuentas.example.invalid',remitente:'cuentas@example.invalid',dominioVerificado:'example.invalid'}},
    dependencias:{claves:{cifrado:{activa:'ficticia',claves:[{keyId:'ficticia',clave:Buffer.alloc(32,1)}]},indice:Buffer.alloc(32,2)},
      correo:{obtenerSecreto:()=>{secretos++;assert.fail('No leer API key al preparar');},transportar:()=>assert.fail('Sin red')},
      autenticar:()=>{},acreditacion:{referencia:'SOLO-FICTICIO',sqlValidado:true,dominioVerificado:true,recuperacionVerificada:true,seguridadHttpVerificada:true}}};
  const r=await prepararRuntimeComercial(opciones);
  assert.equal(e.creados.length,4);assert.ok(e.creados.every(p=>p.config.connectionTimeout===30000));
  assert.equal(r.estado,'preparado');assert.equal(r.consultar().worker.estado,'detenido');assert.equal(secretos,0);
  r.desactivar();assert.equal(r.consultar().disponible,false);await Promise.all([r.cerrar(),r.cerrar()]);assert.ok(e.creados.every(p=>p.cierres===1));
  opciones.configuracion.sql.altaOperadorRestringida=true;
  const restringido=await prepararRuntimeComercial(opciones);await restringido.cerrar();
  marcaAlta=null;await assert.rejects(prepararRuntimeComercial(opciones));marcaAlta='authcom-operador-v1';
  permiso=0;await assert.rejects(prepararRuntimeComercial(opciones),error=>error.codigo==='PERMISO_COMERCIAL_FALTANTE'&&error.diagnostico.objeto==='authcom.Contactos'&&!JSON.stringify(error.diagnostico).includes('ficticio'));
  assert.ok(e.creados.every(p=>p.cierres===1));
});
