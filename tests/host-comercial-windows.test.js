const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {prepararDependenciasWindows,SECRETOS_ENTORNO}=require('../src/services/DependenciasComercialesWindows');
const {leerConfiguracionComercial}=require('../src/services/ConfiguracionComercialPreparada');
const {origenPublico}=require('../src/security/comercial/origenPublico');
const {ejecutar,opciones}=require('../scripts/iniciarComercialWindows');
const {AutenticacionComercialSql}=require('../src/repositories/AutenticacionComercialSql');
const env=()=>({HOSTFLOW_AUTH_COMERCIAL_ENABLED:'1',HOSTFLOW_AUTH_SOURCE:'sql',HOST:'127.0.0.1',DB_SERVER:'hostflow.database.windows.net',DB_DATABASE:'HostFlow',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_AUTH_COMERCIAL_ORIGEN:'https://hostflow.com.ar',HOSTFLOW_AUTH_COMERCIAL_REMITENTE:'seguridad@hostflow.com.ar',HOSTFLOW_AUTH_COMERCIAL_DOMINIO:'hostflow.com.ar',HOSTFLOW_AUTH_COMERCIAL_PROXIES:'127.0.0.1,::1',HOSTFLOW_CORS_ORIGINS:'https://hostflow.com.ar',HOSTFLOW_AUTH_COMERCIAL_KEY_ID:'ficticia-1',HOSTFLOW_AUTH_COMERCIAL_CIFRADO_BASE64:Buffer.alloc(32,1).toString('base64'),HOSTFLOW_AUTH_COMERCIAL_INDICE_BASE64:Buffer.alloc(32,2).toString('base64')});
const acreditacion={referencia:'LABORATORIO-FICTICIO',sqlValidado:true,dominioVerificado:true,recuperacionVerificada:true,seguridadHttpVerificada:true};
const crear=o=>prepararDependenciasWindows({aprobacion:true,env:env(),acreditacion,driver:{ConnectionPool:class{}},obtenerCredencial:()=>assert.fail('Sin SQL'),transportar:()=>assert.fail('Sin red'),obtenerSecretoCorreo:async()=>'CLAVE_ENTERAMENTE_FICTICIA',...o});

test('puerto externo obligatorio rechaza fallback del entorno y remitentes fuera del host autorizado',()=>{
 assert.throws(()=>crear({obtenerSecretoCorreo:undefined}));
 const e=env();e.RESEND_API_KEY='VALOR_EXCLUSIVAMENTE_FICTICIO';assert.throws(()=>crear({env:e}));
 assert.throws(()=>crear({env:{...env(),HOSTFLOW_AUTH_COMERCIAL_REMITENTE:'otra@hostflow.com.ar'}}));
});
test('host y launcher inactivos por defecto: importar no abre SQL ni recupera secretos',()=>{
 assert.equal(prepararDependenciasWindows().estado,'inactivo');assert.equal(prepararDependenciasWindows({aprobacion:true}).estado,'inactivo');
 assert.throws(()=>opciones([]));assert.throws(()=>opciones(['--activar-comercial']));
 assert.ok(!Object.keys(require.cache).some(n=>/[\\/]config[\\/]database\.js$/.test(n)));
});
test('origen de enlaces rechaza HTTP, localhost, intranet, IP, rutas, credenciales y redirecciones',()=>{
 for(const url of ['http://cuentas.example.invalid','https://localhost','https://x.localhost','https://intranet','https://127.0.0.1','https://[::1]','https://x.local','https://x.internal','https://usuario:clave@cuentas.example.invalid','https://cuentas.example.invalid/callback','https://cuentas.example.invalid?next=https://otra.invalid','https://cuentas.example.invalid#token=x'])assert.throws(()=>origenPublico(url),url);
 assert.equal(origenPublico('https://cuentas.example.invalid'),'https://cuentas.example.invalid');
 assert.equal(leerConfiguracionComercial(env()).sql.altaOperadorRestringida,true);
});
test('faltan Resend, claves, CORS, proxy o acreditación: bloqueo antes de usar credenciales SQL',()=>{
 for(const clave of [...SECRETOS_ENTORNO.filter(k=>k!=='RESEND_API_KEY'),'HOSTFLOW_AUTH_COMERCIAL_KEY_ID','HOSTFLOW_CORS_ORIGINS','HOSTFLOW_AUTH_COMERCIAL_PROXIES']){const e=env();delete e[clave];assert.throws(()=>crear({env:e}),clave);}
 assert.throws(()=>crear({acreditacion:{...acreditacion,sqlValidado:false}}));
 const e=env();e.HOSTFLOW_AUTH_COMERCIAL_INDICE_BASE64=e.HOSTFLOW_AUTH_COMERCIAL_CIFRADO_BASE64;assert.throws(()=>crear({env:e}));
});
test('composición fija cuatro identidades y SQL18, sin iniciar worker ni consultar API key al importar',async()=>{
 const d=crear(),op=d.comercial.dependencias;
 assert.deepEqual(Object.values(op.identidades).map(x=>x.principal),['hostflow_auth_ingreso','hostflow_auth_worker','hostflow_auth_cuentas','hostflow_auth_correo']);
 assert.equal(op.dependencias.sql.altaOperadorRestringida,true);assert.equal(await op.dependencias.correo.obtenerSecreto(),'CLAVE_ENTERAMENTE_FICTICIA');
 d.liberar();d.liberar();assert.ok(op.dependencias.claves.indice.every(b=>b===0));assert.ok(op.dependencias.claves.cifrado.claves[0].clave.every(b=>b===0));await assert.rejects(op.dependencias.correo.obtenerSecreto());
});
const args=['--activar-comercial','--ventana-confirmada','--iniciar-worker','--cuenta','PC-ESCRITORIO\\Kepa','--acreditacion','ficticia.json'];
function puertos(o={}){
 const p=new EventEmitter();Object.assign(p,{platform:'win32',stdin:{isTTY:true},stderr:{isTTY:true,write(){}}});
 const a={servidores:0,worker:0,cierres:0,sqlCierres:0,lectores:0,credenciales:0};
 const lector=async()=>{a.credenciales++;assert.fail('Sin lectura DPAPI en estas pruebas');};lector.consultarIdentidad=async()=>({cuenta:o.cuenta??'PC-ESCRITORIO\\Kepa'});
 let contrato;
 return{a,p,env:env(),driver:{ConnectionPool:class{}},proceso:p,leerAcreditacion:()=>acreditacion,crearLector:()=>{a.lectores++;return lector;},crearProveedorCorreo:()=>({abrir:async binding=>({...binding,permisosAcreditados:true,leer:async()=>Buffer.from('CLAVE_ENTERAMENTE_FICTICIA'),cerrar:async()=>{}})}),transportar:()=>assert.fail('Sin red'),
  iniciarServidor:async c=>{a.servidores++;contrato=c;if(o.arranque)throw Error('detalle privado');return{listening:true,close(cb){a.cierres++;this.listening=false;cb();},comercial:{estado:'preparado',desactivar(){},cerrar:async()=>{if(o.cierre)throw Error('privado');},iniciarWorker(){a.worker++;return new Promise(()=>{});}}};},
  cerrarSQLPrincipal:async()=>{a.sqlCierres++;},contrato:()=>contrato,
 };
}

