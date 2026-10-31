const express=require('express');
const {validarCampos,ErrorSeguridad}=require('../security/seguridadUsuarios');

// FACTORY SIN MONTAJE OPERATIVO. Todos los puertos son obligatorios.
function crearRouterCuentasComerciales({cuentas,ingreso,autenticar}={}) {
  if(!cuentas || !ingreso?.limitar || typeof autenticar!=='function')throw new TypeError('Faltan puertos HTTP explícitos.');
  const router=express.Router();
  router.use((_req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});next();});
  router.use((req,_res,next)=>{
    const claves=Object.keys(req.query);
    const paginacion=req.method==='GET'&&req.path==='/invitaciones'&&claves.length===1&&claves[0]==='pagina'&&typeof req.query.pagina==='string'&&/^[1-9]\d{0,3}$|^10000$/.test(req.query.pagina);
    if(claves.length&&!paginacion)return next(new ErrorSeguridad(400,'SOLICITUD_INVALIDA','No se admiten credenciales en la URL.'));next();
  });
  const envolver=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
  router.use((req,_res,next)=>Promise.resolve().then(()=>ingreso.limitar(req.ip)).then(()=>next(),next));
  router.use(express.json({limit:'8kb',strict:true}));
  router.post('/recuperacion/solicitar',envolver(async(req,res)=>{const r=await ingreso.solicitar(req.body,{ip:req.ip});res.status(202).json({mensaje:r.mensaje});}));
  for(const [url,proposito] of [['recuperacion','recuperacion'],['invitaciones','invitacion']]) {
    router.post(`/${url}/validar`,envolver(async(req,res)=>{validarCampos(req.body,['token']);await cuentas.validarEnlace(proposito,req.body.token,{ip:req.ip});res.sendStatus(204);}));
    router.post(`/${url}/confirmar`,envolver(async(req,res)=>{await (proposito==='recuperacion'?cuentas.confirmarRecuperacion(req.body,{ip:req.ip}):cuentas.aceptarInvitacion(req.body,{ip:req.ip}));res.sendStatus(204);}));
  }
  // El autenticador inyectado debe validar JWT y releer usuario/VersionSesion.
  const auth=(req,res,next)=>Promise.resolve().then(()=>autenticar(req,res,next)).catch(next);
  router.get('/invitaciones',auth,envolver(async(req,res)=>res.json(await cuentas.listarInvitaciones(req.usuario,{pagina:req.query.pagina?Number(req.query.pagina):1}))));
  router.post('/invitaciones',auth,envolver(async(req,res)=>{const r=await cuentas.invitar(req.usuario,req.body,{ip:req.ip});res.status(202).json({mensaje:r.mensaje});}));
  router.post('/invitaciones/:id/revocar',auth,envolver(async(req,res)=>{validarCampos(req.body,[]);await cuentas.revocarInvitacion(req.usuario,req.params.id);res.sendStatus(204);}));
  router.use((error,_req,res,_next)=>{
    const parseo=['entity.parse.failed','entity.too.large'].includes(error.type);
    const seguro=error instanceof ErrorSeguridad;
    const status=parseo?(error.type==='entity.too.large'?413:400):seguro?error.status:503;
    // Nunca devolver body, token, password, mensaje del driver/proveedor o stack.
    res.status(status).json({codigo:seguro?error.codigo:parseo?'SOLICITUD_INVALIDA':'CUENTAS_NO_DISPONIBLE',
      mensaje:status>=500?'No se pudo confirmar la operación.':status===429?'Demasiadas solicitudes.':status===400?'Solicitud o enlace no válido.':'No tiene permiso para esta operación.'});
  });
  return router;
}
module.exports={crearRouterCuentasComerciales};
