const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {UsuariosAislados}=require('./helpers/usuariosAislados');
const UsuarioService=require('../src/services/UsuarioService');
const {AuthService}=require('../src/services/AuthService');
const {NotificacionService,contextoNotificaciones}=require('../src/services/NotificacionService');
const {ErrorSeguridad}=require('../src/security/seguridadUsuarios');
const {TIPOS_PREFERENCIA}=require('../src/config/notificaciones');
const secret=randomBytes(32).toString('hex');process.env.JWT_SECRET=secret;
const usuarios=new UsuariosAislados(),preferencias=new Map();
let lecturas=0,escrituras=0,habilitada=false,editable=false,fallar=false,revision=0,admin,operador,personal=false,revocarDuranteConsulta=false;
let entregas=[],confirmacionIncompleta=false;
const repository={usuarios,
  async avisos(f){lecturas++;if(fallar)throw Error('Driver privado que nunca debe serializarse.');return {total:1,filas:[{idAlerta:7,tipo:'CONFLICTO_RESERVAS',prioridad:'Alta',fecha:'2026-10-15T13:00:00Z',titulo:'Texto sensible',mensaje:'importe privado',datos:{monto:999999,correo:'privado@example.invalid'}}]};},
  async comprobarModelo(){lecturas++;},
  async listarPersonales(id,empresa,filtros,tipos){
    lecturas++;const todas=entregas.filter(r=>r.idUsuario===id&&r.idEmpresa===empresa&&tipos.includes(r.tipo));
    const hasta=filtros.cursor?.hasta??todas[0]?.idEntrega??null;
    const filas=todas.filter(r=>(filtros.tipo==='todas'||r.tipo===filtros.tipo)&&(filtros.prioridad==='todas'||r.prioridad===filtros.prioridad)&&(filtros.estado==='todas'||(filtros.estado==='noLeidas'?r.fechaLectura===null:r.fechaLectura!==null))&&BigInt(r.idEntrega)<=BigInt(hasta)&&(!filtros.cursor||BigInt(r.idEntrega)<BigInt(filtros.cursor.antes))).slice(0,filtros.limite+1);
    if(revocarDuranteConsulta)usuarios.filas.get(id).versionSesion++;
    return {hasta,filas:structuredClone(filas)};
  },
  async contarPersonales(id,empresa,tipos){lecturas++;return entregas.filter(r=>r.idUsuario===id&&r.idEmpresa===empresa&&tipos.includes(r.tipo)&&r.fechaLectura===null).length;},
  async marcarPersonalLeida(id,empresa,notificacion,rev,tipos){
    const r=entregas.find(r=>r.idUsuario===id&&r.idEmpresa===empresa&&r.idNotificacion===notificacion&&tipos.includes(r.tipo));
    if(!r)throw new ErrorSeguridad(404,'NOTIFICACION_NO_DISPONIBLE','No disponible.');
    if(r.fechaLectura===null){if(r.versionRegistro!==rev)throw new ErrorSeguridad(409,'NOTIFICACIONES_CONFLICTO','Revisión desactualizada.');r.fechaLectura='2026-10-15T15:00:00Z';r.versionRegistro=(++revision).toString(16).padStart(16,'0');escrituras++;}return structuredClone(r);
  },
  async preferencias(id){lecturas++;if(revocarDuranteConsulta)usuarios.filas.get(id).versionSesion++;return structuredClone(preferencias.get(id)||[]);},
  async guardarPreferencias(id,lista){
    const anteriores=preferencias.get(id)||[];
    for(const p of lista){const row=anteriores.find(x=>x.tipo===p.tipo);if((row?.versionRegistro??null)!==p.versionRegistro)throw new ErrorSeguridad(409,'NOTIFICACIONES_CONFLICTO','Conflicto');}
    const saved=lista.map(p=>({...p,versionRegistro:(++revision).toString(16).padStart(16,'0')}));
    preferencias.set(id,saved);escrituras++;return confirmacionIncompleta?[]:saved;
  },
  async transaccion(fn){return usuarios.transaccionSeguridad(async()=>{const copia=new Map(preferencias),copiaEntregas=structuredClone(entregas);try{return await fn(repository);}catch(e){preferencias.clear();for(const [k,v]of copia)preferencias.set(k,v);entregas=copiaEntregas;throw e;}});},
};
const auth=new AuthService({origen:'sql',repository:usuarios,cuentas:new UsuarioService(usuarios,{cost:4}),secret:()=>secret});
require.cache[require.resolve('../src/services/AuthService')].exports=auth;
require.cache[require.resolve('../src/services/NotificacionService')].exports=new NotificacionService({repository,personales:()=>personal,contexto:w=>contextoNotificaciones(w,{HOSTFLOW_AUTH_SOURCE:'sql',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_NOTIFICACIONES_SQL_ENABLED:habilitada?'1':'0',HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED:editable?'1':'0'})});
const db=require.resolve('../src/config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:new Proxy({},{get(){throw Error('SQL real prohibido.');}})};
for(const file of fs.readdirSync(path.join(__dirname,'../src/controllers'))){if(['AuthController.js','UsuarioController.js','NotificacionController.js'].includes(file))continue;const id=require.resolve(`../src/controllers/${file}`);require.cache[id]={id,filename:id,loaded:true,exports:new Proxy({},{get(){return()=>{throw Error('Negocio no autorizado en esta prueba.');};}})};}
const upload=require.resolve('../src/middlewares/propiedadImagenUpload');require.cache[upload]={id:upload,filename:upload,loaded:true,exports:{array:()=> (_req,_res,next)=>next()}};
const app=require('../src/app');let server,url;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/notificaciones`;});
after(()=>new Promise(r=>server.close(r)));
beforeEach(async()=>{usuarios.filas.clear();usuarios.numeroRevision=0;preferencias.clear();admin=await usuarios.agregar({id:1});operador=await usuarios.agregar({id:2,rol:'Operador'});lecturas=0;escrituras=0;revision=0;habilitada=false;editable=false;fallar=false;personal=false;revocarDuranteConsulta=false;confirmacionIncompleta=false;
  entregas=[2,1].flatMap(idUsuario=>[4,3,2,1].map(n=>({idUsuario,idEmpresa:1,idEntrega:String(9007199254741000n+BigInt(idUsuario*10+n)),idNotificacion:String(n),tipo:'RESERVA_NUEVA',prioridad:'Alta',fecha:'2026-10-15T13:00:00Z',fechaLectura:null,versionRegistro:'0000000000000001',datos:{importe:999999}})));
});
const token=async u=>(await auth.login(u.usuario.email,u.password)).token;
async function pedir(method,ruta,jwt,body){const r=await fetch(url+ruta,{method,headers:{'content-type':'application/json',...(jwt?{authorization:`Bearer ${jwt}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:method==='HEAD'?null:await r.json(),headers:r.headers};}
const payload=lista=>({preferencias:lista.map(({tipo,habilitada,versionRegistro})=>({tipo,habilitada,versionRegistro}))});

