// Solo el establecimiento inicial de conexión. Nunca recibe ni reintenta SQL.
const {performance}=require('node:perf_hooks');
const {setTimeout:pausa}=require('node:timers/promises');
const TRANSITORIOS=new Set([40613,40197,40501,10928,10929]);
const POLITICA=Object.freeze({intentos:5,esperasMs:Object.freeze([5000,10000,20000,30000]),jitterMaxMs:1000,presupuestoMs:180000});
const PERFILES=new Set(['ingresoHttp','workerIngreso','cuentas','correo','operativo']);
const CODIGOS=new Set(['ELOGIN','ETIMEOUT','ESOCKET','ECONNCLOSED','ECONNREFUSED']);
const entero=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max?n:null;
function tokenSeguro(t){return{numeroSQL:entero(t?.number,1,65535),estadoSQL:entero(t?.state,0,255),claseSQL:entero(t?.class,0,25)};}
function crearPlazo(ahora=()=>performance.now()){return ahora()+POLITICA.presupuestoMs;}
function errorSeguro(codigo,perfil,info){const e=Error('Conexión SQL no acreditada; diagnóstico sanitizado disponible.');e.codigo=codigo;e.conexionSQL=Object.freeze(info);e.diagnosticoArranque=Object.freeze({etapa:'ABRIR_POOLS_COMERCIALES',perfil:PERFILES.has(perfil)?perfil:null,categoria:CODIGOS.has(info.categoria)?info.categoria:'SQL_NO_DISPONIBLE',numeroSQL:info.numeroSQL??null});return e;}
async function abrirConexionSql({driver,config,perfil,signal,ahora=()=>performance.now(),esperar=ms=>pausa(ms,undefined,{signal}),azar=Math.random,hasta=crearPlazo(ahora)}={}){
 if(typeof driver?.ConnectionPool!=='function'||config?.options?.encrypt!==true||config.options.trustServerCertificate!==false||!Number.isFinite(hasta)||!Number.isInteger(config.connectionTimeout)||config.connectionTimeout<100||config.connectionTimeout>30000)throw errorSeguro('CONFIGURACION_INVALIDA',perfil,{categoria:'CONFIGURACION_INVALIDA',poolsCerrados:true,intentos:0});
 const inicio=ahora(),intentos=[];let ultimo={categoria:'NO_CLASIFICADO',numeroSQL:null,estadoSQL:null,claseSQL:null};
 const fallar=(codigo,extra={})=>errorSeguro(codigo,perfil,{...ultimo,intentos:intentos.length,poolsCerrados:true,agotado:false,cancelado:false,
  motivoFin:extra.cancelado?'CANCELADO':codigo==='CIERRE_INCOMPLETO'?'CIERRE_INCIERTO':extra.agotado?(intentos.length>=POLITICA.intentos?'MAXIMO_INTENTOS':'PRESUPUESTO_AGOTADO'):'ERROR_NO_REINTENTABLE',
  transcurridoMs:Math.max(0,Math.ceil(ahora()-inicio)),historial:Object.freeze(intentos.map(x=>Object.freeze({...x}))),...extra});
 for(let n=0;n<POLITICA.intentos;n++){
  if(signal?.aborted)throw fallar('SQL_NO_DISPONIBLE',{cancelado:true});
  const restante=hasta-ahora();if(restante<100)throw fallar('SQL_NO_DISPONIBLE',{agotado:true});
  let pool,conectado=false,token=null,fatal=null,error,constructorIncierto=false;
  const opciones={...config,options:{...config.options,maxRetriesOnTransientErrors:0},pool:{...config.pool,min:0},connectionTimeout:Math.min(config.connectionTimeout,Math.floor(restante))};
  opciones.beforeConnect=c=>{
   c.on('errorMessage',t=>{token=tokenSeguro(t);if(token.numeroSQL!==null&&!TRANSITORIOS.has(token.numeroSQL))fatal=token;});
   if(typeof config.beforeConnect==='function')config.beforeConnect(c);
  };
  try{constructorIncierto=true;pool=new driver.ConnectionPool(opciones);constructorIncierto=false;pool.on('error',()=>{});await pool.connect();conectado=true;}
  catch(e){error=e;}
  if(conectado&&!signal?.aborted&&ahora()<hasta){
   const diagnostico=Object.freeze({perfil:PERFILES.has(perfil)?perfil:null,intentos:intentos.length+1,fallosPrevios:Object.freeze(intentos.map(i=>Object.freeze({...i}))),poolsPreviosCerrados:true});
   return{pool,diagnostico};
  }
  const numeroDirecto=entero(error?.number??error?.originalError?.info?.number,1,65535);
  ultimo={categoria:CODIGOS.has(error?.code)?error.code:'NO_CLASIFICADO',...(fatal||token||{numeroSQL:numeroDirecto,estadoSQL:null,claseSQL:null})};
  if(numeroDirecto!==null&&!fatal)ultimo.numeroSQL=numeroDirecto;
  intentos.push({...ultimo});
  let timerCierre;
  try{if(pool)await Promise.race([Promise.resolve().then(()=>pool.close()),new Promise((_,reject)=>{timerCierre=setTimeout(()=>reject(Error()),Math.max(1,Math.min(10000,hasta-ahora())));})]);else if(constructorIncierto)throw Error();}
  catch{throw fallar('CIERRE_INCOMPLETO',{poolsCerrados:false,estadoCierre:'incierto'});}
  finally{clearTimeout(timerCierre);opciones.password='';if(opciones.authentication)opciones.authentication={type:opciones.authentication.type,options:{}};}
  if(signal?.aborted)throw fallar('SQL_NO_DISPONIBLE',{cancelado:true});
  if(conectado||n+1===POLITICA.intentos||!TRANSITORIOS.has(ultimo.numeroSQL))throw fallar('SQL_NO_DISPONIBLE',{agotado:conectado||n+1===POLITICA.intentos});
  const aleatorio=azar();if(!Number.isFinite(aleatorio)||aleatorio<0||aleatorio>=1)throw fallar('SQL_NO_DISPONIBLE');
  const espera=POLITICA.esperasMs[n]+Math.floor(aleatorio*(POLITICA.jitterMaxMs+1));
  if(ahora()+espera+100>hasta)throw fallar('SQL_NO_DISPONIBLE',{agotado:true});
  intentos[intentos.length-1].esperaMs=espera;
  try{await esperar(espera);}catch{throw fallar('SQL_NO_DISPONIBLE',{cancelado:true});}
 }
 throw fallar('SQL_NO_DISPONIBLE',{agotado:true});
}
module.exports={abrirConexionSql,crearPlazo,POLITICA,tokenSeguro};
