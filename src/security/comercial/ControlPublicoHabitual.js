// El host acredita el borde antes de iniciar worker o admitir escrituras HTTP.
function crearControlPublicoHabitual({ahora=Date.now}={}){
 let estado='preparando';
 return Object.freeze({lecturaPermitida:()=>estado==='preparando'||estado==='activo',enviosPermitidos:()=>estado==='activo',
  acreditar(e){if(estado!=='preparando'||e?.resultado!=='BORDE_HABITUAL_ACREDITADO'||e.GET!==7||e.sinWorker!==true||!Number.isFinite(Date.parse(e.fechaUTC))||ahora()-Date.parse(e.fechaUTC)>300000||Date.parse(e.fechaUTC)>ahora())throw Error('Borde reciente no acreditado.');estado='activo';},
  sellar(){estado='cerrado';},consultar:()=>({estado})});
}
function transporteHabitual(control,transportar){
 if(!control?.enviosPermitidos||typeof transportar!=='function')throw TypeError('Transporte operativo no acreditado.');
 return async(url,o)=>{
  if(control.enviosPermitidos()!==true||url!=='https://api.resend.com/emails'||o?.method!=='POST'||o.redirect!=='error'||typeof o.body!=='string')throw Error('Entrega operativa cerrada.');
  let m;try{m=JSON.parse(o.body);}catch{throw Error('Entrega operativa cerrada.');}
  if(Object.keys(m).sort().join('|')!=='from|html|subject|text|to'||m.from!=='HostFlow Seguridad <seguridad@hostflow.com.ar>'||!Array.isArray(m.to)||m.to.length!==1||!['Recuperá tu acceso a HostFlow','Tu contraseña de HostFlow cambió'].includes(m.subject)||!/^hostflow\/[a-f0-9-]{36}$/i.test(o.headers?.['Idempotency-Key']||''))throw Error('Correo fuera del alcance operativo.');
  return transportar(url,o); // Destino/cuenta autorizados y cuotas ya reservados en SQL.
 };
}
module.exports={crearControlPublicoHabitual,transporteHabitual};
