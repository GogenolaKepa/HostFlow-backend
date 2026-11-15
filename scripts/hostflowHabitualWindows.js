// Consola personal única. No activa por importación, no almacena el maestro.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),https=require('node:https'),http=require('node:http'),{EventEmitter}=require('node:events');
const C=require('../src/security/comercial/ConfiguracionHabitualWindows'),T=require('../src/security/comercial/TunnelRecuperacionWindows');
const {crearControlPublicoHabitual,transporteHabitual}=require('../src/security/comercial/ControlPublicoHabitual');
function procesoDelHost(proceso){const p=new EventEmitter();for(const k of ['platform','stdin','stderr'])p[k]=proceso[k];Object.defineProperty(p,'exitCode',{get:()=>proceso.exitCode,set:n=>{proceso.exitCode=n;}});return p;}
function tlsOrigen(pem,huella){return new Promise((resolve,reject)=>{
 const q=https.get({host:'127.0.0.1',port:4000,path:'/api/cuentas-comerciales/capacidades',servername:'localhost',headers:{Host:'api.hostflow.com.ar'},ca:pem,rejectUnauthorized:true,minVersion:'TLSv1.2',timeout:5000},r=>{let b='';const valido=r.socket.authorized===true&&crypto.createHash('sha256').update(r.socket.getPeerCertificate().raw).digest('hex')===huella;r.on('data',p=>{if(b.length<4096)b+=p.toString('utf8');});r.on('error',()=>reject(Error()));r.on('end',()=>{let d;try{d=JSON.parse(b);}catch{}if(!valido||r.statusCode!==403||d?.codigo!=='BORDE_PUBLICO_NO_ACREDITADO')reject(Error());else resolve();});});q.on('timeout',()=>q.destroy());q.on('error',()=>reject(Error('TLS origen no acreditado.')));
});}
function listoLocal(){return new Promise(resolve=>{const q=http.get({host:'127.0.0.1',port:20241,path:'/ready',timeout:1500},r=>{r.resume();resolve(r.statusCode===200);});q.on('timeout',()=>q.destroy());q.on('error',()=>resolve(false));});}
async function crearTunnel({archivo,dns,onFallo,procesos=require('../src/security/comercial/ProcesoTunnelWindows'),listoLocal:ready=listoLocal,intervaloMs=2000,ahora=Date.now}={}){
 const id=await procesos.abrirVentana(T.argumentos(archivo,dns),{onIncierto:onFallo});let fin=false,acreditado=false,inicio=ahora(),monitor,resolverListo,rechazarListo,resolverCierre;
 const listo=new Promise((r,j)=>{resolverListo=r;rechazarListo=j;}),cerrado=new Promise(r=>{resolverCierre=r;});
 id.cerrado.then(()=>{fin=true;clearTimeout(monitor);rechazarListo(Error());resolverCierre();});
 async function observar(){
  try{if(fin)return;
   const sano=await ready();if(sano&&!acreditado){acreditado=true;resolverListo();}
   else if(!sano&&(acreditado||ahora()-inicio>=60000)){rechazarListo(Error());onFallo('TUNNEL_NO_DISPONIBLE_API_SELLADA');}
  }catch{rechazarListo(Error());onFallo('ESTADO_TUNNEL_INCIERTO_CTRL_C_EN_SU_VENTANA');}
  if(!fin)monitor=setTimeout(observar,intervaloMs);
 }
 monitor=setTimeout(observar,0);return{listo,cerrado,terminado:()=>fin,pid:id.pid};
}
async function iniciar({archivo=path.join(C.ROOT,'configuracion.json'),proceso=process,puertos={}}={}){
 let maestro,runtime,tls,sesion,lock,propietarioLock,certTimer;const archivos=puertos.archivos||require('../src/security/comercial/ArchivosPrivadosWindows'),disco=puertos.disco||fs;
 const avisar=codigo=>proceso.stderr.write(codigo+'\n');
 try{
  if(proceso.platform!=='win32'||!proceso.stdin?.isTTY||!proceso.stderr?.isTTY)throw Error();T.comprobarEntorno();
  const cfg=C.validarConfiguracionHabitual(JSON.parse(archivos.leer(C.rutaConfiguracion(archivo)).toString('utf8')));archivos.identidad(cfg.cuenta);archivos.verificar(C.ROOT);
  (puertos.comprobarSinServicios||require('../src/security/comercial/ProcesoTunnelWindows').comprobarSinServicios)();
  archivos.verificar(path.resolve(__dirname,'../.env')); // Solo ACL; el servidor carga su JWT/SQL operativo por ruta estable.
  (puertos.comprobarTunnel||T.comprobarBinarioYReferencia)(archivos); // Metadatos antes del maestro o SQL.
  const ref=cfg.acreditacion.referencia+'-'+crypto.randomUUID();lock=path.join(C.ROOT,'sesion-activa.json');propietarioLock=JSON.stringify({version:1,referencia:ref,pid:proceso.pid,fechaUTC:new Date().toISOString()});archivos.escribirNuevo(lock,Buffer.from(propietarioLock));
  maestro=await(puertos.leerSecreto||require('../src/security/comercial/EntradaSecretaTTY').leerSecreto)('Maestro operativo (entrada oculta):');
  runtime=await(puertos.crearCustodia||require('../src/security/comercial/CustodiaNode').crearCustodia)({raiz:cfg.almacen,cuenta:cfg.cuenta}).abrirRuntime(maestro);maestro.fill(0);
  const protector=require('../src/security/comercial/AnilloClavesCorreo').crearAnilloClavesCorreo({activa:runtime.keyId,claves:[{keyId:runtime.keyId,clave:runtime.claves.cifrado}]});
  try{
   const previo=await(puertos.comprobarSql||require('../src/services/PreflightRecuperacionHabitual').comprobarHabitual)({runtime:{...runtime,protectorHabitual:protector},politica:cfg.politica});
   if(previo?.ingresosPendientes!==0||previo?.outboxPendiente!==0){avisar('COLAS_NO_VACIAS_O_DESCONOCIDAS_NO_ACTIVAR');throw Error('Colas requieren revisión antes de activar.');}
  }finally{protector.liberar();}
  const dns=await(puertos.comprobarDNS||T.comprobarDNS)((puertos.servidoresWindows||T.servidoresWindows)());
  tls=(puertos.crearTls||require('../src/security/comercial/TlsLocalNode').crearTlsLocal)();const pem=path.join(C.ROOT,'certificado.'+ref+'.pem'),yml=path.join(C.ROOT,'tunnel.'+ref+'.yml');archivos.escribirNuevo(pem,tls.certificado);archivos.escribirNuevo(yml,Buffer.from(T.yaml(pem)));(puertos.validarOffline||T.validarOffline)(yml);
  const control=crearControlPublicoHabitual(),env={...C.entornoHabitual(),HOSTFLOW_AUTH_COMERCIAL_KEY_ID:runtime.keyId},lector=runtime.lectorSql;lector.consultarIdentidad=async()=>runtime.identidad;
  for(const [k,v]of Object.entries(env))process.env[k]=v;
  let primerFallo;
  const ejecutarPaso=async(fase,operacion)=>{
   try{return await operacion();}catch(error){
    if(!primerFallo){
     primerFallo={version:1,fechaUTC:new Date().toISOString(),fase,diagnostico:require('../src/security/comercial/diagnosticoArranque').diagnostico('VALIDACION_HOST',error)};
     // Solo fase y categorías cerradas. Nunca mensajes, stack, causas o secretos.
     try{archivos.escribirNuevo(path.join(C.ROOT,'fallo.'+ref+'.json'),Buffer.from(JSON.stringify(primerFallo)));}catch{avisar('DIAGNOSTICO_LOCAL_NO_PERSISTIDO');}
     avisar(JSON.stringify({resultado:'FALLO_HABITUAL_SANITIZADO',...primerFallo}));
    }
    throw error;
   }
  };
  const limpiar=async()=>{clearTimeout(certTimer);runtime?.cerrar();if(archivos.leer(lock).toString('utf8')!==propietarioLock)throw Error();archivos.escribirNuevo(path.join(C.ROOT,'cerrado.'+ref+'.json'),Buffer.from(JSON.stringify({version:1,referencia:ref,fechaUTC:new Date().toISOString(),cerrado:true})));disco.unlinkSync(lock);};
  sesion=require('../src/services/SesionRecuperacionHabitual').crearSesionHabitual({control,proceso,avisar,alCerrar:limpiar,
   crearHost:()=>ejecutarPaso('CREAR_HOST',async()=>{const h=await(puertos.ejecutarHost||require('./iniciarComercialWindows').ejecutar)(['--activar-comercial','--ventana-confirmada','--sin-worker','--cuenta',cfg.cuenta,'--acreditacion','ACTA_EN_MEMORIA'],{
    proceso:procesoDelHost(proceso),env,leerAcreditacion:()=>cfg.acreditacion,clavesMemoria:runtime.claves,crearLector:()=>lector,crearProveedorCorreo:()=>runtime.proveedorCorreo,transportar:transporteHabitual(control,puertos.transportar||globalThis.fetch),tlsLocal:tls.opciones,politicaPiloto:false,politicaHabitual:cfg.politica,alcancePublico:'recuperacion-habitual',controlPublico:control,liberarSecretos:()=>runtime.cerrar()});
    return h;}),
   comprobarHost:()=>ejecutarPaso('TLS_ORIGEN',async()=>{tls.liberar();await(puertos.tlsOrigen||tlsOrigen)(tls.certificado,tls.sha256);}),
   crearTunnel:onFallo=>ejecutarPaso('PREPARAR_TUNNEL',()=>(puertos.crearTunnel||crearTunnel)({archivo:yml,dns,onFallo})),
   verificar:()=>ejecutarPaso('GET_PUBLICOS',async()=>{const e=await(puertos.verificarBorde||require('../src/security/comercial/VerificacionBordeHabitual').verificarBorde)();archivos.escribirNuevo(path.join(C.ROOT,'borde.'+ref+'.json'),Buffer.from(JSON.stringify(e)));return e;}),
  });
  // No ventana artificial: el certificado de sesión sí debe seguir siendo válido.
  const vence=new crypto.X509Certificate(tls.certificado).validTo;
  certTimer=setTimeout(()=>sesion.fallar('CERTIFICADO_POR_VENCER_REINICIAR_SEGURO'),Math.max(0,Date.parse(vence)-Date.now()-60000));
  certTimer.unref?.();
  await sesion.iniciar();const resultado=await sesion.terminado;if(!resultado.cerrado)proceso.exitCode=1;return resultado;
 }catch{
  maestro?.fill(0);tls?.liberar();
  if(sesion){await sesion.fallar('ARRANQUE_HABITUAL_NO_ACREDITADO');return{cerrado:false};}
  runtime?.cerrar();avisar('ARRANQUE_HABITUAL_NO_ACREDITADO_CONSERVAR_LOCK');proceso.exitCode=1;return{cerrado:false};
 }finally{maestro?.fill(0);}
}
function estado(){const p=path.join(C.ROOT,'sesion-activa.json');if(!fs.existsSync(p))return{resultado:'SIN_SESION_HABITUAL',inicia:false};const a=require('../src/security/comercial/ArchivosPrivadosWindows');a.identidad('PC-ESCRITORIO\\Kepa');const s=JSON.parse(a.leer(p).toString('utf8'));return{resultado:'SESION_REGISTRADA',pid:s.pid,referencia:s.referencia,instruccion:'En su consola, Ctrl+C una vez. Esperar HOSTFLOW_CERRADO. No taskkill ni cierre forzado.'};}
if(require.main===module){const args=process.argv.slice(2);if(args.length===1&&args[0]==='--estado'){try{console.log(JSON.stringify(estado()));}catch{console.error('ESTADO_NO_ACREDITADO');process.exitCode=1;}}else if(args.length===1&&args[0]==='--iniciar'){iniciar().catch(()=>{console.error('CIERRE_NO_ACREDITADO');process.exitCode=1;});}else{console.error('Uso: --iniciar o --estado. Requiere configuración aprobada; no inicia por defecto.');process.exitCode=1;}}
module.exports={iniciar,estado,crearTunnel,procesoDelHost,tlsOrigen,listoLocal};
