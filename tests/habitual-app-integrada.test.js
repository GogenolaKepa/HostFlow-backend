// Express/Auth/JWT y TLS reales solo loopback; SQL y correo enteramente ficticios.
const {test}=require('node:test'),assert=require('node:assert/strict'),https=require('node:https');
process.env.HOSTFLOW_AUTH_SOURCE='mock';process.env.NODE_ENV='test';
const {crearProductoE2E}=require('./helpers/productoComercialE2E');
const {crearTlsLocal}=require('../src/security/comercial/TlsLocalNode');
const {crearControlPublicoHabitual}=require('../src/security/comercial/ControlPublicoHabitual');
let e,normal,habitual,control;const vivos=[];
async function escuchar(app){const tls=crearTlsLocal(),s=https.createServer(tls.opciones,app);vivos.push(s);await new Promise(r=>s.listen(0,'127.0.0.1',r));tls.liberar();return{s,ca:tls.certificado};}
function pedir(h,ruta,{method='GET',token,body,borde=false}={}){return new Promise((resolve,reject)=>{
 const texto=body?JSON.stringify(body):undefined;
 const q=https.request({hostname:'127.0.0.1',servername:'localhost',port:h.s.address().port,path:ruta,method,ca:h.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',headers:{...(borde?{Host:'api.hostflow.com.ar','X-Forwarded-Proto':'https','CF-Visitor':'{"scheme":"https"}','CF-Connecting-IP':'203.0.113.7'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(texto?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(texto)}:{})}},r=>{let b='';r.on('data',x=>b+=x);r.on('end',()=>{let data;try{data=JSON.parse(b);}catch{}resolve({status:r.statusCode,data});});});q.on('error',reject);q.end(texto);
});}
test.before(async()=>{
 e=await crearProductoE2E({origen:'http://127.0.0.1:5179'});normal=await escuchar(e.app);control=crearControlPublicoHabitual();
 const runtime={estado:'preparado',consultar:()=>({disponible:true,pools:{pools:Array.from({length:4},()=>({conectado:true}))},worker:{estado:control.enviosPermitidos()?'activo':'no-iniciado'}}),handler:(_req,res)=>res.status(202).json({aceptada:true})};
 const montaje=require('../src/routes/montajeComercialPreparado').crearMontajeComercial({activacionAprobada:true,runtime,origen:'https://hostflow.com.ar',alcancePublico:'recuperacion-habitual'});
 const app=require('../src/app').crearApp({montajeComercial:montaje,alcancePublico:'recuperacion-habitual',controlPublico:control});app.locals.comercial=runtime;
 habitual=await escuchar(app);
});
test.after(async()=>{for(const s of vivos)await new Promise((r,j)=>s.close(e=>e?j(e):r()));});
test('habitual integrado: TLS y GET no habilitan escrituras antes del worker; negocio y alternativas cerrados',async()=>{
 assert.equal((await pedir(habitual,'/api/cuentas-comerciales/capacidades')).status,403);
 const capacidades=await pedir(habitual,'/api/cuentas-comerciales/capacidades',{borde:true});assert.equal(capacidades.status,200);assert.equal(capacidades.data.recuperacion,false);assert.equal(capacidades.data.invitaciones,false);
 assert.equal((await pedir(habitual,'/api/cuentas-comerciales/recuperacion/solicitar',{borde:true,method:'POST',body:{email:'fixture@example.invalid'}})).status,503);
 for(const ruta of ['/api/dashboard/resumen','/api/propiedades','/uploads/ficticio','/api/clientes/google','/api/cuentas-comerciales/invitaciones'])assert.ok([403,404].includes((await pedir(habitual,ruta,{borde:true})).status),ruta);
 control.acreditar({resultado:'BORDE_HABITUAL_ACREDITADO',fechaUTC:new Date().toISOString(),GET:7,sinWorker:true});
 assert.equal((await pedir(habitual,'/api/cuentas-comerciales/capacidades',{borde:true})).data.recuperacion,true);
 assert.equal((await pedir(habitual,'/api/cuentas-comerciales/recuperacion/solicitar',{borde:true,method:'POST',body:{email:'fixture@example.invalid'}})).status,202);
});
test('modo habitual conserva login y sesión JWT; modo normal conserva Dashboard y permisos existentes',async()=>{
 const login=await pedir(habitual,'/api/auth/login',{borde:true,method:'POST',body:{email:e.admin.usuario.email,password:e.admin.password}});
 assert.equal(login.status,200);assert.equal(typeof login.data.token,'string');
 assert.equal((await pedir(habitual,'/api/auth/me',{borde:true,token:login.data.token})).status,200);
 assert.equal((await pedir(normal,'/api/dashboard/resumen',{token:login.data.token})).status,200);
 assert.ok([403,404].includes((await pedir(habitual,'/api/dashboard/resumen',{borde:true,token:login.data.token})).status));
 assert.equal((await pedir(habitual,'/api/auth/logout',{borde:true,method:'POST',token:login.data.token})).status,200);
 assert.equal((await pedir(normal,'/api/auth/me',{token:login.data.token})).status,401);
 control.sellar();assert.equal((await pedir(habitual,'/api/auth/me',{borde:true})).status,503);
});
