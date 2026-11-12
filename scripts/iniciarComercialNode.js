// Bootstrap Node nuevo. No importa lectores DPAPI, ejecutables propios ni .env.
const path=require('node:path');
const {crearCustodia,PERFILES}=require('../src/security/comercial/CustodiaNode');
const privados=require('../src/security/comercial/ArchivosPrivadosWindows');
const {leerSecreto}=require('../src/security/comercial/EntradaSecretaTTY');
const {crearTransportePiloto,validarAmpliacion}=require('../src/security/comercial/TransportePiloto');
const {abrirPoolsComerciales}=require('../src/services/PoolsComercialesPreparados');
const {crearTlsLocal}=require('../src/security/comercial/TlsLocalNode');
const {limpiar}=require('../src/security/comercial/diagnosticoArranque');
function validarConfiguracion(c){
 if(['RESEND_API_KEY','HOSTFLOW_AUTH_COMERCIAL_CIFRADO_BASE64','HOSTFLOW_AUTH_COMERCIAL_INDICE_BASE64'].some(k=>Object.hasOwn(process.env,k)))throw Error('Entorno privado ambiguo.');
 const ampliado=Object.hasOwn(c||{},'ampliacionPresupuesto'),publico=Object.hasOwn(c||{},'publicacion');
 if(publico){const p=c.publicacion;if(ampliado||!p||Object.keys(p).sort().join('|')!=='alcance|confirmada|referencia|version'||p.version!==1||p.alcance!=='recuperacion'||p.confirmada!==true||typeof p.referencia!=='string'||!p.referencia.trim()||p.referencia.length>200||c.cuenta?.toLowerCase()!=='pc-escritorio\\kepa'||c.almacen!==path.join(String.raw`C:\Users\Kepa\AppData\Local\HostFlow\NodePilotoV1`,'almacen')||c.entorno?.NODE_ENV!=='production'||c.entorno.HOSTFLOW_PUBLICACION!=='cloudflare'||c.entorno.HOSTFLOW_PUBLICACION_CONFIRMADA!=='1'||c.entorno.HOST!=='127.0.0.1'||c.entorno.PORT!=='4000'||c.entorno.HOSTFLOW_AUTH_SOURCE!=='sql'||c.entorno.HOSTFLOW_AUTH_COMERCIAL_ORIGEN!=='https://hostflow.com.ar'||c.entorno.HOSTFLOW_CORS_ORIGINS!=='https://hostflow.com.ar')throw Error('Publicación no autorizada.');}
 if(!c||Object.keys(c).sort().join('|')!==['almacen','cuenta','entorno','acreditacion','presupuesto','ventana','certificadoLocal',...(ampliado?['ampliacionPresupuesto']:[]),...(publico?['publicacion']:[])].sort().join('|')||!/^[-A-Za-z0-9_.]+\\[^\\\r\n]+$/.test(c.cuenta||'')||c.entorno?.HOSTFLOW_AUTH_COMERCIAL_PROXIES)throw Error('Configuración no acreditada.');
 if(ampliado){
  validarAmpliacion(c.ampliacionPresupuesto);
  const control=String.raw`C:\Users\Kepa\AppData\Local\HostFlow\NodePilotoV1`;
  if(c.cuenta.toLowerCase()!=='pc-escritorio\\kepa'||c.almacen!==path.join(control,'almacen')||c.presupuesto!==path.join(control,'presupuesto-piloto-recuperacion-v1'))throw Error('Destino de ampliación no acreditado.');
 }
 if(!c.ventana||c.ventana.exclusividadConfirmada!==true||!Number.isFinite(Date.parse(c.ventana.hastaUTC))||Date.parse(c.ventana.hastaUTC)<Date.now()||Date.parse(c.ventana.hastaUTC)>Date.now()+30*60000)throw Error('Ventana vigente no acreditada.');
 if(c.entorno?.HOSTFLOW_MONEDAS_WRITE_ENABLED!=='0'||c.entorno.HOSTFLOW_CONFIGURACION_READ_ONLY!=='1'||c.entorno.HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED!=='0'||c.entorno.HOSTFLOW_AUTH_COMERCIAL_LIMITE_DIARIO!==(ampliado||publico?'6':'4'))throw Error('Protecciones de ventana no acreditadas.');
 if(Object.keys(c.entorno).some(k=>!['HOST','PORT',...(publico?['NODE_ENV','HOSTFLOW_PUBLICACION','HOSTFLOW_PUBLICACION_CONFIRMADA']:[]),'HOSTFLOW_AUTH_SOURCE','DB_SERVER','DB_DATABASE','HOSTFLOW_EMPRESA_ID','HOSTFLOW_AUTH_COMERCIAL_ENABLED','HOSTFLOW_AUTH_COMERCIAL_ORIGEN','HOSTFLOW_AUTH_COMERCIAL_REMITENTE','HOSTFLOW_AUTH_COMERCIAL_DOMINIO','HOSTFLOW_AUTH_COMERCIAL_LIMITE_DIARIO','HOSTFLOW_AUTH_COMERCIAL_PROXIES','HOSTFLOW_CORS_ORIGINS','HOSTFLOW_MONEDAS_WRITE_ENABLED','HOSTFLOW_CONFIGURACION_READ_ONLY','HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED','HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED'].includes(k)))throw Error('Configuración privada/inesperada.');
 return c;
}
function configuracion(archivo){return validarConfiguracion(JSON.parse(privados.leer(archivo).toString('utf8')));}
async function comprobarCuotaRecuperacion(pool){
 const r=await pool.request().query("SELECT Clave AS Contador,CASE WHEN Inicio>SYSUTCDATETIME() OR Ultima>SYSUTCDATETIME() OR Ultima<Inicio OR Cuenta<1 THEN NULL WHEN DATEADD(day,1,Inicio)>SYSUTCDATETIME() THEN Cuenta ELSE 0 END AS Vigente FROM authcom.Cuotas WHERE Proposito='correo-salida' AND Clave IN('ip:worker','destino:worker','global');");
 const filas=r.recordset;
 if(!Array.isArray(filas)||filas.length!==3||filas.map(f=>f.Contador).sort().join('|')!=='destino:worker|global|ip:worker'||![0,4].includes(filas[0]?.Vigente)||filas.some(f=>f.Vigente!==filas[0].Vigente))throw Error('Cuota de recuperación no acreditada.');
 return{vigente:filas[0].Vigente,limite:6}; // 0 solo tras caducidad natural; nunca reset manual.
}
async function comprobarCuotaPublica(pool){
 const r=await pool.request().query("SELECT Clave AS Contador,CASE WHEN Inicio>SYSUTCDATETIME() OR Ultima>SYSUTCDATETIME() OR Ultima<Inicio OR Cuenta<1 THEN NULL WHEN DATEADD(day,1,Inicio)>SYSUTCDATETIME() THEN Cuenta ELSE 0 END AS Vigente FROM authcom.Cuotas WHERE Proposito='correo-salida' AND Clave IN('ip:worker','destino:worker','global');");
 const f=r.recordset;
 if(!Array.isArray(f)||f.length!==3||f.map(x=>x.Contador).sort().join('|')!=='destino:worker|global|ip:worker'||!Number.isInteger(f[0]?.Vigente)||f[0].Vigente<0||f[0].Vigente>4||f.some(x=>x.Vigente!==f[0].Vigente))throw Error('Capacidad para recuperación y aviso no acreditada; no reiniciar cuotas.');
 return{vigente:f[0].Vigente,limite:6,disponibles:6-f[0].Vigente};
}
async function comprobarSql(runtime,{driver=require('mssql'),ampliacion,recuperacionPublica=false}={}){
 let pools;try{
  pools=await abrirPoolsComerciales({habilitado:true,driver,identidades:Object.fromEntries(Object.entries(PERFILES).map(([p,principal])=>[p,{tipo:'sql',principal}])),obtenerCredencial:runtime.lectorSql,timeoutMs:30000});
  const consultas=[['workerIngreso',"SELECT COUNT_BIG(*) AS pendientes FROM authcom.Ingresos WHERE Estado='pendiente' OR Sobre IS NOT NULL OR LeaseHasta>SYSUTCDATETIME();"],['workerIngreso','SELECT COUNT_BIG(*) AS pendientes FROM authcom.IngresoFallos;'],['cuentas',"SELECT COUNT_BIG(*) AS pendientes FROM authcom.Desafios WHERE ConsumidaEn IS NULL AND RevocadaEn IS NULL AND ExpiraEn>SYSUTCDATETIME();"],['correo',"SELECT COUNT_BIG(*) AS pendientes FROM authcom.Outbox WHERE Sobre IS NOT NULL OR Estado IN ('pendiente','procesando','fallida') OR EnCuarentena=1 OR LeaseHasta>SYSUTCDATETIME();"]];
  for(const [perfil,sql]of consultas){const r=await pools.pools[perfil].request().query(sql);const n=r.recordset?.[0]?.pendientes;if(![0,0n,'0'].includes(n))throw Error('Colas requieren revisión; no iniciar.');}
  if(ampliacion!==undefined){validarAmpliacion(ampliacion);await comprobarCuotaRecuperacion(pools.pools.correo);}
  if(recuperacionPublica)await comprobarCuotaPublica(pools.pools.correo);
  return{perfiles:4,colasVacias:true};
 }catch(error){
  // La factoría puede fallar mientras cierra un pool ANTES de devolverlo.
  // No confundir "no recibimos pools" con "ningún pool quedó abierto".
  if(error?.codigo==='CIERRE_INCOMPLETO'){const e=Error('Cierre SQL no acreditado.');e.codigo='CIERRE_NO_ACREDITADO';throw e;}
  throw error;
 }finally{try{await pools?.cerrar();}catch{const e=Error('Cierre SQL no acreditado.');e.codigo='CIERRE_NO_ACREDITADO';throw e;}}
}
async function iniciar({config,secreto,modo,puertos={}}){
 if(!['comprobar','escuchar','activar','reanudar-invitacion','publico'].includes(modo))throw Error('Modo no autorizado.');
 let runtime,tlsLocal,timer,etapa='CONFIGURACION';
 try{
  validarConfiguracion(config);
  if((modo==='publico')!==Boolean(config.publicacion))throw Error('Modo público no acreditado.');
  if(modo!=='comprobar'&&(!config.acreditacion?.referencia||!['sqlValidado','dominioVerificado','recuperacionVerificada','seguridadHttpVerificada'].every(k=>config.acreditacion[k]===true)))throw Error('Acta vigente pendiente.');
  etapa='CUSTODIA';const custodia=(puertos.crearCustodia||crearCustodia)({raiz:config.almacen,cuenta:config.cuenta});runtime=await custodia.abrirRuntime(secreto);secreto.fill(0);
  etapa='SQL_LECTURA';
  const prueba=modo==='reanudar-invitacion'
   ? await require('../src/services/ReanudacionInvitacionPiloto').comprobarReanudacion(runtime,{presupuesto:config.presupuesto,archivos:puertos.archivos||privados})
   : await(puertos.comprobarSql||comprobarSql)(runtime,{ampliacion:config.ampliacionPresupuesto,recuperacionPublica:modo==='publico'});
  if(modo==='comprobar'){runtime.cerrar();return prueba;}
  if(['activar','reanudar-invitacion','publico'].includes(modo)&&config.ventana.workerAutorizado!==true)throw Error('Worker no autorizado.');
  // La ventana puede haber vencido durante el KDF o la conexión SQL.
  validarConfiguracion(config);etapa='HTTPS_LOCAL';
  tlsLocal=(puertos.crearTlsLocal||crearTlsLocal)();
  (puertos.archivos||privados).escribirNuevo(config.certificadoLocal,tlsLocal.certificado);
  const env={...config.entorno,HOSTFLOW_AUTH_COMERCIAL_KEY_ID:runtime.keyId};
  const lector=runtime.lectorSql;lector.consultarIdentidad=async()=>runtime.identidad;
  // El modo público conserva cuotas SQL; nunca reutiliza ni resetea el presupuesto A2.
  const transportar=modo==='publico'?(puertos.transportar||globalThis.fetch):crearTransportePiloto({directorio:config.presupuesto,archivos:puertos.archivos||privados,transportar:puertos.transportar||globalThis.fetch,ampliacion:config.ampliacionPresupuesto,ventanaHastaUTC:config.ventana.hastaUTC});
  // Solo configuración pública temporal. No se escriben secretos al entorno.
  if(!puertos.ejecutar)for(const [k,v]of Object.entries(config.entorno))process.env[k]=v;
  const args=['--activar-comercial','--ventana-confirmada',['activar','reanudar-invitacion','publico'].includes(modo)?'--iniciar-worker':'--sin-worker','--cuenta',config.cuenta,'--acreditacion','ACTA_EN_MEMORIA'];
  etapa='HOST';const h=await(puertos.ejecutar||require('./iniciarComercialWindows').ejecutar)(args,{
   ...puertos,env,leerAcreditacion:()=>config.acreditacion,clavesMemoria:runtime.claves,crearLector:()=>lector,
   crearProveedorCorreo:()=>runtime.proveedorCorreo,transportar,tlsLocal:tlsLocal.opciones,politicaPiloto:modo!=='publico',alcancePublico:modo==='publico'?'recuperacion':null,
   liberarSecretos:()=>{clearTimeout(timer);runtime.cerrar();}});
  tlsLocal.liberar();
  timer=setTimeout(()=>Promise.resolve().then(()=>h.cerrar()).then(r=>{if(!r.cerrado)process.exitCode=1;}).catch(()=>{process.exitCode=1;}),Math.max(0,Date.parse(config.ventana.hastaUTC)-Date.now()));timer.unref?.();
  h.certificadoLocalSHA256=tlsLocal.sha256;
  return h;
 }catch(error){if(error?.codigo!=='CIERRE_NO_ACREDITADO')runtime?.cerrar();const e=Error('Arranque Node no acreditado; sin detalles privados.');e.etapa=etapa;const d=limpiar(error?.diagnosticoArranque);if(d)e.diagnosticoArranque=d;if(error?.codigo==='CIERRE_NO_ACREDITADO')e.codigo=error.codigo;throw e;}
 finally{secreto.fill(0);tlsLocal?.liberar();}
}
if(require.main===module)(async()=>{
 let etapa='ARGUMENTOS',secreto;
 try{
  if(process.argv.length!==5||process.argv[2]!=='--configuracion'||!['--comprobar','--escuchar','--activar-worker','--reanudar-invitacion-piloto','--recuperacion-publica'].includes(process.argv[4]))throw Error();
  etapa='CONFIGURACION';const c=configuracion(path.resolve(process.argv[3]));
  etapa='IDENTIDAD';privados.identidad(c.cuenta);
  etapa='DESBLOQUEO';secreto=await leerSecreto('Secreto maestro del gestor (entrada oculta):');
  etapa='PREFLIGHT_ARRANQUE';const r=await iniciar({config:c,secreto,modo:process.argv[4]==='--comprobar'?'comprobar':process.argv[4]==='--escuchar'?'escuchar':process.argv[4]==='--reanudar-invitacion-piloto'?'reanudar-invitacion':process.argv[4]==='--recuperacion-publica'?'publico':'activar'});
  console.log(JSON.stringify({resultado:'ACREDITADO',modo:process.argv[4],...(r?.perfiles?{perfiles:r.perfiles,colasVacias:r.colasVacias}:{}),worker:['--activar-worker','--reanudar-invitacion-piloto','--recuperacion-publica'].includes(process.argv[4])}));
 }catch(e){console.error(JSON.stringify({resultado:'NO_ACREDITADO',etapa:e.etapa||etapa,cierreIncierto:e.codigo==='CIERRE_NO_ACREDITADO',secretosExpuestos:false}));process.exitCode=1;}
 finally{secreto?.fill(0);}
})();
module.exports={iniciar,comprobarSql,comprobarCuotaRecuperacion,comprobarCuotaPublica,configuracion,validarConfiguracion};
