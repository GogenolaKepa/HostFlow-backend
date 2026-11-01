// DOBLE DE TEST; no persistencia de producción. Reutiliza el snapshot/cola existentes.
const {VerificacionContactoService}=require('../../src/services/VerificacionContactoService');
const {crearIndicePrivado}=require('../../src/security/comercial/credencialesTemporales');
const {randomBytes}=require('node:crypto');
function prepararContactosDelLaboratorio(e){
  const r=e.repository;
  r.revocarVerificacionesContacto=async(id,ahora)=>{for(const d of r.desafios.values())if(d.proposito==='contacto'&&d.usuarioId===id&&d.revocadaEn===null&&d.consumidaEn===null)d.revocadaEn=ahora;};
  r.insertarVerificacionContacto=async d=>r.insertarDesafio({...d,proposito:'contacto',consumidaEn:null,revocadaEn:null});
  r.verificarContacto=async({usuarioId,email,ahora})=>{const u=r.filas.get(usuarioId);Object.assign(u,{email,versionContacto:(u.versionContacto||0)+1,emailVerificadoEn:new Date(ahora).toISOString()});await r.revocarRecuperaciones(usuarioId,ahora);};
  return new VerificacionContactoService({habilitado:true,repository:r,protector:e.entrega.protector,
    indicePrivado:crearIndicePrivado(randomBytes(32)),idEmpresa:1,origen:'https://cuentas.example.invalid',ahora:e.entrega.ahora});
}
module.exports={prepararContactosDelLaboratorio};
