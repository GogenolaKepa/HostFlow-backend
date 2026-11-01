const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{randomUUID}=require('node:crypto');
const sql=require('mssql');
const {AutenticacionComercialSql}=require('../src/repositories/AutenticacionComercialSql');
function escenario(){
  const conexion=new EventEmitter(),eventos=[],peticiones=[];
  conexion.beginTransaction=(cb,_nombre,nivel)=>{eventos.push(['begin',nivel]);setImmediate(cb);};
  conexion.commitTransaction=cb=>{eventos.push(['commit']);setImmediate(cb);};
  conexion.rollbackTransaction=cb=>{eventos.push(['rollback']);setImmediate(cb);};
  const pool={connected:true,config:{options:{}},acquire:(_tx,cb)=>setImmediate(cb,null,conexion,{options:{}}),release:()=>eventos.push(['release'])};
  // Transaction y binding son los reales de mssql12/Tedious. Solo la conexión
  // física y la respuesta a query están dobladas: NO acredita TDS ni motor SQL.
  class Request extends sql.Request{async query(q){peticiones.push({q,parametros:this.parameters});return {recordset:q.includes('SELECT DB_NAME')?[{base:'Test',servidor:'local',modelo:'authcom-v1'}]:q.includes('sp_getapplock')?[{resultado:0}]:[],rowsAffected:[1]};}}
  const repo=new AutenticacionComercialSql({pool,driver:{...sql,Request},baseEsperada:'Test',servidorEsperado:'local',idEmpresa:1,habilitado:true});
  return {repo,conexion,eventos,peticiones};
}
test('mssql real: SERIALIZABLE, parámetros binarios/fechas/null y commit/cierre de transacción',async()=>{
  const e=escenario();await e.repo.transaccion(tx=>tx.insertarDesafio({id:randomUUID(),hash:'a'.repeat(64),proposito:'recuperacion',idEmpresa:1,email:'ficticio@example.invalid',usuarioId:2,creadaEn:Date.now(),expiraEn:Date.now()+900000}));
  const p=e.peticiones.at(-1).parametros;
  assert.equal(p.hash.type,sql.VarBinary);assert.equal(p.hash.value.length,32);
  assert.equal(p.creada.type,sql.DateTime2);assert.equal(p.creada.scale,3);assert.equal(p.invitador.value,null);
  assert.equal(e.eventos[0][1],sql.ISOLATION_LEVEL.SERIALIZABLE);
  assert.deepEqual(e.eventos.map(v=>v[0]),['begin','commit','release']);
});
test('mssql real emite rollback(true); no doble rollback ni repetición de callback',async()=>{
  const e=escenario();let n=0;
  await assert.rejects(e.repo.transaccion(()=>{n++;e.conexion.emit('rollbackTransaction');throw {number:1205};}),r=>r.codigo==='AUTH_TRANSACCION_REVERTIDA'&&r.reintentable);
  await new Promise(r=>setImmediate(r));assert.equal(n,1);assert.deepEqual(e.eventos.map(v=>v[0]),['begin','release']);
});
