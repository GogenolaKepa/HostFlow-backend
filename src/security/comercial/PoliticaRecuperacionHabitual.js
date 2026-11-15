// Política del servidor, nunca del body/JWT. Sin acceso a secretos, SQL ni red.
const {normalizarEmail}=require('../seguridadUsuarios');
const LIMITES=Object.freeze({cuenta24h:6,destino24h:6,clase24h:3,global24h:100});
function validarPoliticaHabitual(p){
 if(!p||p.aprobada!==true||p.idEmpresa!==1)throw TypeError('Política operativa no aprobada.');
 if(p.version===2){
  if(Object.keys(p).sort().join('|')!=='administradores|aprobada|cuentas|idEmpresa|limites|roles|version'||p.cuentas!=='PASSWORD_VERIFICADO'||p.administradores!=='MISMO_FLUJO_VERIFICADO'||!Array.isArray(p.roles)||p.roles.join('|')!=='Administrador|Operador')throw TypeError('Política automática no aprobada.');
 }else if(Object.keys(p).sort().join('|')!=='administradores|aprobada|idEmpresa|limites|operadoresAutorizados|version'||p.version!==1||p.administradores!=='SIN_RECUPERACION_PUBLICA'||!Array.isArray(p.operadoresAutorizados)||!p.operadoresAutorizados.length||p.operadoresAutorizados.length>100||new Set(p.operadoresAutorizados).size!==p.operadoresAutorizados.length||p.operadoresAutorizados.some(n=>!Number.isSafeInteger(n)||n<1))throw TypeError('Política operativa no aprobada.');
 if(!p.limites||Object.keys(p.limites).sort().join('|')!==Object.keys(LIMITES).sort().join('|')||Object.keys(LIMITES).some(k=>p.limites[k]!==LIMITES[k]))throw TypeError('Límites operativos no aprobados.');
 return Object.freeze({...p,...(p.version===2?{roles:Object.freeze([...p.roles])}:{operadoresAutorizados:Object.freeze([...p.operadoresAutorizados])}),limites:LIMITES});
}
function crearPoliticaAutomatica(){return validarPoliticaHabitual({version:2,aprobada:true,idEmpresa:1,cuentas:'PASSWORD_VERIFICADO',administradores:'MISMO_FLUJO_VERIFICADO',roles:['Administrador','Operador'],limites:{...LIMITES}});}
// Solo objetos obtenidos por el adaptador servidor; nunca claims/body del cliente.
function usuarioAutorizado(p,u){
 if(p.version===1)return Boolean(u&&u.rol==='Operador'&&p.operadoresAutorizados.includes(u.idUsuario));
 return Boolean(p.version===2&&u&&Number.isSafeInteger(u.idUsuario)&&u.idUsuario>0&&p.roles.includes(u.rol)&&u.ambitoIdentidad==='dbo.Usuarios'&&u.passwordLocalHabilitada===true&&typeof u.debeCambiarPassword==='boolean'&&u.recuperacionBloqueada!==true);
}
function correoHabitual(payload){
 const recuperacion=payload?.plantilla==='recuperacion',aviso=payload?.plantilla==='seguridad-cuenta'&&payload.evento==='recuperacion';
 const esperadas=recuperacion?'destinatario|enlace|plantilla':aviso?(Object.hasOwn(payload,'cuenta')?'cuenta|destinatario|evento|plantilla':'destinatario|evento|plantilla'):null;
 if(!esperadas||Object.keys(payload).sort().join('|')!==esperadas)throw Error('Correo fuera del alcance operativo.');
 const email=normalizarEmail(payload.destinatario);if(email!==payload.destinatario)throw Error('Destino no canónico.');
 return{email,clase:recuperacion?'recuperacion':'aviso'};
}
function validarVinculoCorreo(p,payload,candidata,u,idEmpresa){
 if(p.version!==2)return;
 const invalido=()=>Object.assign(Error('Vínculo de identidad no acreditado.'),{codigo:'VIGENCIA_NO_ACREDITADA'});
 const {email,clase}=correoHabitual(payload);
 if(!usuarioAutorizado(p,u)||u.email!==email)throw invalido();
 if(clase==='recuperacion'){
  const d=candidata.documento;
  if(candidata.desafioId==null||candidata.usuarioId!==u.idUsuario||candidata.empresa!==idEmpresa||candidata.proposito!=='recuperacion'||d?.versionSesion!==u.versionSesion||d?.versionContacto!==u.versionContacto||d?.emailVerificadoEn!==u.emailVerificadoEn)throw invalido();
 }else{
  const c=payload.cuenta;
  if(candidata.desafioId!==null||!c||Object.keys(c).sort().join('|')!=='ambitoIdentidad|emailVerificadoEn|usuarioId|versionContacto|versionSesion'||c.ambitoIdentidad!=='dbo.Usuarios'||c.usuarioId!==u.idUsuario||c.versionSesion!==u.versionSesion||c.versionContacto!==u.versionContacto||c.emailVerificadoEn!==u.emailVerificadoEn)throw invalido();
 }
}
function cuotasEntrega(p,ctx,ahora){
 validarPoliticaHabitual(p);
 if(!ctx||!['recuperacion','aviso'].includes(ctx.clase)||!(p.version===1?p.operadoresAutorizados.includes(ctx.usuarioId):usuarioAutorizado(p,{...ctx,idUsuario:ctx.usuarioId}))||![ctx.cuenta,ctx.destino].every(v=>/^[a-f0-9]{64}$/.test(v)))throw Error('Cuenta de entrega no acreditada.');
 const base={ahora,ip:ctx.cuenta,destino:ctx.destino,ventanaMs:86400000,cooldownMs:0};
 return[{...base,proposito:'correo-habitual-total-v1',maxIp:p.limites.cuenta24h,maxDestino:p.limites.destino24h,maxGlobal:p.limites.global24h},
  {...base,proposito:'correo-habitual-'+ctx.clase+'-v1',maxIp:p.limites.clase24h,maxDestino:p.limites.clase24h,maxGlobal:p.limites.global24h}];
}
module.exports={LIMITES,validarPoliticaHabitual,crearPoliticaAutomatica,usuarioAutorizado,correoHabitual,validarVinculoCorreo,cuotasEntrega};
