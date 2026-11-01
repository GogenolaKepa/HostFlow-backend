const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {EventosCorreoSql}=require('../src/repositories/EventosCorreoSql');
const evento=()=>({eventoId:'msg_ficticio',proveedorId:randomUUID(),tipo:'email.bounced',ocurridoEn:new Date().toISOString(),huella:'a'.repeat(64)});
function entorno(responder=()=>[]){const consultas=[];let transacciones=0;const repository={transaccion:async fn=>{transacciones++;return fn({q:async(q,p)=>{consultas.push({q,p});return {recordset:q.includes('extended_properties')?[{modelo:'authcom-eventos-v1'}]:await responder(q,p),rowsAffected:[1]};}});}};return {repository,consultas,transacciones:()=>transacciones};}
test('eventos SQL cerrados por defecto, exige marca y nunca importa conexión operativa',async()=>{
  const e=entorno(),r=new EventosCorreoSql(e);await assert.rejects(r.registrarEventoCorreo(evento()),{codigo:'EVENTOS_INACTIVOS'});assert.equal(e.transacciones(),0);
  const repo=new EventosCorreoSql({habilitado:true,repository:{transaccion:fn=>fn({q:async()=>({recordset:[]})})}});
  await assert.rejects(repo.registrarEventoCorreo(evento()),{codigo:'MODELO_EVENTOS_NO_ACREDITADO'});
});
test('deduplicación ligada a huella; evento sin correlación queda durable sin efectos',async()=>{
  const e=entorno(),r=new EventosCorreoSql({...e,habilitado:true}),v=evento();
  assert.deepEqual(await r.registrarEventoCorreo(v),{estado:'sin-correlacion'});assert.equal(e.transacciones(),1);
  assert.equal(e.consultas.filter(x=>x.q.startsWith('INSERT')).length,1);
  for(const huella of [v.huella,'b'.repeat(64)]){
    const f=entorno(q=>q.startsWith('SELECT Huella')?[{Huella:Buffer.from(huella,'hex')}]:[]),a=new EventosCorreoSql({...f,habilitado:true});
    if(huella===v.huella)assert.equal((await a.registrarEventoCorreo(v)).estado,'duplicado');else await assert.rejects(a.registrarEventoCorreo(v),{codigo:'EVENTO_INCOMPATIBLE'});
    assert.ok(!f.consultas.some(x=>x.q.startsWith('INSERT')));
  }
});
test('aplicación y supresión se hacen dentro de la misma transacción, sin reenviar correo',async()=>{
  const outboxId=randomUUID(),destino=Buffer.alloc(32,3),e=entorno(q=>q.startsWith('SELECT OutboxId,Destino FROM')?[{OutboxId:outboxId,Destino:destino}]:[]);
  assert.equal((await new EventosCorreoSql({...e,habilitado:true}).registrarEventoCorreo(evento())).estado,'registrado');
  assert.equal(e.transacciones(),1);assert.ok(e.consultas.some(x=>x.q.includes('INSERT authcom.CorreoBloqueos')));
  assert.ok(e.consultas.some(x=>x.q.includes('Prioridad<@prioridad')));assert.ok(!e.consultas.some(x=>/dbo\.Usuarios|INSERT authcom.Outbox|UPDATE authcom.Contactos/.test(x.q)));
});
test('correlación conflictiva rechazada; replay de la misma correlación aplica pendiente con lote acotado',async()=>{
  const outboxId=randomUUID(),proveedorId=randomUUID();
  const e=entorno(q=>q.startsWith('SELECT OutboxId,Destino,ProveedorId')?[{OutboxId:outboxId,Destino:Buffer.alloc(32,1),ProveedorId:proveedorId}]:q.startsWith('SELECT TOP(101)')?Array.from({length:101},(_,n)=>({EventoId:'msg_'+n,Tipo:'email.delivered',OcurridoEn:new Date()})):[]);
  const r=new EventosCorreoSql({...e,habilitado:true});const a=await r.vincularAceptacion({outboxId,proveedorId});assert.deepEqual(a,{estado:'vinculado',aplicados:100,hayMas:true});
  await assert.rejects(r.vincularAceptacion({outboxId,proveedorId:randomUUID()}),{codigo:'CORRELACION_INCOMPATIBLE'});
});
test('preparar correlación acredita lease/destino; la marca de incertidumbre corresponde al worker común',async()=>{
  const outboxId=randomUUID(),lease=randomUUID(),destino=Buffer.alloc(32,7);
  const e=entorno(q=>q.startsWith('SELECT Id FROM authcom.Outbox')?[{Id:outboxId}]:[]),r=new EventosCorreoSql({...e,habilitado:true});
  assert.equal((await r.prepararMensaje({outboxId,lease,destino})).estado,'preparado');
  assert.equal(e.transacciones(),1);
  assert.ok(e.consultas.some(c=>c.q.startsWith('INSERT authcom.CorreoMensajes')));
  assert.ok(!e.consultas.some(c=>c.q.startsWith('UPDATE authcom.Outbox')));
  assert.ok(!JSON.stringify(e.consultas).includes('@email'));
});