test('proveedor CLI y factory simultáneos se rechazan antes del lector',async()=>{
 const p=puertos();await assert.rejects(ejecutar([...args,'--proveedor-correo','no-leer-ficticio.json'],p));
 assert.equal(p.a.lectores,0);assert.equal(p.a.servidores,0);
});
test('cuenta Windows distinta: no iniciar servidor/worker ni solicitar credenciales',async()=>{
 const p=puertos({cuenta:'OTRA\\Cuenta'});await assert.rejects(ejecutar(args,p),e=>!e.message.includes('OTRA'));
 assert.equal(p.a.servidores,0);assert.equal(p.a.worker,0);assert.equal(p.a.credenciales,0);
});
test('configuración incompleta: no invocar siquiera el lector nativo',async()=>{
 const p=puertos();delete p.env.HOSTFLOW_AUTH_COMERCIAL_KEY_ID;await assert.rejects(ejecutar(args,p));assert.equal(p.a.lectores,0);assert.equal(p.a.servidores,0);
});
test('arranque simulado inyecta dependencias; cierre idempotente limpia entorno propio y servidor',async()=>{
 const p=puertos(),h=await ejecutar(args,p);assert.equal(p.a.servidores,1);assert.equal(p.a.worker,1);assert.equal(p.contrato().dependencias.dependencias.sql.altaOperadorRestringida,true);
 for(const k of SECRETOS_ENTORNO)assert.equal(p.env[k],undefined);
 assert.deepEqual(await h.cerrar(),{cerrado:true});assert.deepEqual(await h.cerrar(),{cerrado:true});assert.equal(p.a.cierres,1);assert.equal(p.a.sqlCierres,1);assert.equal(p.p.listenerCount('SIGINT'),0);
});

