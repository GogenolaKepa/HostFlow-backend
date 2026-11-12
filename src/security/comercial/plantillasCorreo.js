const { hashToken } = require('./credencialesTemporales');
const { normalizarEmail } = require('../seguridadUsuarios');
const escapar = v => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Plantillas versionadas en código: el mismo payload siempre produce el mismo correo.
// Sin píxeles, recursos remotos, contraseñas ni enlaces derivados de Host/X-Forwarded-Host.
function crearPlantillaCorreo(payload, origen) {
  const destinatario = normalizarEmail(payload?.destinatario);
  const base = new URL(origen);
  if(base.protocol!=='https:' || base.origin!==origen || base.username || base.password) throw Error('Origen no válido.');
  let titulo, descripcion, accion, enlace, etiqueta, ayuda;
  if(['recuperacion','invitacion','contacto'].includes(payload.plantilla)) {
    const u = new URL(payload.enlace);
    const campos = new URLSearchParams(u.hash.slice(1));
    if(u.origin!==origen || u.pathname!==`/cuenta/${payload.plantilla}` || u.search || u.username || u.password ||
      [...campos.keys()].length!==1 || !hashToken(campos.get('token'),payload.plantilla)) throw Error('Enlace no válido.');
    enlace=u.href;
    titulo=payload.plantilla==='recuperacion'?'Recuperá tu acceso a HostFlow':'Tu equipo te espera en HostFlow';
    descripcion=payload.plantilla==='recuperacion'
      ? 'Recibimos una solicitud para restablecer tu contraseña. El enlace es temporal y se puede utilizar una sola vez.'
      : 'Te invitaron a trabajar como Operador. Elegí tu contraseña desde este enlace temporal de un solo uso.';
    accion=payload.plantilla==='recuperacion'?'Establecer nueva contraseña':'Aceptar invitación';
    etiqueta=payload.plantilla==='recuperacion'?'RECUPERACIÓN DE ACCESO':'INVITACIÓN A TU EQUIPO';
    ayuda=payload.plantilla==='recuperacion'
      ? 'Al confirmar tu nueva contraseña, se cerrarán tus sesiones anteriores. Después podrás volver a ingresar.'
      : 'No necesitás compartir contraseñas ni datos de pago. Tu acceso será como Operador de la empresa que te invitó.';
    if(payload.plantilla==='contacto'){
      titulo='Verificá tu correo de HostFlow';
      descripcion='Solicitaste verificar el correo de tu cuenta. Abrí el enlace con tu sesión iniciada. No cambia tu contraseña ni tu dirección de correo.';
      accion='Verificar mi correo';
      etiqueta='VERIFICACIÓN DE CORREO';
      ayuda='Mantené iniciada la sesión de la cuenta que solicitó la verificación. Abrir el enlace no confirma el correo: deberás hacerlo en HostFlow.';
    }
  } else if(payload.plantilla==='seguridad-cuenta' && ['recuperacion','invitacion'].includes(payload.evento)) {
    titulo=payload.evento==='recuperacion'?'Tu contraseña de HostFlow cambió':'Tu cuenta de HostFlow está lista';
    descripcion=payload.evento==='recuperacion'
      ? 'La contraseña de tu cuenta fue actualizada y las sesiones anteriores fueron invalidadas. Si no fuiste vos, contactá de inmediato al administrador de tu equipo.'
      : 'Aceptaste la invitación como Operador. Ya podés iniciar sesión con la contraseña que elegiste.';
  } else throw Error('Plantilla no admitida.');
  etiqueta=etiqueta||'SEGURIDAD DE TU CUENTA';
  const cierre='HostFlow nunca te pedirá tu contraseña por correo. Si no esperabas este mensaje, no compartas el enlace y contactá al administrador.';
  const text=`HostFlow\n${etiqueta}\n\n${titulo}\n\n${descripcion}${enlace?`\n\n${accion}:\n${enlace}\n\n${ayuda}\n\nSi el enlace venció o ya lo utilizaste, solicitá uno nuevo desde HostFlow o al administrador de tu equipo.`:''}\n\n${cierre}`;
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#0d1422;color:#e9efff;font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapar(titulo)}. Un mensaje de seguridad de tu cuenta.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#1b2639;border:1px solid #354660;border-radius:16px;table-layout:fixed">
<tr><td style="padding:28px 24px 20px;border-bottom:1px solid #354660"><p style="color:#a8c8ff;font-size:26px;font-weight:bold;margin:0">HostFlow</p><p style="color:#b6c5dc;font-size:12px;letter-spacing:1px;margin:12px 0 0">${etiqueta}</p></td></tr>
<tr><td style="padding:24px"><h1 style="font-size:26px;line-height:1.3;margin:0 0 18px">${escapar(titulo)}</h1><p style="font-size:16px;line-height:1.65;color:#d6e0f4">${escapar(descripcion)}</p>
${enlace?`<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td bgcolor="#3564ee" style="border-radius:8px"><a href="${escapar(enlace)}" style="color:#fff;padding:16px 20px;border:1px solid #3564ee;border-radius:8px;text-decoration:none;display:inline-block;font-size:16px;font-weight:bold;line-height:1.4">${escapar(accion)}</a></td></tr></table>
<p style="padding:16px;background:#132035;border-radius:8px;color:#d6e0f4;font-size:14px;line-height:1.65">${escapar(ayuda)}</p><p style="font-size:13px;line-height:1.65;color:#b6c5dc">Si el enlace venció o ya lo utilizaste, solicitá uno nuevo desde HostFlow o al administrador de tu equipo.</p>
<p style="font-size:12px;line-height:1.65">Si el botón no funciona, copiá este enlace en tu navegador:<br><span style="overflow-wrap:anywhere;word-break:break-all">${escapar(enlace)}</span></p>`:''}
</td></tr><tr><td style="border-top:1px solid #354660;padding:20px 24px"><p style="margin:0;font-size:12px;line-height:1.65;color:#b6c5dc">${escapar(cierre)}</p></td></tr></table>
</td></tr></table></body></html>`;
  return {destinatario,subject:titulo,text,html};
}
module.exports={crearPlantillaCorreo};
