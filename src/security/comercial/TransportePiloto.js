const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {EMAIL_PILOTO}=require('../pilotoAutenticacion');
function validarAmpliacion(a){
 const campos=['version','referencia','usuarioId','maximoLocal','limiteSQL','reservasPrevias'];
 if(!a||Object.keys(a).sort().join('|')!==campos.sort().join('|')||a.version!==1||a.referencia!=='RECUPERACION-OPERADOR3-A1'||a.usuarioId!==3||a.maximoLocal!==5||a.limiteSQL!==6||!Array.isArray(a.reservasPrevias)||a.reservasPrevias.length!==3)throw Error('Ampliación no acreditada.');
 for(let i=0;i<3;i++){
  const p=a.reservasPrevias[i];
  if(!p||Object.keys(p).sort().join('|')!=='archivo|sha256'||p.archivo!==`envio-${i+1}.json`||!/^[a-f0-9]{64}$/.test(p.sha256||''))throw Error('Ancla de presupuesto no acreditada.');
 }
 return a;
}
function crearTransportePiloto({directorio,archivos,transportar,ampliacion,ventanaHastaUTC}={}){
 if(!archivos||typeof transportar!=='function')throw Error('Transporte de ensayo no acreditado.');
 directorio=archivos.ruta(directorio);archivos.verificar(directorio);
 const extendido=ampliacion!==undefined;
 const anclas=extendido?validarAmpliacion(ampliacion).reservasPrevias.map(p=>({...p})):null;
 const comprobarAmpliacion=()=>{
  if(!extendido)return;
  const hasta=Date.parse(ventanaHastaUTC);
  if(!Number.isFinite(hasta)||hasta<=Date.now()||hasta>Date.now()+30*60000)throw Error('Ventana de ampliación no acreditada.');
  archivos.verificar(directorio);
  for(const p of anclas){const b=archivos.leer(path.join(directorio,p.archivo));if(crypto.createHash('sha256').update(b).digest('hex')!==p.sha256)throw Error('Presupuesto anterior no acreditado.');}
 };
 comprobarAmpliacion();
 // Una sola ventana inicial. Un intento parcial requiere diagnóstico, no reinicio.
 if(extendido&&[4,5].some(n=>fs.existsSync(path.join(directorio,`envio-${n}.json`))))throw Error('Ampliación ya utilizada; detener.');
 return async(url,opciones)=>{
  if(url!=='https://api.resend.com/emails'||typeof opciones?.body!=='string')throw Error('Envío de ensayo bloqueado.');
  let d;try{d=JSON.parse(opciones.body);}catch{throw Error('Envío de ensayo bloqueado.');}
  const to=Array.isArray(d.to)?d.to:[d.to];
  if(to.length!==1||to[0]!==EMAIL_PILOTO||d.cc!==undefined||d.bcc!==undefined||d.from!=='HostFlow Seguridad <seguridad@hostflow.com.ar>')throw Error('Envío de ensayo bloqueado.');
  archivos.verificar(directorio);comprobarAmpliacion();
  let reservado=false;
  for(let n=1;n<=(extendido?5:4);n++){
   const archivo=path.join(directorio,'envio-'+n+'.json');
   if(fs.existsSync(archivo)){archivos.leer(archivo);continue;}
   if(extendido&&(n!==4&&n!==5||d.subject!==(n===4?'Recuperá tu acceso a HostFlow':'Tu contraseña de HostFlow cambió')))throw Error('Correo fuera de la ampliación autorizada.');
   // Reservar ANTES del envío, incluso ante resultado incierto. Sin reinicio de cuota.
   archivos.escribirNuevo(archivo,Buffer.from(JSON.stringify({version:1,id:crypto.randomUUID(),fechaUTC:new Date().toISOString(),...(extendido?{ampliacion:'RECUPERACION-OPERADOR3-A1',clase:n===4?'recuperacion':'aviso-cambio'}:{})})));reservado=true;break;
  }
  if(!reservado)throw Error('Presupuesto total de ensayo agotado.');
  return transportar(url,opciones);
 };
}
module.exports={crearTransportePiloto,validarAmpliacion};
