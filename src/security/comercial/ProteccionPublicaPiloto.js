// Solo para la ventana pública de recuperación, por inyección del host.
// El socket debe ser TLS/loopback. X-Forwarded-Proto procede del Tunnel propio;
// Cloudflare lo reemplaza por el protocolo REAL del visitante. No trust proxy global.
const RUTAS=new Map([
 ['GET /api/auth/me',true],['POST /api/auth/login',true],['POST /api/auth/logout',true],
 ['GET /api/cuentas-comerciales/capacidades',true],
 ...['solicitar','validar','confirmar'].map(p=>['POST /api/cuentas-comerciales/recuperacion/'+p,true]),
]);
const PATHS=new Set([...RUTAS.keys()].map(k=>k.slice(k.indexOf(' ')+1)));
function crearProteccionPublicaPiloto({activo=()=>false}={}){if(typeof activo!=='function')throw TypeError('Estado de ventana no acreditado.');return function proteger(req,res,next){
 res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
 const negar=(n,c)=>res.status(n).json({codigo:c});
 try{if(activo()!==true)return negar(503,'VENTANA_NO_DISPONIBLE');}catch{return negar(503,'VENTANA_NO_DISPONIBLE');}
 const url=req.originalUrl,peer=req.socket?.remoteAddress;
 if(req.socket?.encrypted!==true||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer))return negar(426,'HTTPS_ORIGEN_REQUERIDO');
 if(req.get('host')!=='api.hostflow.com.ar')return negar(403,'HOST_PUBLICO_NO_ACREDITADO');
 const protocolo=req.get('x-forwarded-proto');
 if(protocolo==='http')return negar(426,'HTTPS_VISITANTE_REQUERIDO');
 if(protocolo!=='https')return negar(403,'BORDE_PUBLICO_NO_ACREDITADO');
 const visitante=req.get('cf-visitor');
 if(visitante!==undefined){
  try{if(typeof visitante!=='string'||visitante.length>100)throw Error();const c=JSON.parse(visitante);if(!c||Array.isArray(c)||c.scheme!=='https')throw Error();}
  catch{return negar(403,'BORDE_PUBLICO_NO_ACREDITADO');}
 }
 // Las rutas se autorizan ANTES de parsear cuerpos, JWT, sesiones o consultar SQL.
 if(typeof url!=='string'||/[?%\\\r\n]/.test(url)||!(RUTAS.has(req.method+' '+url)||req.method==='OPTIONS'&&PATHS.has(url)))return negar(403,'RUTA_FUERA_DE_VENTANA');
 const origen=req.get('origin');if(origen!==undefined&&origen!=='https://hostflow.com.ar')return negar(403,'ORIGEN_NO_PERMITIDO');
 next();
};}
function loginDePrueba(req,res,next){
 if(typeof req.body?.email!=='string'||req.body.email.trim().toLowerCase()!=='hostflowtesting@gmail.com')return res.status(403).json({codigo:'CUENTA_FUERA_DE_VENTANA'});
 next();
}
function sesionDePrueba(req,res,next){
 const u=req.usuario;
 if(u?.idUsuario!==3||u.rol!=='Operador'||u.email!=='hostflowtesting@gmail.com')return res.status(403).json({codigo:'CUENTA_FUERA_DE_VENTANA'});
 next();
}
module.exports={crearProteccionPublicaPiloto,loginDePrueba,sesionDePrueba};
