const { hashToken } = require('./credencialesTemporales');
const { normalizarEmail } = require('../seguridadUsuarios');
const escapar = v => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Plantillas versionadas en código: el mismo payload siempre produce el mismo correo.
// Sin píxeles, recursos remotos, contraseñas ni enlaces derivados de Host/X-Forwarded-Host.
function crearPlantillaCorreo(payload, origen) {
  const destinatario = normalizarEmail(payload?.destinatario);
  const base = new URL(origen);
  if(base.protocol!=='https:' || base.origin!==origen || base.username || base.password) throw Error('Origen no válido.');
  let titulo, descripcion, accion, enlace;
  if(['recuperacion','invitacion'].includes(payload.plantilla)) {
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
  } else if(payload.plantilla==='seguridad-cuenta' && ['recuperacion','invitacion'].includes(payload.evento)) {
    titulo=payload.evento==='recuperacion'?'Tu contraseña de HostFlow cambió':'Tu cuenta de HostFlow está lista';
    descripcion=payload.evento==='recuperacion'
      ? 'La contraseña de tu cuenta fue actualizada y las sesiones anteriores fueron invalidadas. Si no fuiste vos, contactá de inmediato al administrador de tu equipo.'
      : 'Aceptaste la invitación como Operador. Ya podés iniciar sesión con la contraseña que elegiste.';
  } else throw Error('Plantilla no admitida.');
  const cierre='HostFlow nunca te pedirá tu contraseña por correo. Si no esperabas este mensaje, no compartas el enlace y contactá al administrador.';
  const text=`HostFlow\n\n${titulo}\n\n${descripcion}${enlace?`\n\n${accion}:\n${enlace}`:''}\n\n${cierre}`;
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#0d1422;color:#e9efff;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:560px;background:#1b2639;border:1px solid #354660;border-radius:16px" cellspacing="0" cellpadding="28"><tr><td><p style="color:#a8c8ff;font-size:22px;font-weight:bold;margin:0 0 28px">HostFlow</p><h1 style="font-size:24px;line-height:1.3">${escapar(titulo)}</h1><p style="line-height:1.65;color:#d6e0f4">${escapar(descripcion)}</p>${enlace?`<p style="margin:28px 0"><a href="${escapar(enlace)}" style="background:#3564ee;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapar(accion)}</a></p><p style="font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-all">Si el botón no funciona, copiá este enlace en tu navegador:<br>${escapar(enlace)}</p>`:''}<p style="border-top:1px solid #354660;padding-top:20px;font-size:12px;line-height:1.6;color:#b6c5dc">${escapar(cierre)}</p></td></tr></table></td></tr></table></body></html>`;
  return {destinatario,subject:titulo,text,html};
}
module.exports={crearPlantillaCorreo};
