// Arranque personal opt-in. Importar este archivo no abre SQL ni lee secretos.
const fs=require('node:fs'),path=require('node:path');
const {once}=require('node:events');
const {prepararDependenciasWindows,SECRETOS_ENTORNO}=require('../src/services/DependenciasComercialesWindows');
function opciones(args){
 const r={};for(let i=0;i<args.length;i++){
  const k=args[i];if(!['--activar-comercial','--ventana-confirmada','--iniciar-worker','--cuenta','--acreditacion'].includes(k)||Object.hasOwn(r,k))throw Error('Argumentos no acreditados.');
  if(['--cuenta','--acreditacion'].includes(k)){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Falta valor.');r[k]=args[++i];}else r[k]=true;
 }
 if(!r['--activar-comercial']||!r['--ventana-confirmada']||!r['--iniciar-worker']||!r['--cuenta']||!r['--acreditacion'])throw Error('Arranque supervisado no autorizado.');
 return r;
}
function lectorWindows(){
 const carpeta=path.resolve(__dirname,'../../revision/activacion-real-authcom-2026-11-01');
 const m=JSON.parse(fs.readFileSync(path.join(carpeta,'LECTOR-DPAPI-NATIVO.json'),'utf8'));
 const ejecutable=path.resolve(carpeta,m.rutaRelativa);
 if(ejecutable!==path.resolve(__dirname,'../../revision/ejecucion-real-authcom-2026-11-01/bin/LectorDpapi.exe'))throw Error('Lector fuera del destino aprobado.');
 return require('../src/security/comercial/LectorCredencialDpapi').crearLectorCredencialDpapi({habilitado:true,ejecutable,sha256:m.sha256});
}
async function ejecutar(args=process.argv.slice(2),puertos={}){
 const o=opciones(args),p=puertos.proceso??process,env=puertos.env??process.env;
 if(p.platform!=='win32'||!p.stdin?.isTTY||!p.stderr?.isTTY)throw Error('Requiere una terminal personal Windows.');
 if(env.HOSTFLOW_AUTH_COMERCIAL_ENABLED!=='1')throw Error('Comercial deshabilitado.');
 const acreditacion=(puertos.leerAcreditacion??(archivo=>JSON.parse(fs.readFileSync(path.resolve(archivo),'utf8'))))(o['--acreditacion']);
 let lector,dependencias,servidor,cierre;
 const cerrar=()=>cierre??=(async()=>{
  let cerrado=true;
  try{servidor?.comercial?.desactivar();}catch{cerrado=false;}
  // Detener admisión y drenar HTTP antes de cerrar los pools que necesita.
  let httpDrenado=true;
  try{if(servidor?.listening)await new Promise((resolve,reject)=>servidor.close(e=>e?reject(e):resolve()));}catch{httpDrenado=false;cerrado=false;}
  // Un HTTP de cierre incierto puede conservar solicitudes activas: no romper SQL.
  if(!httpDrenado)return{cerrado:false};
  try{await servidor?.comercial?.cerrar();}catch{cerrado=false;}
  try{
   if(puertos.cerrarSQLPrincipal)await puertos.cerrarSQLPrincipal();
   else{const id=require.resolve('../src/config/database'),c=require.cache[id];if(c?.exports?.poolPromise)await(await c.exports.poolPromise).close();}
  }catch{cerrado=false;}
  if(cerrado)dependencias?.liberar();
  for(const k of SECRETOS_ENTORNO)delete env[k];
  return{cerrado};
 })();
 try{
  dependencias=prepararDependenciasWindows({aprobacion:true,env,acreditacion,
   driver:puertos.driver??require('mssql'),obtenerCredencial:opciones=>lector(opciones),transportar:puertos.transportar??globalThis.fetch});
  lector=(puertos.crearLector??lectorWindows)();
  const identidad=await lector.consultarIdentidad();
  if(typeof identidad?.cuenta!=='string'||identidad.cuenta.toLowerCase()!==o['--cuenta'].toLowerCase())throw Error('Cuenta Windows incompatible.');
  // Evitar que futuros hijos hereden estos secretos del entorno de ESTE proceso.
  for(const k of SECRETOS_ENTORNO)delete env[k];
  servidor=await(puertos.iniciarServidor??(comercial=>require('../src/server').iniciar({comercial})))(dependencias.comercial);
  if(servidor?.comercial?.estado!=='preparado')throw Error('Producto comercial no disponible.');
  if(!servidor.listening)await once(servidor,'listening');
  const alCerrar=()=>{cerrar().then(r=>{if(!r.cerrado)p.exitCode=1;p.stderr.write(r.cerrado?'HostFlow cerrado.\n':'Cierre no acreditado; inspección necesaria.\n');});};
  p.once('SIGINT',alCerrar);p.once('SIGTERM',alCerrar);
  // Promesa del ciclo de vida, no se espera para bloquear el arranque.
  Promise.resolve(servidor.comercial.iniciarWorker()).catch(()=>{p.exitCode=1;return cerrar();});
  return{estado:'iniciado',cerrar:async()=>{p.removeListener('SIGINT',alCerrar);p.removeListener('SIGTERM',alCerrar);return cerrar();}};
 }catch{await cerrar();throw Error('Host comercial no acreditado. Sin detalles privados.');}
}
if(require.main===module)ejecutar().then(()=>console.log('Host comercial iniciado. No acredita operaciones ni entrega de correo.')).catch(()=>{console.error('Host comercial no iniciado. Revisar configuración y autorizaciones; sin reintento.');process.exitCode=1;});
module.exports={opciones,ejecutar};
