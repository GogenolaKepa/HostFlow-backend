const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ConfiguracionRepository}=require('../src/repositories/ConfiguracionRepository');
const {CAMPOS_EMPRESA}=require('../src/security/validacionConfiguracion');
function fixture({lock=0,commitError=false,rows=1}={}) {
  const llamadas=[];
  class Transaction {async begin(){llamadas.push({tipo:'begin'});}async commit(){llamadas.push({tipo:'commit'});if(commitError)throw Error('detalle-privado');}async rollback(){llamadas.push({tipo:'rollback'});}}
  class Request {
    constructor(tx){this.tx=tx;this.parametros={};}
    input(nombre,tipo,valor){assert.ok(tipo.local);this.parametros[nombre]=valor;return this;}
    async query(query){llamadas.push({tipo:'query',query,tx:this.tx,parametros:this.parametros});
      if(query.includes('sp_getapplock'))return {recordset:[{resultado:lock}]};
      if(query.startsWith('UPDATE'))return {recordset:Array.from({length:rows},()=>({versionRegistro:Buffer.alloc(8,1)})),rowsAffected:[]};
      if(query.includes('extended_properties'))return {recordset:[{cantidad:2}]};
      return {recordset:[{nombreComercial:'Nombre aislado',versionRegistro:Buffer.alloc(8,1)}]};
    }
  }
  const tipo=()=>({local:true});const driver={Request,Transaction,Int:tipo(),NVarChar:tipo,Char:tipo,Binary:tipo,ISOLATION_LEVEL:{READ_COMMITTED:2}};
  return {repo:new ConfiguracionRepository({driver,getPool:async()=>({})}),llamadas};
}
test('repositorio parametriza todos los valores, empresa del servidor, revisión y actor, incluso con NOCOUNT',async()=>{
  const {repo,llamadas}=fixture();
  const payload={...Object.fromEntries(Object.keys(CAMPOS_EMPRESA).map(c=>[c,''])),nombreComercial:"Nombre '; DROP TABLE dbo.Usuarios; --"};
  await repo.transaccion(async tx=>{await tx.comprobarModelo();await tx.actualizar(7,'empresa',payload,'0000000000000001',19);});
  const update=llamadas.find(c=>c.query?.startsWith('UPDATE'));
  assert.equal(update.parametros.IdEmpresa,7);assert.equal(update.parametros.Actor,19);assert.equal(update.parametros.nombreComercial,payload.nombreComercial);
  assert.equal(update.query.includes(payload.nombreComercial),false);assert.ok(update.query.includes('OUTPUT INSERTED.VersionRegistro'));assert.equal(Buffer.isBuffer(update.parametros.Revision),true);
  const queries=llamadas.filter(c=>c.tipo==='query');assert.ok(queries.every(c=>c.tx===queries[0].tx));assert.equal(llamadas.at(-1).tipo,'commit');
});
test('conflicto, falta de bloqueo o commit fallido revierte sin filtrar errores del driver',async()=>{
  for(const options of [{rows:0},{lock:-1},{lock:null},{commitError:true}]) {
    const {repo,llamadas}=fixture(options);
    await assert.rejects(repo.transaccion(tx=>tx.actualizar(1,'operativas',{horaIngreso:'15:00',horaEgreso:'10:00'},'0000000000000001',1)),e=>[409,503].includes(e.status)&&!e.message.includes('privado'));
    assert.equal(llamadas.at(-1).tipo,'rollback');
  }
});
