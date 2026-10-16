const {test}=require('node:test'),assert=require('node:assert/strict');
const {NotificacionRepository}=require('../src/repositories/NotificacionRepository');
const {NotificacionService}=require('../src/services/NotificacionService');
const {analizarFuente}=require('../scripts/lib/permisosMinimos');
const {filtrosPersonales,idPersonal}=require('../src/security/validacionNotificaciones');
function fixture(){
  const consultas=[];
  const row={idNotificacion:'9007199254740997',idEntrega:'9007199254740999',tipo:'RESERVA_NUEVA',prioridad:'Alta',fecha:'2026-10-15T13:00:00Z',fechaLectura:'2026-10-15T14:00:00Z',versionRegistro:Buffer.alloc(8,1)};
  const request=async()=>({parametros:{},input(nombre,_tipo,valor){this.parametros[nombre]=valor;return this;},async query(query){consultas.push({query,parametros:this.parametros});return query.includes('@Corte')?{recordsets:[[{hasta:row.idEntrega}],[row]]}:{recordset:query.includes('COUNT(*)')?[{noLeidas:1}]:[row]};}});
  return {repo:new NotificacionRepository({request}),consultas,row};
}
test('Personales: SQL acotado por destinatario, empresa, tipos permitidos y cursor parametrizado sin pérdida BigInt',async()=>{
  const {repo,consultas}=fixture();
  await repo.listarPersonales(7,1,{...filtrosPersonales(),cursor:{hasta:'9007199254740999',antes:'9007199254740998'}},['RESERVA_NUEVA']);
  await repo.contarPersonales(7,1,['RESERVA_NUEVA']);
  for(const {query,parametros:p}of consultas){assert.equal(p.Usuario,7);assert.equal(p.Empresa,1);assert.equal(p.TipoPermitido0,'RESERVA_NUEVA');assert.ok(query.includes('d.IdUsuario=@Usuario AND n.IdEmpresa=@Empresa'));assert.equal(/\b(INSERT|UPDATE|DELETE|EXEC)\b/.test(query),false);assert.equal(query.includes('DatosJson'),false);}
  assert.equal(consultas[0].parametros.Antes,'9007199254740998');assert.equal(consultas[0].parametros.Limite,21);assert.ok(consultas[0].query.includes('ORDER BY d.IdEntrega DESC'));
  const tipo=require('tedious/lib/data-types/bigint');assert.equal(tipo.validate('9007199254740998'),9007199254740998n);
});
test('Personales: marcado solo UPDATE del destinatario, revisión binaria y cero escrituras operativas',async()=>{
  const {repo,consultas}=fixture();await repo.marcarPersonalLeida(7,1,'9007199254740997','0000000000000001',['RESERVA_NUEVA']);
  const {query,parametros:p}=consultas[0];assert.equal(p.Notificacion,'9007199254740997');assert.ok(Buffer.isBuffer(p.Revision));
  assert.ok(query.includes('d.FechaLectura IS NULL AND d.VersionRegistro=@Revision'));assert.ok(query.includes('d.IdUsuario=@Usuario AND n.IdEmpresa=@Empresa'));
  const ops=analizarFuente(query,'consulta-capturada.sql');assert.deepEqual([...new Set(ops.filter(o=>o.operacion==='UPDATE').map(o=>o.tabla))],['NotificacionDestinatarios']);assert.equal(ops.some(o=>['Alertas','Reservas','Usuarios'].includes(o.tabla)),false);
  const permisos=new Map([['Notificaciones',new Set(['SELECT'])],['NotificacionDestinatarios',new Set(['SELECT','UPDATE'])]]);
  assert.ok(ops.every(o=>permisos.get(o.tabla)?.has(o.operacion)));permisos.get('NotificacionDestinatarios').delete('UPDATE');assert.equal(ops.every(o=>permisos.get(o.tabla)?.has(o.operacion)),false);
});
test('Personales: IDs y cursores malformados o fuera del rango SQL se rechazan',()=>{
  for(const value of [1,'0','-1','01','1;DROP','9223372036854775808'])assert.throws(()=>idPersonal(value));
  for(const obj of [{hasta:'4',antes:'5'},{hasta:'4',antes:'2',idUsuario:1},{hasta:'0',antes:'0'}])assert.throws(()=>filtrosPersonales({cursor:Buffer.from(JSON.stringify(obj)).toString('base64url')}));
  for(const limite of ['0','-1','51','1.5',[],1])assert.throws(()=>filtrosPersonales({limite}));
});
test('Personales: errores de DTO no filtran datos ni anuncian guardado; falta de fila es 404 y revisión perdida 409',async()=>{
  const service=new NotificacionService();for(const cambio of [{fecha:'incorrecta'},{tipo:'PRIVADO'},{prioridad:'Urgente'},{idEntrega:'1.5'},{versionRegistro:'00'}])assert.throws(()=>service.dtoPersonal({...fixture().row,...cambio}),e=>e.status===503);
  for(const [filas,status]of [[[],404],[[{fechaLectura:null}],409]]){
    const repo=new NotificacionRepository({request:async()=>({input(){return this;},query:async()=>({recordset:filas})})});
    await assert.rejects(repo.marcarPersonalLeida(1,1,'1','0000000000000001',[]),e=>e.status===status);
  }
});
