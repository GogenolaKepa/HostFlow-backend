// Arranque personal opt-in. Importar este archivo no abre SQL ni lee secretos.
const fs=require('node:fs'),path=require('node:path');
const {once}=require('node:events');
const {prepararDependenciasWindows,SECRETOS_ENTORNO}=require('../src/services/DependenciasComercialesWindows');
const {crearSecretoCorreoExterno}=require('../src/security/comercial/SecretoCorreoExterno');
const {crearProveedorCorreoClixml}=require('../src/security/comercial/ProveedorCorreoClixml');
const procesosActivos=new WeakSet();
const {diagnostico}=require('../src/security/comercial/diagnosticoArranque');
async function comprobarPoolOperativo(pool){
 try{
  const r=await pool.request().query("SELECT DB_NAME() AS base,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS servidor,CONVERT(int,SERVERPROPERTY('EngineEdition')) AS motor,USER_NAME() AS principal;");
  const id=r.recordset?.[0];
  if(id?.base!=='HostFlow'||id.servidor!=='hostflow'||id.motor!==5||id.principal!=='hostflow_app')throw Error();
  return{principal:'hostflow_app',soloLectura:true};
 }catch{throw Error('Identidad SQL operativa no acreditada.');}
}
async function iniciarServidorIntegrado(comercial,tlsLocal){
 // El único servidor conserva su pool operativo además de los cuatro authcom.
 // Acreditar su identidad antes de preparación/login/escucha; nunca administrador.
 const servidor=require('../src/server');
 await comprobarPoolOperativo(await require('../src/config/database').poolPromise);
 return servidor.iniciar({comercial,tlsLocal});
}
function opciones(args){
 const r={};for(let i=0;i<args.length;i++){
  const k=args[i];if(!['--activar-comercial','--ventana-confirmada','--iniciar-worker','--sin-worker','--cuenta','--acreditacion','--proveedor-correo'].includes(k)||Object.hasOwn(r,k))throw Error('Argumentos no acreditados.');
  if(['--cuenta','--acreditacion','--proveedor-correo'].includes(k)){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Falta valor.');r[k]=args[++i];}else r[k]=true;
 }
 if(!r['--activar-comercial']||!r['--ventana-confirmada']||Boolean(r['--iniciar-worker'])===Boolean(r['--sin-worker'])||!r['--cuenta']||!r['--acreditacion'])throw Error('Arranque supervisado no autorizado.');
 return r;
}
function lectorWindows(){
 const carpeta=path.resolve(__dirname,'../../revision/activacion-real-authcom-2026-11-01');
 const m=JSON.parse(fs.readFileSync(path.join(carpeta,'LECTOR-DPAPI-NATIVO.json'),'utf8'));
 const ejecutable=path.resolve(carpeta,m.rutaRelativa);
 if(ejecutable!==path.resolve(__dirname,'../../revision/ejecucion-real-authcom-2026-11-01/bin/LectorDpapi.exe'))throw Error('Lector fuera del destino aprobado.');
 return require('../src/security/comercial/LectorCredencialDpapi').crearLectorCredencialDpapi({habilitado:true,ejecutable,sha256:m.sha256});
}
function proveedorWindows(archivo,cuenta){
 const ruta=path.resolve(archivo),stat=fs.lstatSync(ruta);
 if(path.extname(ruta).toLowerCase()!=='.json'||!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw Error('Configuración pública de correo no acreditada.');
 const c=JSON.parse(fs.readFileSync(ruta,'utf8'));
 if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['archivo','raizPrivada','formato','usuarioCredencial','ejecutable','sha256'].includes(k)))throw Error('Configuración de correo no acreditada.');
 return crearProveedorCorreoClixml({habilitado:true,...c,cuentaEsperada:cuenta});
}
async function ejecutar(args=process.argv.slice(2),puertos={}){
 const o=opciones(args),p=puertos.proceso??process,env=puertos.env??process.env;
 if(p.platform!=='win32'||!p.stdin?.isTTY||!p.stderr?.isTTY)throw Error('Requiere una terminal personal Windows.');
 if(env.HOSTFLOW_AUTH_COMERCIAL_ENABLED!=='1')throw Error('Comercial deshabilitado.');
 const acreditacion=(puertos.leerAcreditacion??(archivo=>JSON.parse(fs.readFileSync(path.resolve(archivo),'utf8'))))(o['--acreditacion']);
 if(procesosActivos.has(p))throw Error('Host ya iniciado o cierre pendiente.');
 procesosActivos.add(p);
 let lector,dependencias,servidor,cierre,secretoCorreo,etapa='DEPENDENCIAS_HOST',cierreExternoPendiente=false;
 const cerrar=()=>cierre??=(async()=>{
  let cerrado=true;
  try{servidor?.comercial?.desactivar();}catch{cerrado=false;}
  // Detener admisión y drenar HTTP antes de cerrar los pools que necesita.
  let httpDrenado=true;
  try{if(servidor?.listening)await new Promise((resolve,reject)=>servidor.close(e=>e?reject(e):resolve()));}catch{httpDrenado=false;cerrado=false;}
  // Un HTTP de cierre incierto puede conservar solicitudes activas: no romper SQL.
  if(!httpDrenado)return{cerrado:false};
  try{await servidor?.comercial?.cerrar();}catch{cerrado=false;}
  try{await servidor?.clientes?.cerrar();}catch{cerrado=false;}
  try{
   if(puertos.cerrarSQLPrincipal)await puertos.cerrarSQLPrincipal();
   else{const id=require.resolve('../src/config/database'),c=require.cache[id];if(c){if(typeof c.exports?.cerrarPool!=='function')throw Error('Cierre SQL no disponible.');await c.exports.cerrarPool();}}
  }catch{cerrado=false;}
  if(cierreExternoPendiente)cerrado=false;
  if(cerrado){
   try{await secretoCorreo?.cerrar();dependencias?.liberar();puertos.liberarSecretos?.();procesosActivos.delete(p);}catch{cerrado=false;}
  }
  for(const k of SECRETOS_ENTORNO)delete env[k];
  return{cerrado};
 })();
 try{
  if(typeof puertos.crearProveedorCorreo!=='function'&&!o['--proveedor-correo']||puertos.crearProveedorCorreo&&o['--proveedor-correo'])throw Error('Proveedor externo de correo pendiente o ambiguo.');
  dependencias=prepararDependenciasWindows({aprobacion:true,env,acreditacion,
   driver:puertos.driver??require('mssql'),obtenerCredencial:opciones=>lector(opciones),transportar:puertos.transportar??globalThis.fetch,
   obtenerSecretoCorreo:opciones=>secretoCorreo.obtener(opciones),clavesMemoria:puertos.clavesMemoria,tlsDirecto:Boolean(puertos.tlsLocal),politicaPiloto:puertos.politicaPiloto,alcancePublico:puertos.alcancePublico});
  // Las claves ya están en buffers de dependencias. Retirar el entorno ANTES
  // del primer auxiliar nativo, incluso la consulta de identidad SQL.
  for(const k of SECRETOS_ENTORNO)delete env[k];
  lector=(puertos.crearLector??lectorWindows)();
  etapa='IDENTIDAD_WINDOWS';
  const identidad=await lector.consultarIdentidad();
  if(typeof identidad?.cuenta!=='string'||identidad.cuenta.toLowerCase()!==o['--cuenta'].toLowerCase())throw Error('Cuenta Windows incompatible.');
  const proveedor=puertos.crearProveedorCorreo?puertos.crearProveedorCorreo():proveedorWindows(o['--proveedor-correo'],identidad.cuenta);
  secretoCorreo=crearSecretoCorreoExterno({proveedor,cuenta:identidad.cuenta,dominio:'hostflow.com.ar'});
  etapa='PROVEEDOR_LOCAL_CORREO';
  await secretoCorreo.inicializar();
  // Evitar que futuros hijos hereden estos secretos del entorno de ESTE proceso.
  for(const k of SECRETOS_ENTORNO)delete env[k];
  etapa='INICIAR_SERVIDOR';servidor=await(puertos.iniciarServidor??(comercial=>iniciarServidorIntegrado(comercial,puertos.tlsLocal)))(dependencias.comercial);
  if(servidor?.comercial?.estado!=='preparado')throw Error('Producto comercial no disponible.');
  etapa='ESPERAR_SERVIDOR';if(!servidor.listening)await once(servidor,'listening');
  const alCerrar=()=>{cerrar().then(r=>{if(!r.cerrado)p.exitCode=1;p.stderr.write(r.cerrado?'HostFlow cerrado.\n':'Cierre no acreditado; inspección necesaria.\n');});};
  p.once('SIGINT',alCerrar);p.once('SIGTERM',alCerrar);
  // Promesa del ciclo de vida, no se espera para bloquear el arranque.
  etapa='ACTIVAR_WORKER';if(o['--iniciar-worker'])Promise.resolve(servidor.comercial.iniciarWorker()).catch(()=>{p.exitCode=1;return cerrar();});
  return{estado:'iniciado',cerrar:async()=>{p.removeListener('SIGINT',alCerrar);p.removeListener('SIGTERM',alCerrar);return cerrar();}};
 }catch(error){cierreExternoPendiente=error?.codigo==='CIERRE_NO_ACREDITADO'||error?.codigo==='CIERRE_INCOMPLETO';const r=await cerrar();const e=Error('Host comercial no acreditado. Sin detalles privados.');e.diagnosticoArranque=diagnostico(etapa,error);if(!r.cerrado)e.codigo='CIERRE_NO_ACREDITADO';throw e;}
}
if(require.main===module)ejecutar().then(()=>console.log('Host comercial iniciado. No acredita operaciones ni entrega de correo.')).catch(()=>{console.error('Host comercial no iniciado. Revisar configuración y autorizaciones; sin reintento.');process.exitCode=1;});
module.exports={opciones,ejecutar,comprobarPoolOperativo};
