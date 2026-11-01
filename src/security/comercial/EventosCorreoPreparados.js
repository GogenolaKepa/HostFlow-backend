const {createHmac,createHash,timingSafeEqual}=require('node:crypto');
const {TextDecoder}=require('node:util');
const TIPOS=new Set(['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed']);
class ErrorEventoCorreo extends Error{
  constructor(codigo){super('Evento de correo no acreditado.');this.codigo=codigo;}
}
function base64(valor){
  if(typeof valor!=='string'||!/^[-A-Za-z0-9+/]+=*$/.test(valor))throw new ErrorEventoCorreo('FIRMA_INVALIDA');
  const b=Buffer.from(valor,'base64');
  if(b.toString('base64').replace(/=+$/,'')!==valor.replace(/=+$/,''))throw new ErrorEventoCorreo('FIRMA_INVALIDA');
  return b;
}
// Verificador puro del contrato Svix/Resend. No lee secretos/env, monta rutas,
// almacena eventos ni presupone que una aceptación API significa entrega.
function crearVerificadorEventosCorreo({claves,ahora=Date.now,toleranciaSegundos=300}={}){
  if(!Array.isArray(claves)||claves.length<1||claves.length>2||typeof ahora!=='function'||!Number.isInteger(toleranciaSegundos)||toleranciaSegundos<1||toleranciaSegundos>300)throw new ErrorEventoCorreo('CONFIGURACION_INVALIDA');
  const keys=claves.map(k=>{if(typeof k!=='string'||!k.startsWith('whsec_'))throw new ErrorEventoCorreo('CONFIGURACION_INVALIDA');const b=base64(k.slice(6));if(b.length<16||b.length>64)throw new ErrorEventoCorreo('CONFIGURACION_INVALIDA');return b;});
  return ({cuerpo,headers}={})=>{
    if(!Buffer.isBuffer(cuerpo)||cuerpo.length===0||cuerpo.length>65536)throw new ErrorEventoCorreo('CUERPO_INVALIDO');
    const id=headers?.['svix-id'],ts=headers?.['svix-timestamp'],firma=headers?.['svix-signature'];
    if(typeof id!=='string'||!/^msg_[A-Za-z0-9_-]{1,120}$/.test(id)||typeof ts!=='string'||!/^\d{1,12}$/.test(ts)||typeof firma!=='string'||firma.length>1024)throw new ErrorEventoCorreo('FIRMA_INVALIDA');
    const tiempo=Number(ts),actual=ahora()/1000;
    if(!Number.isFinite(actual)||Math.abs(actual-tiempo)>toleranciaSegundos)throw new ErrorEventoCorreo('EVENTO_FUERA_DE_VENTANA');
    const firmas=firma.split(' ').filter(s=>s.startsWith('v1,')).map(s=>base64(s.slice(3)));
    const prefijo=Buffer.from(`${id}.${ts}.`);
    if(!keys.some(k=>{const esperada=createHmac('sha256',k).update(prefijo).update(cuerpo).digest();return firmas.some(f=>f.length===esperada.length&&timingSafeEqual(f,esperada));}))throw new ErrorEventoCorreo('FIRMA_INVALIDA');
    let p;try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(cuerpo));}catch{throw new ErrorEventoCorreo('CUERPO_INVALIDO');}
    const proveedorId=p?.data?.email_id;
    if(typeof p?.type!=='string'||!TIPOS.has(p.type)||typeof proveedorId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(proveedorId)||typeof p.created_at!=='string'||!Number.isFinite(Date.parse(p.created_at)))throw new ErrorEventoCorreo('EVENTO_NO_ADMITIDO');
    // No conservar destinatarios, asunto, URLs, headers ni cuerpo bruto.
    return Object.freeze({eventoId:id,proveedorId:proveedorId.toLowerCase(),tipo:p.type,ocurridoEn:new Date(p.created_at).toISOString(),huella:createHash('sha256').update(cuerpo).digest('hex')});
  };
}
async function recibirEventoCorreo({habilitado=false,verificar,repositorio,cuerpo,headers}={}){
  if(habilitado!==true)return {estado:'inactivo'};
  // Adaptador durable aún NO suministrado. La implementación futura debe resolver
  // correlación, deduplicación y efecto monotónico en una sola transacción.
  if(typeof verificar!=='function'||repositorio?.persistencia!=='sql-durable'||typeof repositorio.registrarEventoCorreo!=='function')throw new ErrorEventoCorreo('PERSISTENCIA_NO_ACREDITADA');
  const evento=verificar({cuerpo,headers});
  const r=await repositorio.registrarEventoCorreo(evento);
  if(!['registrado','duplicado','sin-correlacion'].includes(r?.estado))throw new ErrorEventoCorreo('RESULTADO_INCIERTO');
  return {estado:r.estado};
}
module.exports={crearVerificadorEventosCorreo,recibirEventoCorreo,ErrorEventoCorreo};
