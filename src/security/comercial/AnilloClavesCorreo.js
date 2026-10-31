const {crearProtectorCorreo,ErrorSobreCorreo}=require('./credencialesTemporales');
// KMS/gestor de secretos debe suministrar claves independientes del JWT y del HMAC.
// La rotación conserva claves anteriores SOLO para descifrar sobres pendientes.
function crearAnilloClavesCorreo({activa,claves}={}) {
  if(!Array.isArray(claves)||!claves.length||claves.length>5)throw TypeError('Anillo de claves no válido.');
  const mapa=new Map();
  for(const v of claves){if(mapa.has(v.keyId))throw TypeError('Clave duplicada.');mapa.set(v.keyId,crearProtectorCorreo(v));}
  if(!mapa.has(activa))throw TypeError('Falta la clave activa.');
  return Object.freeze({
    sellar:(payload,id)=>mapa.get(activa).sellar(payload,id),
    abrir:(sobre,id)=>{const clave=mapa.get(sobre?.keyId);if(!clave)throw new ErrorSobreCorreo('CLAVE_CORREO_NO_DISPONIBLE');return clave.abrir(sobre,id);},
  });
}
module.exports={crearAnilloClavesCorreo};
