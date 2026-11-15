const {test}=require('node:test'),assert=require('node:assert/strict'),jwt=require('jsonwebtoken');
process.env.HOSTFLOW_AUTH_SOURCE='mock';
const {crearEntornoComercialHttp}=require('./helpers/entornoComercialHttp');
const {AutenticacionComercialService}=require('../src/services/AutenticacionComercialService');
const {crearConfiguracionAprobada}=require('../scripts/prepararRecuperacionHabitual');
test('habitual: dos operadores autorizados, desconocido/admin indistinguibles, enlace único y sesión revocada',async()=>{
 const e=await crearEntornoComercialHttp();
 const segundo=await e.repository.agregar({id:102,rol:'Operador'});Object.assign(e.repository.filas.get(102),{emailVerificadoEn:new Date(e.cuentas.ahora()-60000).toISOString(),versionContacto:1});
 const cuentas=new AutenticacionComercialService({...e.cuentas,politicaHabitual:crearConfiguracionAprobada([2,102],'HABITUAL-1794710000000').politica});
 const contexto={ip:'203.0.113.7'};
 const desconocido=await cuentas.solicitarRecuperacion({email:'desconocido@example.invalid'},contexto);
 const admin=await cuentas.solicitarRecuperacion({email:e.admin.usuario.email},contexto);assert.deepEqual(admin,desconocido);assert.equal(e.repository.desafios.size,0);
 for(const operador of [e.operador,segundo]){
  const anterior=await e.auth.login(operador.usuario.email,operador.password);
  assert.deepEqual(await cuentas.solicitarRecuperacion({email:operador.usuario.email},contexto),desconocido);
  assert.equal((await e.entrega.procesarUna()).estado,'entregada');const token=e.tokenCorreo();
  const nueva='Clave enteramente ficticia nueva 2026';assert.equal((await cuentas.confirmarRecuperacion({token,passwordNueva:nueva},contexto)).status,204);
  assert.equal(await e.auth.obtenerUsuarioSesion(operador.usuario.idUsuario,jwt.decode(anterior.token)),null);
  await assert.rejects(e.auth.login(operador.usuario.email,operador.password));assert.equal((await e.auth.login(operador.usuario.email,nueva)).usuario.idUsuario,operador.usuario.idUsuario);
  await assert.rejects(cuentas.confirmarRecuperacion({token,passwordNueva:nueva},contexto),x=>x.codigo==='ENLACE_INVALIDO');
  assert.equal((await e.entrega.procesarUna()).estado,'entregada');assert.equal(e.correos.at(-1).plantilla,'seguridad-cuenta');
 }
 assert.equal(e.correos.length,4);assert.equal(e.repository.auditoria.filter(a=>a.tipo==='PASSWORD_RESTABLECIDA').length,2);e.cuentas.protector.liberar();
});
