const express=require('express');
// Devolver null por defecto evita incluso montar un endpoint de capacidades.
// Futuro montaje ANTES del JWT global: /api/cuentas-comerciales. El handler
// existente sigue exigiendo JWT/relectura para toda administración de invitaciones.
function crearMontajeComercial({activacionAprobada=false,runtime,origen,alcancePublico=null}={}){
  if(activacionAprobada!==true)return null;
  if(alcancePublico!==null&&alcancePublico!=='recuperacion')throw TypeError('Alcance público no acreditado.');
  const u=new URL(origen);
  if(u.protocol!=='https:'||u.origin!==origen||u.username||u.password||runtime?.estado!=='preparado'||typeof runtime.handler!=='function'||typeof runtime.consultar!=='function')throw TypeError('Montaje comercial no acreditado.');
  const router=express.Router();
  router.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"});
    // req.secure solo admite proxy expresamente confiable configurado por el host.
    // Nunca habilitar trust proxy global para aceptar un X-Forwarded-Proto arbitrario.
    if(!req.secure)return res.status(426).json({codigo:'HTTPS_REQUERIDO'});
    if(req.get('Origin')&&req.get('Origin')!==origen)return res.status(403).json({codigo:'ORIGEN_NO_PERMITIDO'});
    next();
  });
  const activo=()=>{const v=runtime.consultar();return v?.disponible===true&&v.worker?.estado==='activo'&&v.pools?.pools?.length===4&&v.pools.pools.every(p=>p.conectado===true);};
  router.get('/capacidades',(req,res)=>{
    if(Object.keys(req.query).length)return res.status(400).json({codigo:'SOLICITUD_INVALIDA'});
    const disponible=activo();res.json({version:1,recuperacion:disponible,invitaciones:alcancePublico===null&&disponible,
      ...(runtime.consultar()?.contactos===true?{contactos:alcancePublico===null&&disponible}:{})});
  });
  router.use((req,res,next)=>{if(alcancePublico==='recuperacion'&&(!['/recuperacion/solicitar','/recuperacion/validar','/recuperacion/confirmar'].includes(req.path)||req.method!=='POST'))return res.status(404).json({codigo:'RUTA_NO_DISPONIBLE'});next();});
  router.use((req,res,next)=>activo()?runtime.handler(req,res,next):res.status(503).json({codigo:'CUENTAS_INACTIVAS'}));
  return router;
}
module.exports={crearMontajeComercial};