test('Notificaciones: JWT obligatorio, cambio de contraseña y revocación antes de consultar',async()=>{
  for(const [method,ruta]of [['GET','/avisos'],['GET','/preferencias'],['PUT','/preferencias']])assert.equal((await pedir(method,ruta)).status,401);
  const jwt=await token(operador);usuarios.filas.get(2).debeCambiarPassword=true;
  assert.equal((await pedir('GET','/avisos',jwt)).status,403);usuarios.filas.get(2).debeCambiarPassword=false;usuarios.filas.get(2).versionSesion++;
  assert.equal((await pedir('GET','/avisos',jwt)).status,401);assert.equal(lecturas,0);
});
test('Notificaciones: ambos roles reciben solo DTO seguro sin economía, lecturas personales o escrituras',async()=>{
  for(const u of [admin,operador]){const r=await pedir('GET','/avisos',await token(u));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.data.lecturaPersonal,false);
    const texto=JSON.stringify(r.data);for(const s of ['Texto sensible','importe privado','999999','privado@example.invalid','datos','mensaje'])assert.equal(texto.includes(s),false);
    assert.equal(r.data.avisos[0].titulo,'Conflicto de disponibilidad');}
  assert.equal(escrituras,0);assert.equal(lecturas,2);
});
test('Notificaciones: query cerrada, límites y método no permitido antes de SQL',async()=>{
  const jwt=await token(operador);
  for(const q of ['?idUsuario=1','?idEmpresa=2','?pagina=0','?pagina=1&pagina=2','?limite=51','?categoria=sistema','?prioridad=Urgente','?pagina=1%3BDROP'])assert.equal((await pedir('GET','/avisos'+q,jwt)).status,400);
  assert.equal((await pedir('PATCH','/avisos',jwt,{})).status,403);assert.equal(lecturas,0);
  assert.equal((await pedir('HEAD','/avisos',jwt)).status,200);assert.equal(escrituras,0);
});
test('Preferencias: bandera apagada y escritura separada no acceden a tablas nuevas',async()=>{
  const jwt=await token(operador);
  for(const method of ['GET','PUT']){const r=await pedir(method,'/preferencias',jwt,method==='PUT'?{}:undefined);assert.equal(r.status,503);assert.equal(r.data.codigo,'NOTIFICACIONES_NO_ACTIVADAS');}
  assert.equal(lecturas,0);assert.equal(escrituras,0);habilitada=true;
  assert.equal((await pedir('PUT','/preferencias',jwt,{})).data.codigo,'NOTIFICACIONES_SOLO_LECTURA');assert.equal(lecturas,0);
  const r=await pedir('GET','/preferencias',jwt);assert.equal(r.status,200);assert.equal(r.data.estado.soloLectura,true);assert.ok(r.data.preferencias.every(p=>p.persistida===false&&p.versionRegistro===null));assert.equal(escrituras,0);
});
test('Preferencias: identidad siempre propia, alta explícita y conflicto con rollback',async()=>{
  habilitada=true;editable=true;const jwt=await token(operador),a=await token(admin);
  const datos=(await pedir('GET','/preferencias',jwt)).data;
  assert.equal((await pedir('GET','/preferencias?idUsuario=1',jwt)).status,400);
  assert.equal((await pedir('PUT','/preferencias',jwt,{...payload(datos.preferencias),idUsuario:1})).status,400);
  const guardado=await pedir('PUT','/preferencias',jwt,payload(datos.preferencias.map(p=>({...p,habilitada:true}))));assert.equal(guardado.status,200);assert.ok(guardado.data.preferencias.every(p=>p.persistida&&p.habilitada));
  assert.equal((await pedir('PUT','/preferencias',jwt,payload(datos.preferencias))).status,409);
  assert.ok((await pedir('GET','/preferencias',a)).data.preferencias.every(p=>!p.persistida));assert.equal(escrituras,1);
});
test('Preferencias: concurrencia permite un ganador y rechaza el borrador desactualizado',async()=>{
  habilitada=true;editable=true;const jwt=await token(admin),lista=(await pedir('GET','/preferencias',jwt)).data.preferencias;
  const respuestas=await Promise.all([pedir('PUT','/preferencias',jwt,payload(lista)),pedir('PUT','/preferencias',jwt,payload(lista.map(p=>({...p,habilitada:true}))))]);
  assert.deepEqual(respuestas.map(r=>r.status).sort(),[200,409]);assert.equal(escrituras,1);
});

