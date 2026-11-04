const {isIP}=require('node:net');
const {leerConfiguracionComercial}=require('./ConfiguracionComercialPreparada');
const IDENTIDADES=Object.freeze({ingresoHttp:'hostflow_auth_ingreso',workerIngreso:'hostflow_auth_worker',cuentas:'hostflow_auth_cuentas',correo:'hostflow_auth_correo'});
const SECRETOS_ENTORNO=Object.freeze(['RESEND_API_KEY','HOSTFLOW_AUTH_COMERCIAL_CIFRADO_BASE64','HOSTFLOW_AUTH_COMERCIAL_INDICE_BASE64']);
function clave32(valor){
 if(typeof valor!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(valor))throw TypeError('Clave comercial no acreditada.');
 const bytes=Buffer.from(valor,'base64');
 if(bytes.length!==32||bytes.toString('base64')!==valor){bytes.fill(0);throw TypeError('Clave comercial no acreditada.');}
 return bytes;
}
// Sólo composición explícita. No lee process.env, DPAPI, SQL ni red al importar.
function prepararDependenciasWindows({aprobacion=false,env={},acreditacion,driver,obtenerCredencial,transportar}={}){
 if(aprobacion!==true||env.HOSTFLOW_AUTH_COMERCIAL_ENABLED!=='1')return Object.freeze({estado:'inactivo',liberar(){}});
 const config=leerConfiguracionComercial(env);
 if(env.HOSTFLOW_AUTH_SOURCE!=='sql'||env.HOST!=='127.0.0.1'||typeof driver?.ConnectionPool!=='function'||typeof obtenerCredencial!=='function'||typeof transportar!=='function')throw TypeError('Host comercial local no acreditado.');
 if(!acreditacion||typeof acreditacion.referencia!=='string'||!acreditacion.referencia.trim()||acreditacion.referencia.length>200||!['sqlValidado','dominioVerificado','recuperacionVerificada','seguridadHttpVerificada'].every(k=>acreditacion[k]===true))throw TypeError('Faltan acreditaciones comerciales vigentes.');
 const proxies=(env.HOSTFLOW_AUTH_COMERCIAL_PROXIES??'').split(',').map(p=>p.trim());
 if(!proxies.length||proxies.length>4||new Set(proxies).size!==proxies.length||proxies.some(p=>!isIP(p)))throw TypeError('Proxy comercial no acreditado.');
 if(!(env.HOSTFLOW_CORS_ORIGINS??'').split(',').map(s=>s.trim()).includes(config.correo.origen))throw TypeError('Origen comercial no acreditado en CORS.');
 let cifrado,indice,apiKey;
 try{
  cifrado=clave32(env.HOSTFLOW_AUTH_COMERCIAL_CIFRADO_BASE64);indice=clave32(env.HOSTFLOW_AUTH_COMERCIAL_INDICE_BASE64);
  if(cifrado.equals(indice))throw TypeError('Claves comerciales no independientes.');
  apiKey=env.RESEND_API_KEY;
  if(typeof apiKey!=='string'||apiKey.length<16||apiKey.length>256||/[^\x21-\x7e]/.test(apiKey))throw TypeError('Credencial de correo no acreditada.');
  const keyId=env.HOSTFLOW_AUTH_COMERCIAL_KEY_ID;
  if(typeof keyId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(keyId))throw TypeError('Versión de clave comercial no acreditada.');
  let liberado=false;
  return Object.freeze({estado:'preparado',
   comercial:{aprobacion:true,proxiesComerciales:proxies,dependencias:{driver,obtenerCredencial,
    identidades:Object.fromEntries(Object.entries(IDENTIDADES).map(([perfil,principal])=>[perfil,{tipo:'sql',principal}])),
    dependencias:{sql:{altaOperadorRestringida:true},acreditacion:Object.freeze({...acreditacion}),
     claves:{cifrado:{activa:keyId,claves:[{keyId,clave:cifrado}]},indice},
     correo:{transportar,obtenerSecreto:async()=>{if(liberado)throw Error('Correo inactivo.');return apiKey;}}}}},
   liberar(){if(liberado)return;liberado=true;cifrado.fill(0);indice.fill(0);apiKey=undefined;},
  });
 }catch(error){cifrado?.fill(0);indice?.fill(0);apiKey=undefined;throw error;}
}
module.exports={prepararDependenciasWindows,IDENTIDADES,SECRETOS_ENTORNO};
