// Política del servidor, nunca del body/JWT. Sin acceso a secretos, SQL ni red.
const {normalizarEmail}=require('../seguridadUsuarios');
const LIMITES=Object.freeze({cuenta24h:6,destino24h:6,clase24h:3,global24h:100});
function validarPoliticaHabitual(p){
 if(!p||Object.keys(p).sort().join('|')!=='administradores|aprobada|idEmpresa|limites|operadoresAutorizados|version'||p.version!==1||p.aprobada!==true||p.idEmpresa!==1||p.administradores!=='SIN_RECUPERACION_PUBLICA'||!Array.isArray(p.operadoresAutorizados)||!p.operadoresAutorizados.length||p.operadoresAutorizados.length>100||new Set(p.operadoresAutorizados).size!==p.operadoresAutorizados.length||p.operadoresAutorizados.some(n=>!Number.isSafeInteger(n)||n<1))throw TypeError('Política operativa no aprobada.');
 if(!p.limites||Object.keys(p.limites).sort().join('|')!==Object.keys(LIMITES).sort().join('|')||Object.keys(LIMITES).some(k=>p.limites[k]!==LIMITES[k]))throw TypeError('Límites operativos no aprobados.');
 return Object.freeze({...p,operadoresAutorizados:Object.freeze([...p.operadoresAutorizados]),limites:LIMITES});
}
function correoHabitual(payload){
 const recuperacion=payload?.plantilla==='recuperacion',aviso=payload?.plantilla==='seguridad-cuenta'&&payload.evento==='recuperacion';
 const esperadas=recuperacion?'destinatario|enlace|plantilla':aviso?'destinatario|evento|plantilla':null;
 if(!esperadas||Object.keys(payload).sort().join('|')!==esperadas)throw Error('Correo fuera del alcance operativo.');
 const email=normalizarEmail(payload.destinatario);if(email!==payload.destinatario)throw Error('Destino no canónico.');
 return{email,clase:recuperacion?'recuperacion':'aviso'};
}
function cuotasEntrega(p,ctx,ahora){
 validarPoliticaHabitual(p);
 if(!ctx||!['recuperacion','aviso'].includes(ctx.clase)||!p.operadoresAutorizados.includes(ctx.usuarioId)||![ctx.cuenta,ctx.destino].every(v=>/^[a-f0-9]{64}$/.test(v)))throw Error('Cuenta de entrega no acreditada.');
 const base={ahora,ip:ctx.cuenta,destino:ctx.destino,ventanaMs:86400000,cooldownMs:0};
 return[{...base,proposito:'correo-habitual-total-v1',maxIp:p.limites.cuenta24h,maxDestino:p.limites.destino24h,maxGlobal:p.limites.global24h},
  {...base,proposito:'correo-habitual-'+ctx.clase+'-v1',maxIp:p.limites.clase24h,maxDestino:p.limites.clase24h,maxGlobal:p.limites.global24h}];
}
module.exports={LIMITES,validarPoliticaHabitual,correoHabitual,cuotasEntrega};
