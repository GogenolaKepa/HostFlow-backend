const https=require('node:https'),http=require('node:http');
const RUTAS=['/api/cuentas-comerciales/capacidades','/api/auth/me','/api/reservas','/uploads/propiedades/1/ficticio.jpg','/api/clientes/google','/api/cuentas-comerciales/invitaciones'];
function pedir(ruta,seguro=true){return new Promise(resolve=>{
 let q,terminado=false,timer;const fin=r=>{if(terminado)return;terminado=true;clearTimeout(timer);resolve(r);};
 timer=setTimeout(()=>{fin({fallo:true});q?.destroy();},8000);
 q=(seguro?https:http).get({host:'api.hostflow.com.ar',servername:'api.hostflow.com.ar',path:ruta,method:'GET',headers:{Origin:'https://hostflow.com.ar'},...(seguro?{rejectUnauthorized:true,minVersion:'TLSv1.2'}:{})},r=>{
  let b='';const tls=seguro?r.socket.authorized===true:undefined;r.on('aborted',()=>fin({fallo:true}));r.on('error',()=>fin({fallo:true}));
  r.on('data',p=>{if(b.length+p.length>4096){fin({fallo:true});q.destroy();}else b+=p.toString('utf8');});
  r.on('end',()=>{let c;try{c=JSON.parse(b);}catch{}fin({ruta,https:seguro,status:r.statusCode,tls,cors:r.headers['access-control-allow-origin'],cache:r.headers['cache-control'],referer:r.headers['referrer-policy'],location:r.headers.location,
   ...(seguro&&ruta===RUTAS[0]?{capacidades:c&&{version:c.version,recuperacion:c.recuperacion,invitaciones:c.invitaciones}}:{})});});
 });q.on('error',()=>fin({fallo:true}));
});}
async function verificarBorde({get=pedir,ahora=Date.now}={}){
 const resultados=[];
 for(const ruta of RUTAS){const r=await get(ruta,true);const cap=ruta===RUTAS[0];
  if(r?.tls!==true||r.status!==(cap?200:ruta===RUTAS[1]?401:404)||cap&&(r.capacidades?.version!==1||r.capacidades.recuperacion!==false||r.capacidades.invitaciones!==false||r.cors!=='https://hostflow.com.ar'||!r.cache?.includes('no-store')||r.referer!=='no-referrer'))throw Error('Borde público no acreditado.');
  resultados.push({ruta,https:true,status:r.status,tls:true});
 }
 const r=await get(RUTAS[0],false);if(r.status!==426&&(![301,302,307,308].includes(r.status)||r.location!=='https://api.hostflow.com.ar'+RUTAS[0]))throw Error('HTTP inseguro no bloqueado.');
 resultados.push({ruta:RUTAS[0],https:false,status:r.status});
 return{resultado:'BORDE_HABITUAL_ACREDITADO',fechaUTC:new Date(ahora()).toISOString(),GET:7,sinWorker:true,resultados};
}
module.exports={RUTAS,pedir,verificarBorde};
