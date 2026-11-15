const {isIP}=require('node:net');
const {crearProteccionPublicaPiloto}=require('./ProteccionPublicaPiloto');
function crearProteccionRecuperacionHabitual({control,activo}={}){
 if(!control?.lecturaPermitida||!control?.enviosPermitidos||typeof activo!=='function')throw TypeError('Falta control del host.');
 const borde=crearProteccionPublicaPiloto({activo:()=>control.lecturaPermitida()&&activo()});
 return(req,res,next)=>borde(req,res,()=>{
  // Solo tras TLS loopback/Host/XFP del Tunnel propio. No usar XFF del cliente.
  const ip=req.get('cf-connecting-ip');if(typeof ip!=='string'||!isIP(ip))return res.status(403).json({codigo:'BORDE_PUBLICO_NO_ACREDITADO'});
  Object.defineProperty(req,'ipComercial',{value:ip,writable:false,configurable:false});
  if(req.method!=='GET'&&req.method!=='OPTIONS'&&!control.enviosPermitidos())return res.status(503).json({codigo:'RECUPERACION_NO_DISPONIBLE'});
  next();
 });
}
module.exports={crearProteccionRecuperacionHabitual};
