const test=require('node:test'),assert=require('node:assert/strict'),bcrypt=require('bcryptjs');
const {EventEmitter}=require('node:events');
const {AutenticacionComercialService}=require('../src/services/AutenticacionComercialService');
const {AutenticacionComercialSql}=require('../src/repositories/AutenticacionComercialSql');
const {CuentasComercialesAisladas}=require('./helpers/cuentasComercialesAisladas');
const {crearProtectorCorreo,crearIndicePrivado}=require('../src/security/comercial/credencialesTemporales');
const {crearPoliticaAutomatica,validarPoliticaHabitual,usuarioAutorizado,cuotasEntrega}=require('../src/security/comercial/PoliticaRecuperacionHabitual');
const {crearConfiguracionAutomatica,crearConfiguracionAprobada}=require('../scripts/prepararRecuperacionHabitual');
const ahora=Date.parse('2026-11-15T12:00:00Z');
const datos=(extra={})=>({idUsuario:41,email:'cuenta@example.invalid',rol:'Operador',rolActivo:true,estado:'Activo',debeCambiarPassword:false,versionSesion:1,versionContacto:1,emailVerificadoEn:'2026-11-01T00:00:00Z',ambitoIdentidad:'dbo.Usuarios',passwordLocalHabilitada:true,...extra});
async function fixture(rol='Operador'){
 const repo=new CuentasComercialesAisladas();await repo.agregar({id:41,rol});Object.assign(repo.filas.get(41),datos({rol}));
 const protector=crearProtectorCorreo({clave:Buffer.alloc(32,7),keyId:'ficticio'}),indice=crearIndicePrivado(Buffer.alloc(32,8));
 const servicio=new AutenticacionComercialService({repository:repo,protector,indicePrivado:indice,origen:'https://hostflow.com.ar',idEmpresa:1,ahora:()=>ahora,politicaHabitual:crearPoliticaAutomatica(),hashPassword:p=>bcrypt.hash(p,4)});
 return{repo,protector,indice,servicio,cerrar(){protector.liberar?.();indice.liberar?.();}};
}
test('política automática sin IDs; admite los dos roles y preserva límites; legacy no se amplía',()=>{
 const p=crearPoliticaAutomatica();assert.equal(Object.hasOwn(p,'operadoresAutorizados'),false);assert.deepEqual(p.roles,['Administrador','Operador']);
 for(const x of [{...p,operadoresAutorizados:[41]},{...p,roles:['Administrador']},{...p,cuentas:'GOOGLE'},{...p,aprobada:false},{...p,limites:{...p.limites,global24h:1000}}])assert.throws(()=>validarPoliticaHabitual(x));
 assert.equal(usuarioAutorizado(crearConfiguracionAprobada([41],'HABITUAL-1794710000000').politica,datos({rol:'Administrador'})),false);
 const cfg=crearConfiguracionAutomatica('HABITUAL-1794710000000');assert.equal(cfg.politica.version,2);assert.equal(Object.hasOwn(cfg.politica,'operadoresAutorizados'),false);
});
test('operadores y administradores actuales/futuros con password y contacto vigente son elegibles',async()=>{
 const f=await fixture();try{for(const rol of ['Operador','Administrador'])for(const idUsuario of [41,9999])assert.equal(f.servicio.recuperable(datos({rol,idUsuario})),true);}finally{f.cerrar();}
});
test('suspendidos, bloqueados, no verificados, Google-only y datos desconocidos fallan cerrado',async()=>{
 const f=await fixture();try{for(const extra of [{estado:'Suspendido'},{estado:'Inactivo'},{rolActivo:false},{rol:'Propietario'},{debeCambiarPassword:null},{recuperacionBloqueada:true},{versionContacto:0},{emailVerificadoEn:null},{emailVerificadoEn:'2026-12-01T00:00:00Z'},{versionSesion:2147483647},{passwordLocalHabilitada:false},{passwordLocalHabilitada:null},{passwordLocalHabilitada:1},{ambitoIdentidad:'clientes.Cuentas'},{ambitoIdentidad:null}])assert.equal(f.servicio.recuperable(datos(extra)),false);}finally{f.cerrar();}
});
for(const rol of ['Operador','Administrador'])test('recorrido ficticio completo '+rol+': token único, sesión invalidada, auditoría y aviso sin cambiar rol',async()=>{
 const f=await fixture(rol);try{
  await f.servicio.solicitarRecuperacion({email:'cuenta@example.invalid'},{ip:'203.0.113.1'});assert.equal(f.repo.entregas.size,1);
  const [e]=f.repo.entregas.values(),p=f.protector.abrir(e.sobre,e.id),token=new URLSearchParams(new URL(p.enlace).hash.slice(1)).get('token');
  const version=f.repo.filas.get(41).versionSesion;assert.equal((await f.servicio.confirmar('recuperacion',{token,passwordNueva:'Ficticia_nueva_4567!'},{ip:'203.0.113.1'})).status,204);
  const u=f.repo.filas.get(41);assert.equal(u.versionSesion,version+1);assert.equal(u.rol,rol);assert.equal(u.versionContacto,1);assert.equal(u.emailVerificadoEn,'2026-11-01T00:00:00Z');assert.equal(await bcrypt.compare('Ficticia_nueva_4567!',u.passwordHash),true);
  assert.ok(f.repo.auditoria.some(a=>a.tipo==='PASSWORD_RESTABLECIDA'));assert.ok([...f.repo.entregas.values()].some(x=>f.protector.abrir(x.sobre,x.id).plantilla==='seguridad-cuenta'));
  await assert.rejects(f.servicio.confirmar('recuperacion',{token,passwordNueva:'Otra_ficticia_5678!'},{ip:'203.0.113.1'}),e=>e.codigo==='ENLACE_INVALIDO');
 }finally{f.cerrar();}
});
test('cuenta nueva elegible sin reconstruir servicio ni editar configuración',async()=>{
 const f=await fixture();try{await f.repo.agregar({id:82,rol:'Operador'});Object.assign(f.repo.filas.get(82),datos({idUsuario:82,email:'futura@example.invalid'}));await f.servicio.solicitarRecuperacion({email:'futura@example.invalid'},{ip:'203.0.113.2'});assert.equal(f.repo.desafios.size,1);assert.equal([...f.repo.desafios.values()][0].usuarioId,82);}finally{f.cerrar();}
});
test('cambio de método, verificación, rol o bloqueo tras emisión invalida el enlace',async()=>{
 for(const cambio of [{passwordLocalHabilitada:false},{versionContacto:2},{emailVerificadoEn:null},{estado:'Suspendido'},{rol:'Propietario'}]){
  const f=await fixture();try{await f.servicio.solicitarRecuperacion({email:'cuenta@example.invalid'},{ip:'203.0.113.1'});const [e]=f.repo.entregas.values(),p=f.protector.abrir(e.sobre,e.id),token=new URLSearchParams(new URL(p.enlace).hash.slice(1)).get('token');Object.assign(f.repo.filas.get(41),cambio);await assert.rejects(f.servicio.confirmar('recuperacion',{token,passwordNueva:'Ficticia_nueva_4567!'},{ip:'203.0.113.1'}),x=>x.codigo==='ENLACE_INVALIDO');assert.equal(f.repo.auditoria.some(a=>a.tipo==='PASSWORD_RESTABLECIDA'),false);}finally{f.cerrar();}
 }
});
test('respuestas neutrales iguales para inexistente, suspendido, Google y administrador no verificado',async()=>{
 for(const cambio of [null,{estado:'Suspendido'},{passwordLocalHabilitada:false},{rol:'Administrador',emailVerificadoEn:null}]){const f=await fixture();try{if(cambio===null)f.repo.filas.clear();else Object.assign(f.repo.filas.get(41),cambio);const r=await f.servicio.solicitarRecuperacion({email:'cuenta@example.invalid'},{ip:'203.0.113.1'});assert.equal(r.status,202);assert.equal(f.repo.entregas.size,0);assert.equal(r.mensaje,'Si la solicitud corresponde, recibirás instrucciones por correo.');}finally{f.cerrar();}}
});
test('cuotas durables conservan sus claves y límites para ambos roles; contexto desconocido no reserva',()=>{
 const p=crearPoliticaAutomatica();for(const rol of p.roles){const c={...datos({rol}),usuarioId:41,clase:'recuperacion',cuenta:'a'.repeat(64),destino:'b'.repeat(64)};const q=cuotasEntrega(p,c,ahora);assert.equal(q[0].maxIp,6);assert.equal(q[1].maxIp,3);assert.equal(q[0].maxGlobal,100);assert.equal(q[0].proposito,'correo-habitual-total-v1');assert.throws(()=>cuotasEntrega(p,{...c,passwordLocalHabilitada:null},ahora));}
});
test('adaptador worker recibe solo bit de método y no hash; nulo sigue desconocido',async()=>{
 const consultas=[];class Transaction extends EventEmitter{async begin(){}async commit(){}async rollback(){}}
 class Request{input(){return this;}async query(s){consultas.push(s);return{recordset:s.includes('DB_NAME()')?[{base:'FICTICIO',servidor:'FICTICIO',modelo:'authcom-v1'}]:s.includes('sp_getapplock')?[{resultado:0}]:[{...datos(),verificado:new Date('2026-11-01Z'),passwordLocalHabilitada:null}]};}}
 const repo=new AutenticacionComercialSql({pool:{},driver:{Transaction,Request,ISOLATION_LEVEL:{SERIALIZABLE:1}},baseEsperada:'FICTICIO',servidorEsperado:'FICTICIO',idEmpresa:1,habilitado:true,perfil:'worker-ingreso',recuperacionAutomatica:true});const u=await repo.transaccion(tx=>tx.buscarUsuario('cuenta@example.invalid'));const sql=consultas.find(s=>s.includes('AS passwordHash'));assert.match(sql,/NULL AS passwordHash/);assert.doesNotMatch(sql,/u\.PasswordHash/);assert.match(sql,/authcom\.PermitePasswordLocal\(u.IdUsuario\)/);assert.match(sql,/N'dbo.Usuarios' AS ambitoIdentidad/);assert.equal(usuarioAutorizado(crearPoliticaAutomatica(),u),false);
});
test('cambio obligatorio se satisface mediante recuperación verificada sin activar una cuenta suspendida',async()=>{
 for(const rol of ['Administrador','Operador']){const f=await fixture(rol);try{
  f.repo.filas.get(41).debeCambiarPassword=true;await f.servicio.solicitarRecuperacion({email:'cuenta@example.invalid'},{ip:'203.0.113.1'});const [e]=f.repo.entregas.values();assert.ok(e);const p=f.protector.abrir(e.sobre,e.id),token=new URLSearchParams(new URL(p.enlace).hash.slice(1)).get('token');await f.servicio.confirmar('recuperacion',{token,passwordNueva:'Ficticia_nueva_4567!'},{ip:'203.0.113.1'});assert.equal(f.repo.filas.get(41).debeCambiarPassword,false);assert.equal(f.repo.filas.get(41).rol,rol);assert.equal(f.repo.filas.get(41).estado,'Activo');
 }finally{f.cerrar();}}
});
