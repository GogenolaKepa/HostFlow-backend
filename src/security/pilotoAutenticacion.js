// Cuarentena de la identidad de ensayo. Se evalúa sobre el usuario releído del
// servidor, nunca sobre un flag/rol enviado por el navegador. No amplía roles.
const EMAIL_PILOTO='hostflowtesting@gmail.com';
function esCuentaPiloto(usuario){return typeof usuario?.email==='string'&&usuario.email.trim().toLowerCase()===EMAIL_PILOTO;}
function rutaPilotoPermitida(req){
 const ruta=(req.originalUrl||'').split('?')[0];
 return ['GET /api/auth/me','POST /api/auth/logout','POST /api/auth/cambiar-password',
  'POST /api/cuentas-comerciales/contacto/solicitar','POST /api/cuentas-comerciales/contacto/validar','POST /api/cuentas-comerciales/contacto/confirmar'].includes(req.method+' '+ruta);
}
module.exports={EMAIL_PILOTO,esCuentaPiloto,rutaPilotoPermitida};
