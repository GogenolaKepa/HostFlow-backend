// Adaptador opt-in, sin PowerShell, red, .env o lectura al importar.
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const {spawn}=require('node:child_process');
const PRINCIPALES=Object.freeze({ingresoHttp:'hostflow_auth_ingreso',workerIngreso:'hostflow_auth_worker',cuentas:'hostflow_auth_cuentas',correo:'hostflow_auth_correo'});
function crearLectorCredencialDpapi({habilitado=false,ejecutable,sha256,timeoutMs=5000}={}){
 if(habilitado!==true)return async()=>{throw Error('Lector DPAPI inactivo.');};
 if(process.platform!=='win32'||!path.isAbsolute(ejecutable||'')||path.extname(ejecutable).toLowerCase()!=='.exe'||!/^[a-f0-9]{64}$/.test(sha256||'')||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw TypeError('Auxiliar DPAPI no acreditado.');
 function consultar(args,signal,validar){
  return new Promise((resolve,reject)=>{
   const fallo=()=>Error('Credencial privada no acreditada.');
   if(signal?.aborted){reject(fallo());return;}
   try{if(crypto.createHash('sha256').update(fs.readFileSync(ejecutable)).digest('hex')!==sha256)throw Error();}catch{reject(fallo());return;}
   let p,partes=[],bytes=0,listo=false,timer;
   function limpiar(){clearTimeout(timer);signal?.removeEventListener('abort',abortar);for(const b of partes)b.fill(0);partes=[];}
   function terminar(error,valor){if(listo)return;listo=true;limpiar();if(error)reject(fallo());else resolve(valor);}
   function abortar(){p?.kill();terminar(true);}
   try{p=spawn(ejecutable,args,{windowsHide:true,shell:false,stdio:['ignore','pipe','ignore']});}catch{terminar(true);return;}
   signal?.addEventListener('abort',abortar,{once:true});
   timer=setTimeout(abortar,timeoutMs);
   p.stdout.on('data',b=>{if(listo){b.fill(0);return;}bytes+=b.length;if(bytes>8192){b.fill(0);abortar();return;}partes.push(b);});
   p.once('error',()=>terminar(true));
   p.once('close',codigo=>{
    if(listo)return;
    if(codigo!==0){terminar(true);return;}
    let unido;
    try{unido=Buffer.concat(partes);const valor=JSON.parse(unido.toString('utf8'));if(!validar(valor))throw Error();terminar(false,valor);}catch{terminar(true);}finally{unido?.fill(0);}
   });
  });
 }
 const leer=async({perfil,principal,signal}={})=>{
  if(!Object.hasOwn(PRINCIPALES,perfil)||principal!==undefined&&principal!==PRINCIPALES[perfil])throw Error('Perfil DPAPI no acreditado.');
  return consultar(['--read',perfil],signal,v=>v&&Object.keys(v).length===2&&v.user===PRINCIPALES[perfil]&&typeof v.password==='string'&&v.password.length>=32&&v.password.length<=128&&!/[\x00-\x1f\x7f]/.test(v.password));
 };
 leer.consultarIdentidad=({signal}={})=>consultar(['--identity'],signal,v=>v?.windows===true&&typeof v.cuenta==='string'&&/^S-1-5-21-\d+-\d+-\d+-\d+$/.test(v.sid||''));
 leer.verificarAlmacen=({signal}={})=>consultar(['--verify'],signal,v=>v?.perfiles===4&&v.aclPrivada===true&&v.dpapi===true);
 leer.provisionar=async({cuentaWindowsConfirmada,autorizar=false,signal}={})=>{
  if(autorizar!==true||typeof cuentaWindowsConfirmada!=='string'||!cuentaWindowsConfirmada)throw Error('Aprovisionamiento DPAPI no autorizado.');
  const id=await leer.consultarIdentidad({signal});
  if(id.cuenta.toLowerCase()!==cuentaWindowsConfirmada.toLowerCase())throw Error('Cuenta ejecutora distinta de la confirmada.');
  return consultar(['--provision','--account',cuentaWindowsConfirmada,'--authorize'],signal,v=>v?.perfiles===4&&v.aclPrivada===true&&v.dpapi===true&&v.azure===false);
 };
 return leer;
}
module.exports={crearLectorCredencialDpapi};
