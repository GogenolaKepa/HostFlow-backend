const {secretoJWTValido}=require('./autenticacion');
// Guarda local opt-in: no prueba DNS/TLS remoto ni abre túneles, SQL o workers.
function validarPublicacionCloudflare(env={}) {
  if(env.HOSTFLOW_PUBLICACION===undefined)return Object.freeze({estado:'inactivo'});
  if(env.HOSTFLOW_PUBLICACION!=='cloudflare'||env.HOSTFLOW_PUBLICACION_CONFIRMADA!=='1'||
    env.NODE_ENV!=='production'||env.HOSTFLOW_AUTH_SOURCE!=='sql'||env.HOSTFLOW_EMPRESA_ID!=='1'||
    env.HOST!=='127.0.0.1'||(env.PORT??'4000')!=='4000'||!secretoJWTValido(env.JWT_SECRET,env)||
    env.HOSTFLOW_CORS_ORIGINS!=='https://hostflow.com.ar')throw Error('Publicación Cloudflare no acreditada.');
  for(const [k,v] of Object.entries({HOSTFLOW_MONEDAS_WRITE_ENABLED:'0',HOSTFLOW_CONFIGURACION_READ_ONLY:'1',HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED:'0',HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED:'0'})){
    if(env[k]!==v)throw Error('La preparación pública requiere conservar las protecciones operativas.');
  }
  if(!['0','1'].includes(env.HOSTFLOW_AUTH_COMERCIAL_ENABLED??'0'))throw Error('Bandera comercial inválida.');
  if(env.HOSTFLOW_AUTH_COMERCIAL_ENABLED==='1'){
    if(env.HOSTFLOW_AUTH_COMERCIAL_ORIGEN!=='https://hostflow.com.ar')throw Error('Los enlaces comerciales deben abrir el frontend.');
    const proxies=(env.HOSTFLOW_AUTH_COMERCIAL_PROXIES??'').split(',');
    if(!proxies.includes('127.0.0.1')||proxies.some(ip=>!['127.0.0.1','::1'].includes(ip))||new Set(proxies).size!==proxies.length)throw Error('Se requiere el proxy loopback exacto del túnel local.');
  }
  return Object.freeze({estado:'preparado',frontend:'https://hostflow.com.ar',api:'https://api.hostflow.com.ar/api',puerto:4000});
}
module.exports={validarPublicacionCloudflare};
