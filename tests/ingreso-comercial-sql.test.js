const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {IngresoComercialSql}=require('../src/repositories/IngresoComercialSql');
test('marca de ingreso necesaria, callback no se ejecuta en modelo incompleto',async()=>{
  let ejecutado=false;
  const repository={transaccion:fn=>fn({q:async()=>({recordset:[]})})};
  const repo=new IngresoComercialSql({repository,habilitado:true});
  await assert.rejects(repo.transaccion(()=>{ejecutado=true;}));assert.equal(ejecutado,false);
});
test('ingreso cifrado, selección y consumo usan una sola transacción sin payload extra',async()=>{
  const consultas=[];let transacciones=0;
  const scope={idEmpresa:1,q:async(sql,params)=>{consultas.push({sql,params});return sql.includes('extended_properties')?{recordset:[{modelo:sql.includes('HostFlowAuthResiliencia')?'authcom-resiliencia-v1':'authcom-ingreso-v1'}]}:{recordset:[],rowsAffected:[1]};}};
  const repo=new IngresoComercialSql({habilitado:true,repository:{transaccion:async fn=>{transacciones++;return fn(scope);}}});
  await repo.transaccion(async tx=>{
    await tx.encolarIngreso({id:'ficticio',creadaEn:Date.now(),expiraEn:Date.now()+900000,sobre:{keyId:'k',iv:'iv',tag:'tag',contenido:'cifrado',email:'NO_GUARDAR'}});
    const lease=randomUUID();assert.equal(await tx.reservarIngreso({lease}),null);assert.equal(await tx.finalizarIngreso('ficticio',Date.now(),lease),true);
  });
  assert.equal(transacciones,1);assert.ok(!JSON.stringify(consultas).includes('NO_GUARDAR'));
  assert.match(consultas.map(q=>q.sql).join('\n'),/UPDLOCK,HOLDLOCK/);
  assert.match(consultas.at(-1).sql,/Estado='pendiente' AND ExpiraEn>SYSUTCDATETIME/);
  assert.match(consultas.at(-1).sql,/Sobre=NULL/);
});
test('listado exige contexto fijo y no entrega el documento completo a la UI',async()=>{
  const repository={transaccion:fn=>fn({idEmpresa:1,q:async sql=>({recordset:sql.includes('extended_properties')?[{modelo:sql.includes('HostFlowAuthResiliencia')?'authcom-resiliencia-v1':'authcom-ingreso-v1'}]:[{id:'id',email:'ficticio@example.invalid',doc:JSON.stringify({nombre:'Persona',versionInvitador:99}),expira:new Date(),consumida:null,revocada:null}]})})};
  const repo=new IngresoComercialSql({repository,habilitado:true});
  await assert.rejects(repo.transaccion(tx=>tx.invitacionesPorEmpresa(2)));
  const lista=await repo.transaccion(tx=>tx.invitacionesPorEmpresa(1));assert.equal(lista[0].nombre,'Persona');assert.ok(!JSON.stringify(lista).includes('versionInvitador'));
});
