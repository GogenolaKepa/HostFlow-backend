const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),express=require('express');
const {crearImagenesPublicas,archivoImagenPermitido,rutaImagenPublica}=require('../src/middlewares/imagenesPublicas');
const {verificarBackendLocal,URL_LOCAL}=require('../scripts/verificarBackendLocal');
const {SupervisorComercial}=require('../src/services/SupervisorComercial');
test('uploads rechaza MIME/extensión discordantes y rutas de documentos o traversal',()=>{
 for(const [originalname,mimetype]of [['foto.JPG','image/jpeg'],['foto.jpeg','image/jpeg'],['foto.png','image/png'],['foto.webp','image/webp']])assert.equal(archivoImagenPermitido({originalname,mimetype}),true);
 for(const f of [{originalname:'ataque.html',mimetype:'image/png'},{originalname:'documento.pdf',mimetype:'image/jpeg'},{originalname:'foto.png',mimetype:'text/html'},{originalname:'foto.svg',mimetype:'image/svg+xml'},{originalname:'sin-mime.xyz'}])assert.equal(archivoImagenPermitido(f),false);
 assert.deepEqual(rutaImagenPublica('/propiedades/7/foto%20de%20prueba.JPG'),['propiedades','7','foto de prueba.JPG']);
 for(const p of ['/privado.pdf','/propiedades/7/.env','/propiedades/7/documento.pdf','/propiedades/7/ataque.svg','/propiedades/7/a.png:secreto','/propiedades/7/%2e%2e%2fprivado.jpg','/propiedades/7/a%5cb.jpg','/propiedades/0/a.jpg','/propiedades/2147483648/a.jpg','/propiedades/7/%zz'])assert.equal(rutaImagenPublica(p),null,p);
});
test('sólo se publican imágenes del árbol esperado; documentos, HTML y enlaces fuera quedan bloqueados',async()=>{
 const temporal=fs.mkdtempSync(path.join(os.tmpdir(),'hf-tunnel-imagenes-')),uploads=path.join(temporal,'uploads');
 const destino=path.join(uploads,'propiedades','7'),privado=path.join(temporal,'privado');fs.mkdirSync(destino,{recursive:true});fs.mkdirSync(privado);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=','base64');
 fs.writeFileSync(path.join(destino,'foto.png'),png);for(const n of ['privado.pdf','ataque.html','.env'])fs.writeFileSync(path.join(destino,n),'SOLO-DATO-FICTICIO-NO-PUBLICAR');
 fs.writeFileSync(path.join(privado,'foto.jpg'),'SOLO-DATO-FICTICIO-NO-PUBLICAR');fs.symlinkSync(privado,path.join(uploads,'propiedades','8'),'junction');
 const app=express();app.use('/uploads',crearImagenesPublicas({carpetaUploads:uploads}));const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));
 const base='http://127.0.0.1:'+s.address().port;
 try{
  const r=await fetch(base+'/uploads/propiedades/7/foto.png');assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('content-security-policy'),/sandbox/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);
  assert.equal((await fetch(base+'/uploads/propiedades/7/foto.png',{method:'HEAD'})).status,200);
  for(const p of ['/uploads/propiedades/7/privado.pdf','/uploads/propiedades/7/ataque.html','/uploads/propiedades/7/.env','/uploads/propiedades/7/','/uploads/propiedades/8/foto.jpg','/uploads/otra/foto.png']){const rr=await fetch(base+p);assert.equal(rr.status,404);assert.ok(!(await rr.text()).includes('NO-PUBLICAR'));}
  assert.equal((await fetch(base+'/uploads/propiedades/7/foto.png',{method:'POST'})).status,404);
 }finally{await new Promise(r=>s.close(r));assert.equal(path.dirname(temporal),path.resolve(os.tmpdir()));assert.ok(path.basename(temporal).startsWith('hf-tunnel-imagenes-'));fs.rmSync(temporal,{recursive:true,force:true});}
});
test('verificador local exige 401/CORS exacto y nunca envía JWT, cuerpos ni reintentos',async()=>{
 let llamadas=0;const transportar=async(url,o)=>{llamadas++;assert.equal(url,URL_LOCAL);assert.equal(o.method,'GET');assert.equal(o.headers.Origin,'https://hostflow.com.ar');assert.equal(o.headers.Authorization,undefined);assert.equal(o.body,undefined);assert.equal(o.redirect,'error');return{status:401,headers:new Headers({'Content-Type':'application/json','Access-Control-Allow-Origin':'https://hostflow.com.ar'}),json:async()=>({mensaje:'Debe iniciar sesión.'})};};
 assert.deepEqual(await verificarBackendLocal({transportar}),{estado:'DISPONIBLE_PROTEGIDO',escrituras:0});assert.equal(llamadas,1);
 for(const [status,cors]of [[200,'https://hostflow.com.ar'],[403,'https://hostflow.com.ar'],[401,'*']]){const r=await verificarBackendLocal({transportar:async()=>({status,headers:new Headers({'content-type':'application/json','access-control-allow-origin':cors})})});assert.equal(r.estado,'NO_ACREDITADO');}
});
test('verificador clasifica apagado y timeout sin filtrar errores privados ni volver a llamar',async()=>{
 let n=0;const apagado=await verificarBackendLocal({transportar:async()=>{n++;throw Object.assign(Error('SQL/CLAVE FICTICIA PRIVADA'),{cause:{code:'ECONNREFUSED'}});}});
 assert.equal(apagado.motivo,'SERVICIO_APAGADO');assert.equal(n,1);assert.ok(!JSON.stringify(apagado).includes('PRIVADA'));
 const timeout=await verificarBackendLocal({timeoutMs:100,transportar:(_u,{signal})=>new Promise((_,rej)=>signal.addEventListener('abort',()=>rej(Error('FICTICIO'))))});assert.equal(timeout.motivo,'TIEMPO_AGOTADO');
});
test('la plantilla de Tunnel permanece bloqueada y no contiene un destino real a Windows',()=>{
 const c=fs.readFileSync(path.join(__dirname,'../deploy/cloudflare/config.bloqueada.yml.example'),'utf8');
 const servicios=c.split(/\r?\n/).map(l=>l.trim().replace(/^-\s+/,'' )).filter(l=>l.startsWith('service:'));
 assert.deepEqual(servicios,['service: http_status:503','service: http_status:404']);assert.match(c,/UUID_PENDIENTE_DE_AUTORIZACION/);
});
test('worker inerte antes del inicio; incluso sin pendientes consulta cada segundo mientras esté activo',async()=>{
 let n=0,espera,continuar;const s=new SupervisorComercial({procesar:async()=>{n++;return{ingreso:{estado:'sin-pendientes'},correo:{estado:'sin-pendientes'}};},esperar:(ms,signal)=>{espera=ms;return new Promise(r=>{continuar=r;signal.addEventListener('abort',r,{once:true});});}});
 assert.equal(n,0);assert.equal(s.consultar().estado,'detenido');const tarea=s.iniciar();await Promise.resolve();await Promise.resolve();assert.equal(n,1);assert.equal(espera,1000);await s.detener();await tarea;continuar();assert.equal(n,1);assert.equal(s.consultar().estado,'detenido');
});
test('app y permisos reales protegen Usuarios/Reservas sin SQL ni acceso a datos reales',async()=>{
 const {crearProductoE2E}=require('./helpers/productoComercialE2E');const e=await crearProductoE2E({origen:'http://127.0.0.1:5179'});
 const s=e.app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const base='http://127.0.0.1:'+s.address().port;
 try{
  for(const [metodo,ruta]of [['GET','/api/usuarios'],['POST','/api/usuarios'],['GET','/api/reservas'],['POST','/api/reservas'],['PUT','/api/reservas/34'],['DELETE','/api/reservas/34']])assert.equal((await fetch(base+ruta,{method:metodo})).status,401);
  assert.equal((await fetch(base+'/api/usuarios',{headers:{Authorization:'Bearer '+e.tokenOperador()}})).status,403);
  assert.equal((await fetch(base+'/api/reservas',{headers:{Authorization:'Bearer no-valido'}})).status,401);
  assert.equal((await fetch(base+'/uploads/propiedades/7/privado.pdf')).status,404);
  assert.equal(e.correos.length,0);
 }finally{await new Promise(r=>s.close(r));}
});
