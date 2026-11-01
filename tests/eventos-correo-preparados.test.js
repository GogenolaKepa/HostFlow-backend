const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,randomUUID,createHmac}=require('node:crypto');
const {crearVerificadorEventosCorreo,recibirEventoCorreo}=require('../src/security/comercial/EventosCorreoPreparados');
function escenario(){
  const key=randomBytes(32),ahora=Date.now(),ts=String(Math.floor(ahora/1000)),id='msg_prueba';
  const cuerpo=Buffer.from(JSON.stringify({type:'email.delivered',created_at:new Date(ahora).toISOString(),data:{email_id:randomUUID(),to:['NO_CONSERVAR@example.invalid'],subject:'NO_CONSERVAR'}}));
  const firma=createHmac('sha256',key).update(`${id}.${ts}.`).update(cuerpo).digest('base64');
  return {cuerpo,headers:{'svix-id':id,'svix-timestamp':ts,'svix-signature':'v1,'+firma},clave:'whsec_'+key.toString('base64'),ahora};
}
test('vector público oficial de Svix acredita firma compatible, sin aceptar evento ajeno',()=>{
  // Fixture público de https://docs.svix.com/receiving/verifying-payloads/how-manual
  const v=crearVerificadorEventosCorreo({claves:['whsec_plJ3nmyCDGBKInavdOK15jsl'],ahora:()=>1731705121000});
  assert.throws(()=>v({cuerpo:Buffer.from('{"event_type":"ping","data":{"success":true}}'),headers:{'svix-id':'msg_loFOjxBNrRLzqYUf','svix-timestamp':'1731705121','svix-signature':'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0='}}),{codigo:'EVENTO_NO_ADMITIDO'});
});
test('cuerpo exacto, rotación y proyección sin datos personales',()=>{
  const e=escenario(),v=crearVerificadorEventosCorreo({claves:['whsec_'+randomBytes(32).toString('base64'),e.clave],ahora:()=>e.ahora});
  const r=v(e);assert.equal(r.tipo,'email.delivered');assert.ok(!JSON.stringify(r).includes('NO_CONSERVAR'));
  assert.throws(()=>v({...e,cuerpo:Buffer.concat([e.cuerpo,Buffer.from(' ')])}),{codigo:'FIRMA_INVALIDA'});
  assert.throws(()=>v({...e,cuerpo:JSON.parse(e.cuerpo)}),{codigo:'CUERPO_INVALIDO'});
});
test('firma, fecha vieja/futura y cabeceras ambiguas rechazadas',()=>{
  const e=escenario(),v=crearVerificadorEventosCorreo({claves:[e.clave],ahora:()=>e.ahora});
  for(const headers of [{...e.headers,'svix-signature':'v1,'+randomBytes(32).toString('base64')},{...e.headers,'svix-id':['msg_prueba']},{...e.headers,'svix-timestamp':String(Math.floor(e.ahora/1000)-301)},{...e.headers,'svix-timestamp':String(Math.floor(e.ahora/1000)+302)}])assert.throws(()=>v({...e,headers}));
});
test('recepción inactiva; requiere persistencia durable, verifica antes de escribir y no reenvía',async()=>{
  assert.deepEqual(await recibirEventoCorreo(),{estado:'inactivo'});
  const e=escenario(),verificar=crearVerificadorEventosCorreo({claves:[e.clave],ahora:()=>e.ahora});
  await assert.rejects(recibirEventoCorreo({habilitado:true,verificar,...e}),{codigo:'PERSISTENCIA_NO_ACREDITADA'});
  // DOBLE de contrato, no persistencia productiva ni prueba de concurrencia SQL.
  let n=0;const repositorio={persistencia:'sql-durable',registrarEventoCorreo:async r=>{assert.equal(r.eventoId,'msg_prueba');return{estado:++n===1?'registrado':'duplicado'};}};
  const opciones={habilitado:true,verificar,repositorio,...e};
  assert.equal((await recibirEventoCorreo(opciones)).estado,'registrado');assert.equal((await recibirEventoCorreo(opciones)).estado,'duplicado');
  await assert.rejects(recibirEventoCorreo({...opciones,cuerpo:Buffer.from('{}')}),{codigo:'FIRMA_INVALIDA'});assert.equal(n,2);
});
