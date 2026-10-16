const servicio=require('../services/NotificacionService');
const {ErrorSeguridad}=require('../security/seguridadUsuarios');
async function ejecutar(req,res,operacion) {
  res.set('Cache-Control','no-store');
  try{return res.json(await operacion());}
  catch(e){const error=e instanceof ErrorSeguridad?e:new ErrorSeguridad(503,'NOTIFICACIONES_NO_DISPONIBLES','No se pudieron consultar los avisos o preferencias.');return res.status(error.status).json({mensaje:error.message,codigo:error.codigo});}
}
const sinParametros=req=>{if(Object.keys(req.query).length)throw new ErrorSeguridad(400,'VALIDACION_NOTIFICACIONES','Esta operación no admite parámetros.');};
module.exports={
  avisos:(req,res)=>ejecutar(req,res,()=>servicio.avisos(req.usuario,req.query)),
  preferencias:(req,res)=>ejecutar(req,res,()=>{sinParametros(req);return servicio.preferencias(req.usuario);}),
  guardar:(req,res)=>ejecutar(req,res,()=>{sinParametros(req);return servicio.guardar(req.usuario,req.body);}),
  personales:(req,res)=>ejecutar(req,res,()=>servicio.personalesListado(req.usuario,req.query)),
  contador:(req,res)=>ejecutar(req,res,()=>servicio.personalesContador(req.usuario,req.query)),
  lectura:(req,res)=>ejecutar(req,res,()=>servicio.personalLectura(req.usuario,req.params.id,req.body,req.query)),
};
