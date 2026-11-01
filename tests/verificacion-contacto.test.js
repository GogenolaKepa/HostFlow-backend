const {test}=require('node:test'),assert=require('node:assert/strict');
const {crearEntornoComercialHttp}=require('./helpers/entornoComercialHttp');
const {prepararContactosDelLaboratorio}=require('./helpers/contactosComercialesAislados');
async function entorno(){const e=await crearEntornoComercialHttp();const u=e.repository.filas.get(2);delete u.versionContacto;delete u.emailVerificadoEn;return {...e,contactos:prepararContactosDelLaboratorio(e),actor:{idUsuario:2,versionSesion:1},ip:{ip:'127.0.0.1'}};}
test('contacto legacy exige contraseña y prueba de correo; solicitud no lo verifica',async()=>{
  const e=await entorno();assert.equal(e.cuentas.recuperable(e.repository.filas.get(2)),false);
  await e.contactos.solicitar(e.actor,{passwordActual:e.operador.password},e.ip);
  assert.equal(e.cuentas.recuperable(e.repository.filas.get(2)),false);assert.equal(e.repository.entregas.size,1);
  await e.procesar();const token=e.tokenCorreo();
  await assert.rejects(e.cuentas.validarEnlace('recuperacion',token,e.ip),{codigo:'ENLACE_INVALIDO'});
  await assert.rejects(e.cuentas.validarEnlace('invitacion',token,e.ip),{codigo:'ENLACE_INVALIDO'});
  await e.contactos.validar(e.actor,{token},e.ip);assert.equal(e.cuentas.recuperable(e.repository.filas.get(2)),false);
  await e.contactos.confirmar(e.actor,{token},e.ip);assert.equal(e.cuentas.recuperable(e.repository.filas.get(2)),true);
  assert.ok((await e.auth.login(e.operador.usuario.email,e.operador.password)).token);
  assert.equal(e.repository.filas.get(2).versionSesion,1);
  await assert.rejects(e.contactos.confirmar(e.actor,{token},e.ip),{codigo:'ENLACE_INVALIDO'});
});
test('sin reautenticación, Administrador o sesión obsoleta no se emite correo',async()=>{
  for(const caso of ['password','admin','version']){
    const e=await entorno();const actor=caso==='admin'?{idUsuario:1,versionSesion:1}:caso==='version'?{idUsuario:2,versionSesion:99}:e.actor;
    await assert.rejects(e.contactos.solicitar(actor,{passwordActual:caso==='password'?'incorrecta':e.operador.password},e.ip),{codigo:'SIN_PERMISO'});
    assert.equal(e.repository.entregas.size,0);
  }
});
test('verificación ligada a la cuenta, email y sesión; rechaza vencimiento y cambio de correo',async()=>{
  for(const caso of ['otra','email','version','vencida']){
    const e=await entorno();await e.contactos.solicitar(e.actor,{passwordActual:e.operador.password},e.ip);await e.procesar();const token=e.tokenCorreo();
    if(caso==='email')e.repository.filas.get(2).email='cambiado@example.invalid';
    if(caso==='version')e.repository.filas.get(2).versionSesion++;
    if(caso==='vencida')e.avanzar(900001);
    await assert.rejects(e.contactos.confirmar(caso==='otra'?{idUsuario:1,versionSesion:1}:e.actor,{token},e.ip));
    assert.ok(!e.repository.filas.get(2).emailVerificadoEn);
  }
});
test('consumo concurrente solo verifica una vez y fallo de auditoría revierte contacto/consumo',async()=>{
  const e=await entorno();await e.contactos.solicitar(e.actor,{passwordActual:e.operador.password},e.ip);await e.procesar();const token=e.tokenCorreo();
  e.repository.fallarAuditoria=true;await assert.rejects(e.contactos.confirmar(e.actor,{token},e.ip),{codigo:'CUENTAS_RESULTADO_INCIERTO'});
  assert.ok(!e.repository.filas.get(2).emailVerificadoEn);assert.equal([...e.repository.desafios.values()][0].consumidaEn,null);
  e.repository.fallarAuditoria=false;
  const r=await Promise.allSettled([e.contactos.confirmar(e.actor,{token},e.ip),e.contactos.confirmar(e.actor,{token},e.ip)]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(e.repository.filas.get(2).versionContacto,1);
});
