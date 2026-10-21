const {validarCampos,ErrorSeguridad}=require('./seguridadUsuarios');
const LIMITES=Object.freeze({nombre:100,apellido:100,email:150,telefono:50,dni:100,nacionalidad:100});
function normalizarHuesped(body,{alta=false}={}){
 validarCampos(body,Object.keys(LIMITES),alta?['nombre','apellido','email']:[]);const datos={};
 for(const [campo,maximo]of Object.entries(LIMITES)){
  if(!Object.hasOwn(body,campo))continue;const valor=body[campo];
  if(valor!==null&&typeof valor!=='string')throw new ErrorSeguridad(400,'VALIDACION','Los datos del huésped deben ser textos válidos.');
  const texto=(valor||'').trim();if(texto.length>maximo)throw new ErrorSeguridad(400,'VALIDACION',`El campo ${campo} supera la longitud permitida.`);
  if(['nombre','apellido'].includes(campo)&&!texto)throw new ErrorSeguridad(400,'VALIDACION','Nombre y apellido no pueden estar vacíos.');
  if(campo==='email'){
   if(!texto&&!alta)continue;
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto))throw new ErrorSeguridad(400,'VALIDACION','Ingresá un email válido.');
  }
  datos[campo]=texto||null;
 }return datos;
}
module.exports={normalizarHuesped,LIMITES};
