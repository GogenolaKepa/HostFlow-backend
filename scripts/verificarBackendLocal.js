// Diagnóstico opt-in: un GET sin JWT, sin SQL/DPAPI ni workers. No habilita nada.
const URL_LOCAL='http://127.0.0.1:4000/api/auth/me';
async function verificarBackendLocal({transportar,timeoutMs=3000}={}){
 if(typeof transportar!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>5000)throw Error('Verificación local no configurada.');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeoutMs);
 try{
  const r=await transportar(URL_LOCAL,{method:'GET',headers:{Origin:'https://hostflow.com.ar'},credentials:'omit',redirect:'error',cache:'no-store',signal:abort.signal});
  if(r.status!==401||r.headers.get('access-control-allow-origin')!=='https://hostflow.com.ar'||r.headers.get('access-control-allow-credentials')==='true'||!/^application\/json\b/i.test(r.headers.get('content-type')||''))return{estado:'NO_ACREDITADO',motivo:'RESPUESTA_INESPERADA',escrituras:0};
  const cuerpo=await r.json();
  return cuerpo?.mensaje==='Debe iniciar sesión.'?{estado:'DISPONIBLE_PROTEGIDO',escrituras:0}:{estado:'NO_ACREDITADO',motivo:'CONTRATO_INESPERADO',escrituras:0};
 }catch(e){return{estado:'NO_ACREDITADO',motivo:abort.signal.aborted?'TIEMPO_AGOTADO':e?.cause?.code==='ECONNREFUSED'?'SERVICIO_APAGADO':'CONEXION_NO_ACREDITADA',escrituras:0};}
 finally{clearTimeout(timer);}
}
if(require.main===module){
 if(process.argv.slice(2).join(' ')!=='--read-only --local'){console.error('Requiere --read-only --local.');process.exitCode=1;}
 else verificarBackendLocal({transportar:globalThis.fetch}).then(r=>{console.log(JSON.stringify(r));if(r.estado!=='DISPONIBLE_PROTEGIDO')process.exitCode=1;});
}
module.exports={verificarBackendLocal,URL_LOCAL};
