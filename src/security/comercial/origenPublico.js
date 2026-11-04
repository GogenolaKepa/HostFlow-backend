const {isIP}=require('node:net');
// Configuración del servidor, nunca una URL proporcionada por el formulario.
function origenPublico(valor){
 const u=new URL(valor);
 const nombre=u.hostname.replace(/^\[|\]$/g,'');
 if(u.protocol!=='https:'||u.origin!==valor||u.username||u.password||isIP(nombre)||
   !nombre.includes('.')||/(?:^|\.)(?:localhost|local|internal)$/.test(nombre)||nombre.endsWith('.'))
  throw TypeError('Se requiere un origen HTTPS público fijo con nombre de dominio.');
 return u.origin;
}
module.exports={origenPublico};
