const {test}=require('node:test'),assert=require('node:assert/strict');
const {crearConfiguracionAprobada}=require('../scripts/prepararRecuperacionHabitual');
const {validarConfiguracionHabitual,plantillaBloqueada}=require('../src/security/comercial/ConfiguracionHabitualWindows');
const {validarPoliticaHabitual,correoHabitual}=require('../src/security/comercial/PoliticaRecuperacionHabitual');
const {AutenticacionComercialService}=require('../src/services/AutenticacionComercialService');
const {crearControlPublicoHabitual,transporteHabitual}=require('../src/security/comercial/ControlPublicoHabitual');
const {crearProteccionRecuperacionHabitual}=require('../src/security/comercial/ProteccionRecuperacionHabitual');
const {verificarBorde,RUTAS}=require('../src/security/comercial/VerificacionBordeHabitual');
const cfg=()=>crearConfiguracionAprobada([101,102],'HABITUAL-1794710000000');
const servicio=()=>new AutenticacionComercialService({repository:{transaccion:fn=>fn({})},protector:{sellar(){}},indicePrivado:()=>'',origen:'https://hostflow.com.ar',idEmpresa:1,politicaHabitual:cfg().politica});
const u=()=>({idUsuario:101,rol:'Operador',rolActivo:true,estado:'Activo',versionSesion:1,versionContacto:1,emailVerificadoEn:'2026-11-01T00:00:00.000Z'});
function req(ruta='/api/cuentas-comerciales/capacidades',method='GET',extra={}){const headers={host:'api.hostflow.com.ar','x-forwarded-proto':'https','cf-visitor':'{"scheme":"https"}','cf-connecting-ip':'203.0.113.7',origin:'https://hostflow.com.ar',...extra};return{method,originalUrl:ruta,socket:{encrypted:true,remoteAddress:'127.0.0.1'},get:k=>headers[k.toLowerCase()]};}
function ejecutar(guard,r){let paso=false;const res={statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(){return this;}};guard(r,res,()=>{paso=true;});return{paso,status:res.statusCode};}
const evidencia=()=>({resultado:'BORDE_HABITUAL_ACREDITADO',fechaUTC:new Date().toISOString(),GET:7,sinWorker:true});
test('habitual: requiere aprobación real, lista explícita, empresa1 y política admin cerrada',()=>{
 assert.throws(()=>validarConfiguracionHabitual(plantillaBloqueada()));
 for(const cambio of [p=>p.operadoresAutorizados=[],p=>p.operadoresAutorizados=[101,101],p=>p.operadoresAutorizados=['101'],p=>p.idEmpresa=2,p=>p.administradores='TODOS',p=>p.limites.global24h=999,p=>p.aprobada=false]){const p=structuredClone(cfg().politica);cambio(p);assert.throws(()=>validarPoliticaHabitual(p));}
 assert.deepEqual(cfg().politica.operadoresAutorizados,[101,102]);assert.equal(Object.hasOwn(cfg(),'ventana'),false);assert.equal(Object.hasOwn(cfg(),'presupuesto'),false);
});
test('habitual: dos operadores ficticios; admin/no autorizado/inactivo/sin contacto no recuperables',()=>{
 const s=servicio();assert.equal(s.recuperable(u()),true);assert.equal(s.recuperable({...u(),idUsuario:102}),true);
 for(const cambio of [{idUsuario:103},{rol:'Administrador'},{estado:'Inactivo'},{rolActivo:false},{versionContacto:0},{emailVerificadoEn:null}])assert.equal(s.recuperable({...u(),...cambio}),false);
});
test('habitual: no permite invitaciones ni SQL18 por vías de servicio',async()=>{
 const s=servicio();await assert.rejects(s.invitar({},{}));await assert.rejects(s.listarInvitaciones({}));await assert.rejects(s.revocarInvitacion({},'ficticio'));await assert.rejects(s.vigente({},'hash','invitacion',Date.now()));
});
test('habitual: borde falla cerrado sin TLS/loopback/Host/CFIP real o con caminos alternativos',()=>{
 const c=crearControlPublicoHabitual(),g=crearProteccionRecuperacionHabitual({control:c,activo:()=>true});
 assert.equal(ejecutar(g,req()).paso,true);
 for(const h of [{'cf-connecting-ip':undefined},{'cf-connecting-ip':'1.2.3.4, 5.6.7.8'},{'x-forwarded-proto':'http'},{host:'otro.invalid'},{origin:'https://otro.invalid'}])assert.equal(ejecutar(g,req(undefined,undefined,h)).paso,false);
 for(const p of ['/api/reservas','/uploads/a','/api/clientes/google','/api/cuentas-comerciales/invitaciones','/api/%63uentas-comerciales/capacidades','/api/cuentas-comerciales/capacidades?token=FICTICIO'])assert.equal(ejecutar(g,req(p)).paso,false);
 const r=req();r.socket.encrypted=false;assert.equal(ejecutar(g,r).paso,false);
});
test('habitual: no acepta escrituras antes de GET; IP comercial no viene de XFF',()=>{
 const c=crearControlPublicoHabitual(),g=crearProteccionRecuperacionHabitual({control:c,activo:()=>true});
 assert.equal(ejecutar(g,req('/api/cuentas-comerciales/recuperacion/solicitar','POST')).status,503);
 c.acreditar(evidencia());const r=req('/api/cuentas-comerciales/recuperacion/solicitar','POST',{'x-forwarded-for':'198.51.100.99'});assert.equal(ejecutar(g,r).paso,true);assert.equal(r.ipComercial,'203.0.113.7');
 c.sellar();assert.equal(ejecutar(g,req()).status,503);assert.throws(()=>c.acreditar(evidencia()));
});
test('habitual: acreditación vieja/desconocida no habilita, transporte solo plantillas y remitente seguros',async()=>{
 const c=crearControlPublicoHabitual();assert.throws(()=>c.acreditar({...evidencia(),fechaUTC:new Date(Date.now()-300001).toISOString()}));assert.throws(()=>c.acreditar({...evidencia(),GET:6}));
 let enviados=0;const enviar=transporteHabitual(c,async()=>{enviados++;return{status:200};});const o={method:'POST',redirect:'error',headers:{'Idempotency-Key':'hostflow/00000000-0000-4000-8000-000000000001'},body:JSON.stringify({from:'HostFlow Seguridad <seguridad@hostflow.com.ar>',to:['fixture@example.invalid'],subject:'Recuperá tu acceso a HostFlow',html:'FICTICIO',text:'FICTICIO'})};
 await assert.rejects(enviar('https://api.resend.com/emails',o));c.acreditar(evidencia());await enviar('https://api.resend.com/emails',o);assert.equal(enviados,1);
 await assert.rejects(enviar('https://otro.invalid',o));await assert.rejects(enviar('https://api.resend.com/emails',{...o,redirect:'follow'}));c.sellar();await assert.rejects(enviar('https://api.resend.com/emails',o));assert.equal(enviados,1);
 assert.throws(()=>correoHabitual({plantilla:'invitacion',destinatario:'fixture@example.invalid',enlace:'FICTICIO'}));
});
test('habitual: GET7 ficticios validados juntos; TLS/HTTP/capacidades desconocidas bloquean',async()=>{
 const respuesta=(p,s)=>({status:!s?426:p===RUTAS[0]?200:p===RUTAS[1]?401:404,tls:s,cors:'https://hostflow.com.ar',cache:'no-store',referer:'no-referrer',capacidades:{version:1,recuperacion:false,invitaciones:false}});
 const e=await verificarBorde({get:async(p,s)=>respuesta(p,s)});assert.equal(e.GET,7);
 for(const cambio of [{tls:null},{status:530},{capacidades:{version:1,recuperacion:true,invitaciones:false}},{cors:'*'}])await assert.rejects(verificarBorde({get:async(p,s)=>({...respuesta(p,s),...cambio})}));
});
