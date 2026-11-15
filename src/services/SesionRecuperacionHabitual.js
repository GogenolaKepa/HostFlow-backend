// Supervisión sobre el host/worker existentes. Ninguna señal emulada ni kill.
function crearSesionHabitual({control,crearHost,comprobarHost=async()=>{},crearTunnel,verificar,alCerrar=async()=>{},avisar=()=>{},proceso=process,intervaloMs=1000}={}){
 if(!control?.sellar||![crearHost,crearTunnel,verificar,alCerrar,avisar].every(f=>typeof f==='function'))throw TypeError('Puertos de sesión incompletos.');
 let host,tunnel,cierre,monitor,terminando=false,worker=false,fallo=false,cierreIncierto=false;let resolver;
 const terminado=new Promise(r=>{resolver=r;});
 const cerrar=()=>cierre??=(async()=>{
  terminando=true;control.sellar();clearInterval(monitor);host?.desactivar();
  // El Tunnel tiene su ventana propia. Un único Ctrl+C allí permite detectar
  // su salida antes de drenar HTTP, worker y SQL. Nunca child.kill().
  if(tunnel&&!tunnel.terminado())avisar('CTRL_C_EN_LA_VENTANA_CLOUDFLARE_PARA_COMPLETAR_CIERRE');
  if(tunnel)await tunnel.cerrado;
  const r=host?await host.cerrar():{cerrado:!cierreIncierto};
  if(r?.cerrado!==true||cierreIncierto){fallo=true;avisar('CIERRE_INCIERTO_CONSERVAR_TERMINAL_Y_LOCK');resolver({cerrado:false});return{cerrado:false};}
  await alCerrar();proceso.removeListener('SIGINT',señal);proceso.removeListener('SIGTERM',señal);proceso.removeListener('SIGBREAK',señal);
  avisar(fallo?'HOSTFLOW_CERRADO_TRAS_FALLO':'HOSTFLOW_CERRADO');resolver({cerrado:true});return{cerrado:true};
 })().catch(()=>{fallo=true;avisar('CIERRE_INCIERTO_CONSERVAR_TERMINAL_Y_LOCK');resolver({cerrado:false});return{cerrado:false};});
 const fallar=codigo=>{if(terminando)return;fallo=true;control.sellar();host?.desactivar();avisar(codigo);if(tunnel&&!tunnel.terminado())avisar('PRESIONE_CTRL_C_PARA_CERRAR_TUNNEL');return cerrar();};
 const señal=()=>{cerrar();};
 for(const s of ['SIGINT','SIGTERM','SIGBREAK'])proceso.on(s,señal);
 async function iniciar(){
  try{
   host=await crearHost();if(terminando)throw Error();await comprobarHost();if(terminando)throw Error();
   tunnel=await crearTunnel(codigo=>fallar(codigo));
   tunnel.cerrado.then(()=>{if(!terminando){avisar('TUNNEL_FINALIZADO');cerrar();}});
   await tunnel.listo;if(terminando)throw Error();
   const evidencia=await verificar();if(terminando||tunnel.terminado())throw Error();
   control.acreditar(evidencia);host.iniciarWorker();worker=true;
   if(host.consultar()?.worker?.estado!=='activo')throw Error();
   avisar('HOSTFLOW_HABITUAL_DISPONIBLE');
   monitor=setInterval(()=>{try{if(worker&&host.consultar()?.worker?.estado!=='activo')fallar('WORKER_DETENIDO_API_SELLADA');}catch{fallar('ESTADO_OPERATIVO_INCIERTO');}},intervaloMs);
   return evidencia;
  }catch(e){if(['CIERRE_NO_ACREDITADO','CIERRE_INCOMPLETO'].includes(e?.codigo))cierreIncierto=true;fallar('ARRANQUE_NO_ACREDITADO_API_SELLADA');return null;}
 }
 return{iniciar,cerrar,fallar,terminado,consultar:()=>({terminando,worker,fallo})};
}
module.exports={crearSesionHabitual};
