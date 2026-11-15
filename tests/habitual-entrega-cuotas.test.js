const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const {CuentasComercialesAisladas}=require('./helpers/cuentasComercialesAisladas');
const {EntregaCorreoSeguridad}=require('../src/security/comercial/EntregaCorreoSeguridad');
const {crearProtectorCorreo}=require('../src/security/comercial/credencialesTemporales');
const {crearConfiguracionAprobada}=require('../scripts/prepararRecuperacionHabitual');
const {correoHabitual}=require('../src/security/comercial/PoliticaRecuperacionHabitual');
class Repositorio extends CuentasComercialesAisladas{
 async consultarEntregaPendiente(excluir=[]){for(const e of this.entregas.values())if(!excluir.includes(e.id)&&e.sobre&&!e.enCuarentena&&e.expiraEn>this.tiempo&&e.estado!=='entregada'&&e.codigoFallo!=='RESULTADO_INCIERTO'&&(!e.leaseHasta||e.leaseHasta<=this.tiempo)&&e.proxima<=this.tiempo)return structuredClone({...e,desafioId:null,documento:null});return null;}
 async reservarEntrega(o){if(o.soloRecuperacion){const e=this.entregas.get(o.idEsperado);if(!e||!e.sobre||e.leaseHasta>this.tiempo||e.estado==='entregada')return null;e.estado='procesando';e.intentos++;e.lease=o.lease;e.leaseHasta=this.tiempo+o.leaseMs;return structuredClone(e);}return super.reservarEntrega(o);}
}
function preparar(){const repo=new Repositorio();repo.tiempo=1794710000000;const clave=randomBytes(32),protector=crearProtectorCorreo({clave,keyId:'ficticio'});let enviados=0;
 const autorizar=async p=>{correoHabitual(p);if(p.destinatario!=='fixture@example.invalid')throw Error('No autorizado.');return{usuarioId:101,cuenta:'a'.repeat(64),destino:'b'.repeat(64),versionSesion:1};};
 const opciones={repository:repo,protector,ahora:()=>repo.tiempo,politicaHabitual:crearConfiguracionAprobada([101],'HABITUAL-1794710000000').politica,autorizarDestino:autorizar,proveedor:{enviar:async(_p,{antesDeEnviar})=>{assert.equal(await antesDeEnviar(),true);enviados++;return{id:randomUUID()};}}};
 const agregar=async(clase='recuperacion',email='fixture@example.invalid')=>{const id=randomUUID(),payload=clase==='recuperacion'?{plantilla:'recuperacion',destinatario:email,enlace:'https://hostflow.com.ar/cuenta/recuperacion#token=FICTICIO'}:{plantilla:'seguridad-cuenta',evento:'recuperacion',destinatario:email};await repo.encolar({id,desafioId:null,expiraEn:repo.tiempo+86400000,sobre:protector.sellar(payload,id)});return id;};
 return{repo,protector,opciones,agregar,enviados:()=>enviados,worker:()=>new EntregaCorreoSeguridad(opciones)};
}
test('habitual: tres recuperaciones + tres avisos por cuenta; reserva y lease rollback ante cuota',async()=>{
 const p=preparar();try{for(let i=0;i<3;i++){await p.agregar();assert.equal((await p.worker().procesarUna()).estado,'entregada');}
 const id=await p.agregar();const antes=structuredClone(p.repo.limites);assert.equal((await p.worker().procesarUna()).estado,'limite-alcanzado');assert.deepEqual(p.repo.limites,antes);assert.equal(p.repo.entregas.get(id).intentos,0);
 for(let i=0;i<3;i++){await p.agregar('aviso');assert.equal((await p.worker().procesarUna()).estado,'entregada');}
 assert.equal(p.enviados(),6);const global=[...p.repo.limites].find(([k])=>k==='correo-habitual-total-v1:global');assert.equal(global[1].cuenta,6);
 }finally{p.protector.liberar();}
});
test('habitual: concurrencia y reinicio del worker conservan las mismas cuotas durables ficticias',async()=>{
 const p=preparar();try{for(let i=0;i<8;i++)await p.agregar();let completadas=0;for(let ciclo=0;ciclo<4;ciclo++){const r=await Promise.all(Array.from({length:16},()=>p.worker().procesarUna()));completadas+=r.filter(x=>x.estado==='entregada').length;}assert.equal(p.enviados(),3);assert.equal(completadas,3);assert.equal((await p.worker().procesarUna()).estado,'limite-alcanzado');assert.equal(p.enviados(),3);
 p.repo.tiempo+=86400001;await p.agregar();assert.equal((await p.worker().procesarUna()).estado,'entregada');assert.equal(p.enviados(),4);
 }finally{p.protector.liberar();}
});
test('habitual: destino ajeno se rechaza ANTES del lease y del proveedor',async()=>{const p=preparar();try{const id=await p.agregar('recuperacion','otro@example.invalid');await assert.rejects(p.worker().procesarUna());assert.equal(p.repo.entregas.get(id).intentos,0);assert.equal(p.enviados(),0);assert.equal(p.repo.limites.size,0);}finally{p.protector.liberar();}});
test('habitual: resultado incierto queda persistido y bloquea reenvío tras reinicio',async()=>{const p=preparar();try{await p.agregar();p.opciones.proveedor.enviar=async()=>{throw Object.assign(Error('FICTICIO'),{codigo:'ENTREGA_INCIERTA'});};assert.equal((await p.worker().procesarUna()).estado,'resultado-incierto');const e=[...p.repo.entregas.values()][0];assert.equal(e.codigoFallo,'RESULTADO_INCIERTO');p.repo.tiempo+=600000;assert.equal((await p.worker().procesarUna()).estado,'sin-pendientes');}finally{p.protector.liberar();}});
