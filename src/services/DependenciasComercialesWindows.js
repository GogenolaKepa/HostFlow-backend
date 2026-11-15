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
function prepararDependenciasWindows({aprobacion=false,env={},acreditacion,driver,obtenerCredencial,transportar,obtenerSecretoCorreo,clavesMemoria,tlsDirecto=false,politicaPiloto=false,alcancePublico=null,politicaHabitual=null,controlPublico=null}={}){
 if(aprobacion!==true||env.HOSTFLOW_AUTH_COMERCIAL_ENABLED!=='1')return Object.freeze({estado:'inactivo',liberar(){}});
 const config=leerConfiguracionComercial(env);
 if(config.correo.dominioVerificado!=='hostflow.com.ar'||config.correo.remitente!=='seguridad@hostflow.com.ar')throw TypeError('Dominio de correo del host no acreditado.');
 if(env.HOSTFLOW_AUTH_SOURCE!=='sql'||env.HOST!=='127.0.0.1'||typeof driver?.ConnectionPool!=='function'||typeof obtenerCredencial!=='function'||typeof transportar!=='function')throw TypeError('Host comercial local no acreditado.');
 if(!acreditacion||typeof acreditacion.referencia!=='string'||!acreditacion.referencia.trim()||acreditacion.referencia.length>200||!['sqlValidado','dominioVerificado','recuperacionVerificada','seguridadHttpVerificada'].every(k=>acreditacion[k]===true))throw TypeError('Faltan acreditaciones comerciales vigentes.');
 const rawProxies=env.HOSTFLOW_AUTH_COMERCIAL_PROXIES??'';
 const proxies=tlsDirecto===true&&rawProxies===''?[]:rawProxies.split(',').map(p=>p.trim());
 if((!proxies.length&&tlsDirecto!==true)||proxies.length>4||new Set(proxies).size!==proxies.length||proxies.some(p=>!isIP(p))||tlsDirecto===true&&proxies.length)throw TypeError('Proxy comercial no acreditado.');
 if(!(env.HOSTFLOW_CORS_ORIGINS??'').split(',').map(s=>s.trim()).includes(config.correo.origen))throw TypeError('Origen comercial no acreditado en CORS.');
 if(typeof obtenerSecretoCorreo!=='function'||Object.hasOwn(env,'RESEND_API_KEY'))throw TypeError('Puerto externo de correo no acreditado.');
 let cifrado,indice;
 try{
  if(clavesMemoria!==undefined){
   if(Object.hasOwn(env,'HOSTFLOW_AUTH_COMERCIAL_CIFRADO_BASE64')||Object.hasOwn(env,'HOSTFLOW_AUTH_COMERCIAL_INDICE_BASE64')||!Buffer.isBuffer(clavesMemoria?.cifrado)||!Buffer.isBuffer(clavesMemoria?.indice)||clavesMemoria.cifrado.length!==32||clavesMemoria.indice.length!==32)throw TypeError('Claves en memoria no acreditadas.');
   cifrado=Buffer.from(clavesMemoria.cifrado);indice=Buffer.from(clavesMemoria.indice);
  }else{cifrado=clave32(env.HOSTFLOW_AUTH_COMERCIAL_CIFRADO_BASE64);indice=clave32(env.HOSTFLOW_AUTH_COMERCIAL_INDICE_BASE64);}
  if(cifrado.equals(indice))throw TypeError('Claves comerciales no independientes.');
  const keyId=env.HOSTFLOW_AUTH_COMERCIAL_KEY_ID;
  if(typeof keyId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(keyId))throw TypeError('Versión de clave comercial no acreditada.');
  let liberado=false;
  return Object.freeze({estado:'preparado',
   comercial:{aprobacion:true,proxiesComerciales:proxies,alcancePublico,controlPublico,dependencias:{driver,obtenerCredencial,
    identidades:Object.fromEntries(Object.entries(IDENTIDADES).map(([perfil,principal])=>[perfil,{tipo:'sql',principal}])),
    dependencias:{sql:{altaOperadorRestringida:true},acreditacion:Object.freeze({...acreditacion}),politicaPiloto:politicaPiloto===true,politicaHabitual,
     claves:{cifrado:{activa:keyId,claves:[{keyId,clave:cifrado}]},indice},
     correo:{transportar,obtenerSecreto:async opciones=>{if(liberado)throw Error('Correo inactivo.');return obtenerSecretoCorreo(opciones);}}}}},
   liberar(){if(liberado)return;liberado=true;cifrado.fill(0);indice.fill(0);},
  });
 }catch(error){cifrado?.fill(0);indice?.fill(0);throw error;}
}
module.exports={prepararDependenciasWindows,IDENTIDADES,SECRETOS_ENTORNO};
