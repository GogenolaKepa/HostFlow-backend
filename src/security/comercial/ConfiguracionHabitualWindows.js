const path=require('node:path');
const {validarPoliticaHabitual,LIMITES}=require('./PoliticaRecuperacionHabitual');
const ROOT=String.raw`C:\Users\Kepa\AppData\Local\HostFlow\RecuperacionHabitualV1`;
const ALMACEN=String.raw`C:\Users\Kepa\AppData\Local\HostFlow\NodePilotoV1\almacen`;
function validarConfiguracionHabitual(c){
 if(!c||Object.keys(c).sort().join('|')!=='acreditacion|almacen|cuenta|habilitado|politica|raizOperativa|version'||c.version!==1||c.habilitado!==true||c.cuenta!=='PC-ESCRITORIO\\Kepa'||c.almacen!==ALMACEN||c.raizOperativa!==ROOT)throw Error('Configuración habitual no aprobada.');
 const a=c.acreditacion;if(!a||Object.keys(a).sort().join('|')!=='dominioVerificado|recuperacionVerificada|referencia|seguridadHttpVerificada|sqlValidado'||typeof a.referencia!=='string'||!/^HABITUAL-[0-9]{13}$/.test(a.referencia)||!['dominioVerificado','recuperacionVerificada','seguridadHttpVerificada','sqlValidado'].every(k=>a[k]===true))throw Error('Falta autorización operativa.');
 return Object.freeze({...c,politica:validarPoliticaHabitual(c.politica)});
}
function plantillaBloqueada(){return{version:1,habilitado:false,cuenta:'PC-ESCRITORIO\\Kepa',almacen:ALMACEN,raizOperativa:ROOT,
 politica:{version:1,aprobada:false,idEmpresa:1,administradores:'SIN_RECUPERACION_PUBLICA',operadoresAutorizados:[],limites:{...LIMITES}},
 acreditacion:{referencia:'PENDIENTE_AUTORIZACION_OPERATIVA',dominioVerificado:false,recuperacionVerificada:false,seguridadHttpVerificada:false,sqlValidado:false}};}
function entornoHabitual(){return{NODE_ENV:'production',HOSTFLOW_PUBLICACION:'cloudflare',HOSTFLOW_PUBLICACION_CONFIRMADA:'1',HOST:'127.0.0.1',PORT:'4000',
 HOSTFLOW_AUTH_SOURCE:'sql',DB_SERVER:'hostflow.database.windows.net',DB_DATABASE:'HostFlow',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_AUTH_COMERCIAL_ENABLED:'1',
 HOSTFLOW_AUTH_COMERCIAL_ORIGEN:'https://hostflow.com.ar',HOSTFLOW_AUTH_COMERCIAL_REMITENTE:'seguridad@hostflow.com.ar',HOSTFLOW_AUTH_COMERCIAL_DOMINIO:'hostflow.com.ar',HOSTFLOW_AUTH_COMERCIAL_LIMITE_DIARIO:'100',HOSTFLOW_CORS_ORIGINS:'https://hostflow.com.ar',HOSTFLOW_MONEDAS_WRITE_ENABLED:'0',HOSTFLOW_CONFIGURACION_READ_ONLY:'1',HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED:'0',HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED:'0'};}
function rutaConfiguracion(archivo){const p=path.resolve(archivo);if(p!==path.join(ROOT,'configuracion.json'))throw Error('Ruta operativa no acreditada.');return p;}
module.exports={ROOT,ALMACEN,validarConfiguracionHabitual,plantillaBloqueada,entornoHabitual,rutaConfiguracion};