test('ninguna clave AES/HMAC se hereda al primer auxiliar, ni siquiera para consultar identidad',async()=>{
 const p=puertos(),crear=p.crearLector;
 p.crearLector=()=>{
  for(const k of SECRETOS_ENTORNO)assert.equal(p.env[k],undefined);
  const lector=crear(),identidad=lector.consultarIdentidad;
  lector.consultarIdentidad=async()=>{for(const k of SECRETOS_ENTORNO)assert.equal(p.env[k],undefined);return identidad();};
  return lector;
 };
 const h=await ejecutar(args,p);assert.equal(p.a.lectores,1);assert.deepEqual(await h.cerrar(),{cerrado:true});
});
test('fallo de arranque o cierre nunca se presenta como una sesión sana',async()=>{
 const p=puertos({arranque:true});await assert.rejects(ejecutar(args,p));assert.equal(p.a.worker,0);
 const q=puertos({cierre:true}),h=await ejecutar(args,q);assert.deepEqual(await h.cerrar(),{cerrado:false});assert.equal(q.a.cierres,1);assert.equal(q.a.sqlCierres,1);
});
test('el cierre drena HTTP antes de cerrar SQL y no duplica el cierre',async()=>{
 const p=puertos(),orden=[];let terminarHttp;
 p.iniciarServidor=async()=>({listening:true,close(cb){orden.push('http');terminarHttp=()=>cb();},comercial:{estado:'preparado',desactivar(){orden.push('desactivar');},cerrar:async()=>{orden.push('pools-comerciales');},iniciarWorker:()=>new Promise(()=>{})}});
 p.cerrarSQLPrincipal=async()=>{orden.push('pool-principal');};
 const h=await ejecutar(args,p),fin=h.cerrar();await Promise.resolve();
 assert.deepEqual(orden,['desactivar','http']);terminarHttp();assert.deepEqual(await fin,{cerrado:true});
 await h.cerrar();assert.deepEqual(orden,['desactivar','http','pools-comerciales','pool-principal']);
});
test('HTTP de cierre incierto bloquea el cierre SQL prematuro y no se declara cerrado',async()=>{
 const p=puertos();let comercial=0,principal=0;
 p.iniciarServidor=async()=>({listening:true,close(cb){cb(Error('DETALLE_FICTICIO_PRIVADO'));},comercial:{estado:'preparado',desactivar(){},cerrar:async()=>{comercial++;},iniciarWorker:()=>new Promise(()=>{})}});
 p.cerrarSQLPrincipal=async()=>{principal++;};const h=await ejecutar(args,p);
 const resultado=await h.cerrar();assert.deepEqual(resultado,{cerrado:false});assert.equal(comercial,0);assert.equal(principal,0);assert.ok(!JSON.stringify(resultado).includes('PRIVADO'));
});
test('el único alta SQL emitido es el procedimiento SQL18; auditoría no se duplica',async()=>{
 const consultas=[];class Transaction{async begin(){}async commit(){}async rollback(){}}
 class Request{constructor(){this.p={};}input(k,t,v){this.p[k]=arguments.length===2?t:v;return this;}async query(sql){consultas.push({sql,p:this.p});if(sql.includes('SELECT DB_NAME'))return{recordset:[{base:'HostFlow',servidor:'hostflow',modelo:'authcom-v1'}]};if(sql.includes('sp_getapplock'))return{recordset:[{resultado:0}]};if(sql.startsWith('EXEC authcom.CrearOperadorInvitado'))return{recordset:[{id:71}]};return{recordset:[]};}}
 const config={pool:{},driver:{Transaction,Request,DateTime2:()=>{},ISOLATION_LEVEL:{SERIALIZABLE:4}},habilitado:true,baseEsperada:'HostFlow',servidorEsperado:'hostflow',idEmpresa:1};
 const repo=new AutenticacionComercialSql(config);
 await repo.transaccion(async tx=>{assert.equal(await tx.crearInvitado({rol:'Operador',desafioId:'ficticio',consumidaEn:123,passwordHash:'hash-ficticio'}),71);await tx.auditar({tipo:'INVITACION_ACEPTADA',usuarioId:71});});
 const alta=consultas.filter(x=>x.sql.startsWith('EXEC authcom.CrearOperadorInvitado'));assert.equal(alta.length,1);assert.deepEqual(Object.keys(alta[0].p),['desafio','empresa','consumida','hash']);assert.equal(alta[0].p.empresa,1);
 assert.ok(!consultas.some(x=>/INSERT dbo\.Usuarios|INSERT authcom\.Auditoria/.test(x.sql)));
 await assert.rejects(new AutenticacionComercialSql({...config,altaOperadorRestringida:false}).transaccion(tx=>tx.crearInvitado({rol:'Operador'})),e=>e.codigo==='ALTA_SQL_NO_ACREDITADA');
 await assert.rejects(repo.transaccion(tx=>tx.crearInvitado({rol:'Administrador'})));
});

// Regresión del camino real de cierre: el poolPromise rechazado no impide close.
for(const falloCierre of [false,true])test('cierre por cache tras conexión rechazada; fallo de close='+falloCierre,async()=>{
 const id=require.resolve('../src/config/database'),previo=require.cache[id];
 const rechazada=Promise.reject(Error('FICTICIO_PRIVADO_SQL'));rechazada.catch(()=>{});
 let cierres=0;require.cache[id]={id,filename:id,loaded:true,exports:{poolPromise:rechazada,cerrarPool:async()=>{cierres++;if(falloCierre)throw Error('FICTICIO_PRIVADO_CIERRE');}}};
 try{
  const p=puertos({arranque:true});delete p.cerrarSQLPrincipal;
  await assert.rejects(ejecutar(args,p),e=>e.codigo===(falloCierre?'CIERRE_NO_ACREDITADO':undefined)&&!e.message.includes('FICTICIO_PRIVADO'));
  assert.equal(cierres,1);assert.equal(p.a.worker,0);
 }finally{if(previo)require.cache[id]=previo;else delete require.cache[id];}
});
