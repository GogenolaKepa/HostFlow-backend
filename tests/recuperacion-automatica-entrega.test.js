const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {CuentasComercialesAisladas}=require('./helpers/cuentasComercialesAisladas');
const {EntregaCorreoSeguridad}=require('../src/security/comercial/EntregaCorreoSeguridad');
const {crearProtectorCorreo}=require('../src/security/comercial/credencialesTemporales');
const {crearPoliticaAutomatica,validarVinculoCorreo,usuarioAutorizado}=require('../src/security/comercial/PoliticaRecuperacionHabitual');
class Repo extends CuentasComercialesAisladas{
 async consultarEntregaPendiente(excluir=[]){for(const e of this.entregas.values())if(!excluir.includes(e.id)&&e.sobre&&e.estado!=='entregada')return structuredClone({...e,documento:null});return null;}
 async reservarEntrega(o){const e=this.entregas.get(o.idEsperado);if(!e||e.estado==='entregada')return null;e.estado='procesando';e.intentos++;e.lease=o.lease;e.leaseHasta=this.tiempo+o.leaseMs;return structuredClone(e);}
}
async function fixture(rol='Administrador'){
 const repo=new Repo();repo.tiempo=Date.parse('2026-11-15T12:00Z');const politica=crearPoliticaAutomatica(),protector=crearProtectorCorreo({clave:Buffer.alloc(32,9),keyId:'ficticio'});let enviados=0,lecturas=0;
 const u={idUsuario:9,email:'destino@example.invalid',rol,ambitoIdentidad:'dbo.Usuarios',passwordLocalHabilitada:true,debeCambiarPassword:false,versionSesion:2,versionContacto:1,emailVerificadoEn:'2026-11-01T00:00:00.000Z'};
 const payload={plantilla:'seguridad-cuenta',evento:'recuperacion',destinatario:u.email,cuenta:{ambitoIdentidad:u.ambitoIdentidad,usuarioId:u.idUsuario,versionSesion:u.versionSesion,versionContacto:u.versionContacto,emailVerificadoEn:u.emailVerificadoEn}};
 const autorizarDestino=async(p,c)=>{lecturas++;if(!usuarioAutorizado(politica,u))throw Object.assign(Error('FICTICIO'),{codigo:'VIGENCIA_NO_ACREDITADA'});validarVinculoCorreo(politica,p,c,u,1);return{...u,usuarioId:u.idUsuario,cuenta:'a'.repeat(64),destino:'b'.repeat(64)};};
 const opciones={repository:repo,protector,politicaHabitual:politica,ahora:()=>repo.tiempo,autorizarDestino,proveedor:{enviar:async(_p,{antesDeEnviar})=>{assert.equal(await antesDeEnviar(),true);enviados++;return{id:randomUUID()};}}};
 const agregar=async()=>{const id=randomUUID();await repo.encolar({id,desafioId:null,expiraEn:repo.tiempo+3600000,sobre:protector.sellar(payload,id)});};return{repo,u,payload,opciones,agregar,enviados:()=>enviados,lecturas:()=>lecturas};
}
for(const rol of ['Administrador','Operador'])test('entrega ficticia '+rol+': revalida antes de enviar y conserva cupos al reconstruir worker',async()=>{
 const f=await fixture(rol);for(let i=0;i<4;i++){await f.agregar();await new EntregaCorreoSeguridad(f.opciones).procesarUna();}assert.equal(f.enviados(),3);assert.ok(f.lecturas()>=9);assert.equal(f.repo.limites.get('correo-habitual-aviso-v1:global').cuenta,3);assert.equal(f.repo.limites.get('correo-habitual-total-v1:global').cuenta,3);
});
test('método revocado antes del POST bloquea al proveedor aunque se hubiera reservado un lease',async()=>{
 const f=await fixture();await f.agregar();const anterior=f.opciones.autorizarDestino;let veces=0;f.opciones.autorizarDestino=async(...a)=>{if(++veces===2)f.u.passwordLocalHabilitada=false;return anterior(...a);};const r=await new EntregaCorreoSeguridad(f.opciones).procesarUna();assert.equal(r.estado,'resultado-incierto');assert.equal(f.enviados(),0);
});
test('correo reasignado a otra cuenta falla antes de reservar cuotas o enviar',async()=>{
 const f=await fixture();await f.agregar();f.u.idUsuario=88;await assert.rejects(new EntregaCorreoSeguridad(f.opciones).procesarUna());assert.equal(f.enviados(),0);assert.equal(f.repo.limites.size,0);
});
