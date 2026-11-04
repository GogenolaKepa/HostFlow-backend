const {normalizarEmail} = require('../seguridadUsuarios');
const {crearPlantillaCorreo} = require('./plantillasCorreo');
const {origenPublico}=require('./origenPublico');
class ErrorCorreo extends Error {
  constructor(codigo,{politica='reintentar',demoraMs=60000}={}) {super('No se pudo acreditar la entrega del correo.');Object.assign(this,{codigo,politica,demoraMs});}
}
class ResendCorreo {
  constructor({habilitado=false,obtenerSecreto,remitente,dominioVerificado,origen,transportar,timeoutMs=10000}={}) {
    if(typeof obtenerSecreto!=='function' || typeof transportar!=='function' || !Number.isInteger(timeoutMs) || timeoutMs<100 || timeoutMs>30000) throw TypeError('Faltan dependencias de correo explícitas.');
    const email=normalizarEmail(remitente);
    if(typeof dominioVerificado!=='string' || email.split('@')[1]!==dominioVerificado.toLowerCase() || /[\r\n]/.test(remitente)) throw TypeError('Remitente no acreditado.');
    origenPublico(origen);
    Object.assign(this,{habilitado,obtenerSecreto,remitente:email,origen,transportar,timeoutMs});
  }
  async enviar(payload,{antesDeEnviar}={}) {
    if(this.habilitado!==true) throw new ErrorCorreo('CORREO_INACTIVO',{politica:'cuarentena'});
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload?.idempotencyKey||'')) throw new ErrorCorreo('CORREO_INVALIDO',{politica:'cuarentena'});
    const controller=new AbortController();
    let timer,envioIniciado=false;
    const ejecutar=async()=>{
      let correo,clave;
      try {
        try{
          correo=crearPlantillaCorreo(payload,this.origen);
          clave=await this.obtenerSecreto({signal:controller.signal});
          if(controller.signal.aborted||typeof clave!=='string'||!clave.trim()||/[\r\n\s]/.test(clave))throw Error();
        }catch{throw new ErrorCorreo('CONFIGURACION_CORREO_INVALIDA',{politica:'cuarentena'});}
        if(antesDeEnviar){
          let vigente;
          try{if(typeof antesDeEnviar!=='function')throw Error();vigente=await antesDeEnviar();}
          catch{throw new ErrorCorreo('VIGENCIA_NO_ACREDITADA',{politica:'cuarentena'});}
          if(vigente!==true)throw new ErrorCorreo('ENTREGA_OBSOLETA',{politica:'cuarentena'});
          if(controller.signal.aborted)throw new ErrorCorreo('ENTREGA_OBSOLETA',{politica:'cuarentena'});
        }
        envioIniciado=true;
        const r=await this.transportar('https://api.resend.com/emails',{
          method:'POST',redirect:'error',signal:controller.signal,
          headers:{Authorization:`Bearer ${clave}`,'Content-Type':'application/json','Idempotency-Key':`hostflow/${payload.idempotencyKey}`},
          body:JSON.stringify({from:`HostFlow <${this.remitente}>`,to:[correo.destinatario],subject:correo.subject,html:correo.html,text:correo.text}),
        });
        if(r.status!==200 && r.status!==201){
          const demora=Number(r.headers?.get?.('retry-after'));
          const demoraMs=Number.isFinite(demora)&&demora>0?Math.min(900000,Math.max(60000,demora*1000)):60000;
          const codigo=[401,403].includes(r.status)?'CONFIGURACION_CORREO_INVALIDA':r.status>=500?'ENTREGA_INCIERTA':'PROVEEDOR_NO_ACEPTO';
          throw new ErrorCorreo(codigo,{politica:r.status===429||r.status>=500?'reintentar':'cuarentena',demoraMs});
        }
        const data=await r.json();
        if(typeof data?.id!=='string'||!/^[a-f0-9-]{36}$/i.test(data.id))throw new ErrorCorreo('ENTREGA_INCIERTA');
        return {estado:'aceptada',id:data.id}; // Aceptada por la API, no acredita llegada a bandeja.
      }finally{clave=undefined;}
    };
    try {
      const vencimiento=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ErrorCorreo(envioIniciado?'ENTREGA_INCIERTA':'CONFIGURACION_CORREO_INVALIDA',{politica:envioIniciado?'reintentar':'cuarentena'}));},this.timeoutMs);});
      return await Promise.race([ejecutar(),vencimiento]);
    }catch(e){throw new ErrorCorreo(e instanceof ErrorCorreo?e.codigo:'ENTREGA_INCIERTA',e instanceof ErrorCorreo?{politica:e.politica,demoraMs:e.demoraMs}:undefined);}
    finally{clearTimeout(timer);}
  }
}
module.exports={ResendCorreo,ErrorCorreo};
