const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {NotificacionRepository}=require('../src/repositories/NotificacionRepository');
const {NotificacionService,contextoNotificaciones}=require('../src/services/NotificacionService');
const {TIPOS_PREFERENCIA}=require('../src/config/notificaciones');

function fixture({lock=0,commitError=false,rows=1,sqlError=null}={}){
  const llamadas=[];
  class Transaction{async begin(){llamadas.push({tipo:'begin'});}async commit(){llamadas.push({tipo:'commit'});if(commitError)throw Error('Detalle privado');}async rollback(){llamadas.push({tipo:'rollback'});}}
  class Request{
    constructor(tx){this.tx=tx;this.parametros={};}
    input(nombre,tipo,valor){assert.ok(tipo.local);this.parametros[nombre]=valor;return this;}
    async query(query){llamadas.push({tipo:'query',query,tx:this.tx,parametros:this.parametros});
      if(query.includes('sp_getapplock'))return {recordset:[{resultado:lock}]};
      if(sqlError)throw sqlError;
      if(query.includes('AS totalSinFiltros'))return {recordsets:[[{total:2,totalSinFiltros:2}],[{idAlerta:2,tipo:'CHECKIN_PROXIMO',prioridad:'Alta',fecha:null}]]};
      if(query.includes('extended_properties'))return {recordset:[{modelo:1,empresa:1}]};
      if(query.includes('OUTPUT INSERTED'))return {recordset:Array.from({length:rows},()=>({revision:Buffer.alloc(8,1)}))};
      return {recordset:[]};
    }
  }
  const tipo=()=>({local:true}),driver={Transaction,Request,Int:tipo(),NVarChar:tipo,Binary:tipo,Bit:tipo(),ISOLATION_LEVEL:{READ_COMMITTED:2}};
  return {llamadas,repo:new NotificacionRepository({driver,getPool:async()=>({})})};
}
test('Avisos: SQL estrictamente SELECT, proyección segura, parámetros y límite estable',async()=>{
  const {repo,llamadas}=fixture();
  const datos=await repo.avisos({pagina:3,limite:20,categoria:'reservas',prioridad:'Alta'});assert.equal(datos.total,2);
  const consulta=llamadas[0];assert.deepEqual(consulta.parametros,{Categoria:'reservas',Prioridad:'Alta',Offset:40,Limite:20});
  assert.equal((consulta.query.match(/SELECT/g)||[]).length,2);
  assert.equal(/\b(INSERT|UPDATE|DELETE|MERGE|EXEC|CREATE|ALTER)\b/i.test(consulta.query),false);
  for(const privado of ['Titulo','Mensaje','DatosJson','Huespedes','Usuarios'])assert.equal(consulta.query.includes(privado),false);
  assert.ok(consulta.query.includes('ORDER BY FechaAlerta DESC,IdAlerta DESC OFFSET @Offset ROWS FETCH NEXT @Limite ROWS ONLY'));
});
test('Preferencias: parametrización, aislamiento propio, creación explícita y revisiones en la misma transacción',async()=>{
  const {repo,llamadas}=fixture();const lista=TIPOS_PREFERENCIA.map((tipo,i)=>({tipo,habilitada:i%2===0,versionRegistro:i?null:'0000000000000001'}));
  await repo.transaccion(async tx=>{await tx.comprobarModelo(1);await tx.guardarPreferencias(7,lista);});
  const consultas=llamadas.filter(c=>c.tipo==='query');assert.ok(consultas.every(c=>c.tx===consultas[0].tx));
  const cambios=consultas.filter(c=>c.query.includes('OUTPUT INSERTED'));assert.equal(cambios.length,8);
  assert.ok(cambios.every(c=>c.parametros.Usuario===7&&c.query.includes('WHERE IdUsuario=@Usuario AND Tipo=@Tipo AND VersionRegistro=@Revision')));
  assert.equal(Buffer.isBuffer(cambios[0].parametros.Revision),true);assert.equal(cambios[1].parametros.Revision,null);
  assert.ok(cambios.every(c=>c.query.includes('UPDLOCK,HOLDLOCK')&&c.query.includes('THROW 51801')));
  assert.equal(llamadas.at(-1).tipo,'commit');
});
test('Preferencias: conflicto, bloqueo fallido o commit incierto revierten y ocultan detalle SQL',async()=>{
  for(const options of [{rows:0},{lock:-1},{lock:null},{lock:undefined,commitError:true},{sqlError:{number:51801,message:'Privado'}},{sqlError:Error('Privado')}]){
    const {repo,llamadas}=fixture(options);
    await assert.rejects(repo.transaccion(tx=>tx.guardarPreferencias(1,[{tipo:'RESERVA_NUEVA',habilitada:true,versionRegistro:null}])),e=>[409,503].includes(e.status)&&!e.message.includes('Privado'));
    assert.equal(llamadas.at(-1).tipo,'rollback');
  }
});
test('Preferencias: activación exige SQL y empresa del servidor; escritura nunca implícita',()=>{
  const valido={HOSTFLOW_AUTH_SOURCE:'sql',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_NOTIFICACIONES_SQL_ENABLED:'1'};
  for(const reemplazo of [{HOSTFLOW_AUTH_SOURCE:'mock'},{HOSTFLOW_EMPRESA_ID:''},{HOSTFLOW_EMPRESA_ID:'1;SELECT'},{HOSTFLOW_EMPRESA_ID:'2147483648'},{HOSTFLOW_NOTIFICACIONES_SQL_ENABLED:'true'}])assert.throws(()=>contextoNotificaciones(false,{...valido,...reemplazo}),e=>e.status===503);
  assert.equal(contextoNotificaciones(false,valido).soloLectura,true);assert.throws(()=>contextoNotificaciones(true,valido),e=>e.codigo==='NOTIFICACIONES_SOLO_LECTURA');
  assert.deepEqual(contextoNotificaciones(true,{...valido,HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED:'1'}),{idEmpresa:1,soloLectura:false});
});
test('Preferencias: revalidación transaccional de sesión, rol, estado y cambio obligatorio antes del INSERT',async()=>{
  let escritas=0;const tx={usuarios:{obtener:async()=>actual},comprobarModelo:async()=>{},guardarPreferencias:async()=>{escritas++;return [];}};
  let actual;const service=new NotificacionService({repository:{transaccion:fn=>fn(tx)},contexto:()=>({idEmpresa:1})});
  const bueno={estado:'Activo',rol:'Operador',rolActivo:true,versionSesion:1,debeCambiarPassword:false};
  const body={preferencias:TIPOS_PREFERENCIA.map(tipo=>({tipo,habilitada:false,versionRegistro:null}))};
  for(const cambios of [{versionSesion:2},{estado:'Inactivo'},{rolActivo:false},{rol:'Propietario'},{rol:'Administrador'},{debeCambiarPassword:true}]){
    actual={...bueno,...cambios};await assert.rejects(service.guardar({idUsuario:2,versionSesion:1,rol:'Operador'},body),e=>[401,403].includes(e.status));
  }assert.equal(escritas,0);
});
test('Propuestas nuevas: guardas previas al DDL, cuatro objetos exactos y ningún seed o permiso ejecutado',()=>{
  const carpeta=path.join(__dirname,'../sql/proposals/notificaciones');const ddl=fs.readFileSync(path.join(carpeta,'01_modelo_bloqueado.sql'),'utf8');
  assert.ok(ddl.includes('@Aplicar bit=0,@InventarioRevisado bit=0'));assert.ok(ddl.includes('@ServidorEsperado sysname=NULL'));
  assert.ok(ddl.indexOf("THROW 51861")<ddl.indexOf('BEGIN TRANSACTION'));assert.ok(ddl.includes('@@TRANCOUNT<>0'));
  assert.deepEqual([...ddl.matchAll(/CREATE TABLE dbo\.(\w+)/g)].map(m=>m[1]),['Notificaciones','NotificacionDestinatarios','PreferenciasNotificacionUsuario','PoliticasNotificacionEmpresa']);
  assert.equal(/\b(INSERT|UPDATE|DELETE|MERGE|GRANT|ALTER TABLE|DROP)\b/.test(ddl),false);assert.ok(ddl.includes('ROLLBACK TRANSACTION'));
  for(const archivo of ['00_inspeccion_solo_lectura.sql','03_verificacion_solo_lectura.sql','05_diagnostico_alertas_solo_lectura.sql']){
    const texto=fs.readFileSync(path.join(carpeta,archivo),'utf8');const sentencias=texto.replace(/--[^\n]*/g,'').replace(/N?'(?:''|[^'])*'/g,"''");
    assert.equal(/\b(EXEC|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|GRANT)\b/.test(sentencias),false);
    assert.ok(texto.includes('@ServidorEsperado sysname=NULL'));
  }
  const permisos=fs.readFileSync(path.join(carpeta,'02_permisos_propuestos_solo_lectura.sql'),'utf8');assert.ok(permisos.includes('@PrincipalBackend sysname=NULL'));
  assert.equal(/\b(EXEC|sp_executesql|ALTER ROLE)\b/i.test(permisos),false);assert.ok(permisos.includes("SELECT N'GRANT"));
  assert.ok(permisos.includes('PreferenciasNotificacionUsuario (Habilitada, FechaActualizacion)'));
  assert.ok(permisos.includes('NotificacionDestinatarios (FechaLectura)'));
  assert.equal(permisos.includes('GRANT SELECT, INSERT, UPDATE'),false);
  assert.ok(ddl.includes('IdEntrega bigint IDENTITY'));assert.ok(ddl.includes('Obligatoria=0 OR Habilitada=1'));
  assert.equal((ddl.match(/CONSTRAINT CK_/g)||[]).length,9);assert.equal((ddl.match(/FOREIGN KEY/g)||[]).length,6);
});