test('Preferencias: revocacion durante GET no entrega opciones y no escribe',async()=>{
  habilitada=true;const jwt=await token(operador);revocarDuranteConsulta=true;
  const r=await pedir('GET','/preferencias',jwt);assert.equal(r.status,401);assert.equal(r.data.preferencias,undefined);assert.equal(escrituras,0);
});

test('Preferencias: confirmacion incompleta revierte, devuelve 503 y nunca anuncia guardado',async()=>{
  habilitada=true;editable=true;confirmacionIncompleta=true;const jwt=await token(admin);
  const lista=(await pedir('GET','/preferencias',jwt)).data.preferencias;
  const r=await pedir('PUT','/preferencias',jwt,payload(lista));assert.equal(r.status,503);
  assert.equal(r.data.codigo,'NOTIFICACIONES_NO_DISPONIBLES');assert.equal(r.data.preferencias,undefined);
  assert.equal(preferencias.size,0,'El repositorio ficticio revierte el cambio al fallar la confirmacion.');
});
test('Preferencias: contratos duplicados, incompletos o dirigidos a otra cuenta se rechazan',async()=>{
  habilitada=true;editable=true;const jwt=await token(operador),lista=TIPOS_PREFERENCIA.map(tipo=>({tipo,habilitada:false,versionRegistro:null}));
  for(const body of [null,{},payload(lista.slice(1)),payload([...lista.slice(1),lista[1]]),payload(lista.map(p=>({...p,habilitada:1}))),payload(lista.map(p=>({...p,versionRegistro:'00'}))),{preferencias:lista.map(p=>({...p,idUsuario:1}))}])assert.equal((await pedir('PUT','/preferencias',jwt,body)).status,400);
  assert.equal(escrituras,0);
});
test('Avisos: falla SQL no devuelve mensajes de driver y no ejecuta sincronizaciones',async()=>{
  fallar=true;const r=await pedir('GET','/avisos',await token(admin));assert.equal(r.status,503);assert.equal(JSON.stringify(r.data).includes('Driver privado'),false);assert.equal(escrituras,0);
});
test('Personales: nuevas rutas 401 sin token y 503 apagadas sin tocar repositorio',async()=>{
  const jwt=await token(operador);
  for(const [metodo,ruta]of [['GET','/personales'],['GET','/personales/contador'],['PUT','/personales/1/lectura']]){
    assert.equal((await pedir(metodo,ruta,undefined,metodo==='PUT'?{}:undefined)).status,401);
    assert.equal((await pedir(metodo,ruta,jwt,metodo==='PUT'?{}:undefined)).data.codigo,'NOTIFICACIONES_PERSONALES_NO_ACTIVADAS');
  }assert.equal(lecturas,0);assert.equal(escrituras,0);
});
test('Personales: usuario propio, BigInt exacto, cursor sin repetición ante altas nuevas y contador',async()=>{
  personal=true;habilitada=true;const jwt=await token(operador);
  const primera=await pedir('GET','/personales?limite=2',jwt);assert.equal(primera.status,200);assert.deepEqual(primera.data.notificaciones.map(n=>n.idNotificacion),['4','3']);assert.ok(primera.data.siguiente);
  entregas.unshift({...entregas[0],idEntrega:'9007199254741999',idNotificacion:'999'});
  const segunda=await pedir('GET','/personales?limite=2&cursor='+primera.data.siguiente,jwt);assert.deepEqual(segunda.data.notificaciones.map(n=>n.idNotificacion),['2','1']);assert.equal(segunda.data.siguiente,null);
  assert.equal((await pedir('GET','/personales/contador',jwt)).data.noLeidas,5);
  for(const item of primera.data.notificaciones){assert.equal(item.idUsuario,undefined);assert.equal(item.datos,undefined);assert.equal(item.leida,false);}assert.equal(escrituras,0);
});
test('Personales: lectura idempotente propia, concurrencia y privacidad de otra cuenta',async()=>{
  personal=true;habilitada=true;editable=true;const jwt=await token(operador);
  entregas=entregas.filter(r=>r.idUsuario===2||r.idNotificacion==='4');
  const body={versionRegistro:'0000000000000001'};
  const resultado=await Promise.all([pedir('PUT','/personales/1/lectura',jwt,body),pedir('PUT','/personales/1/lectura',jwt,body)]);
  assert.ok(resultado.every(r=>r.status===200&&r.data.notificacion.leida));assert.equal(escrituras,1);
  assert.equal((await pedir('GET','/personales/contador',jwt)).data.noLeidas,3);
  assert.equal(entregas.find(r=>r.idUsuario===1).fechaLectura,null);
  assert.equal((await pedir('PUT','/personales/777/lectura',jwt,body)).status,404);
  entregas.push({...entregas.find(r=>r.idUsuario===1),idNotificacion:'123'});
  assert.equal((await pedir('PUT','/personales/123/lectura',jwt,body)).status,404);
  assert.equal((await pedir('PUT','/personales/2/lectura',jwt,{versionRegistro:'0000000000000002'})).status,409);
});
test('Personales: payload/cursor cerrado, escritura separada y revocación durante consulta',async()=>{
  personal=true;habilitada=true;const jwt=await token(operador);
  for(const q of ['?idUsuario=1','?idEmpresa=2','?limite=0','?limite=51','?cursor=malformado','?tipo=INVENTADO','?estado=todos','?cursor=a&cursor=b'])assert.equal((await pedir('GET','/personales'+q,jwt)).status,400);
  assert.equal((await pedir('PUT','/personales/1/lectura',jwt,{versionRegistro:'0000000000000001'})).data.codigo,'NOTIFICACIONES_SOLO_LECTURA');assert.equal(escrituras,0);
  editable=true;assert.equal((await pedir('PUT','/personales/9223372036854775808/lectura',jwt,{versionRegistro:'0000000000000001'})).status,400);
  assert.equal((await pedir('PUT','/personales/1/lectura',jwt,{versionRegistro:'0000000000000001',idUsuario:1})).status,400);
  revocarDuranteConsulta=true;assert.equal((await pedir('GET','/personales',jwt)).status,401);assert.equal(escrituras,0);
});
test('Personales: inactividad, cambio obligatorio y rol excluido rechazan acceso antes del repositorio',async()=>{
  personal=true;habilitada=true;editable=true;
  for(const [campo,valor,status]of [['estado','Inactivo',401],['debeCambiarPassword',true,403],['rol','Propietario',401]]){
    const jwt=await token(operador),fila=usuarios.filas.get(2),anterior=fila[campo];fila[campo]=valor;
    assert.equal((await pedir('GET','/personales',jwt)).status,status);fila[campo]=anterior;
  }assert.equal(lecturas,0);assert.equal(escrituras,0);
});
