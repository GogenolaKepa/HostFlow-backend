const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const base=require('./integration/sqlAislado');
const aislado=require('./integration/sqlConfiguracionAislada');
const runId=randomUUID(),contexto={runId,vacia:false};
test('runner específico conserva destino local, marca y pertenencia de solo cuatro tablas',()=>{
  assert.equal(aislado.TABLAS.length,4);
  for(const nombre of ['Empresas','PreferenciasOperativas'])assert.equal(aislado.validarTablas([{esquema:'dbo',tabla:nombre,id:12,propietario:runId}],contexto).length,1);
  for(const fila of [{tabla:'Reservas',propietario:runId},{tabla:'Empresas',propietario:randomUUID()},{tabla:'Empresas',propietario:null},{tabla:'Empresas',propietario:runId,esquema:'otro'}])assert.throws(()=>aislado.validarTablas([{esquema:'dbo',id:12,...fila}],contexto));
  assert.throws(()=>base.validarTablas([{esquema:'dbo',tabla:'Empresas',id:12,propietario:runId}],contexto),'Las guardas originales no se amplían.');
  for(const clave of [base.BASE,base.EQUIPO,base.MARCA,'Shared memory','HostFlowTestRun','objetos','Pertenencia'])assert.ok(aislado.guardas(contexto).toLowerCase().includes(clave.toLowerCase()));
});
test('driver ampliado preserva las prohibiciones de USE, destinos remotos y procedimientos',()=>{
  class Request {query(sql){return sql;}batch(sql){return sql;}}
  const env={HOSTFLOW_SQL_TEST_ENABLED:'1',HOSTFLOW_SQL_TEST_WRITE_APPROVED:'YES_LOCAL_DISPOSABLE'};
  const driver=aislado.driverProtegido({Request},contexto,env),req=new driver.Request();
  assert.ok(req.query('SELECT 1').includes('HostFlow_Test_Seguridad'));
  for(const command of ['USE HostFlow; SELECT 1','DROP DATABASE HostFlow','SELECT * FROM otra.dbo.Empresas',"EXEC('DROP TABLE dbo.Reservas')",'SELECT * FROM OPENQUERY(otro,sql)'])assert.throws(()=>req.query(command));
  assert.throws(()=>req.execute('procedimiento'));
});
test('DDL es propuesta bloqueada: solo tablas nuevas, sin datos o tablas operativas; copia local conserva cuerpo',()=>{
  const fuente=fs.readFileSync(path.join(__dirname,'../sql/proposals/configuracion_empresa/01_modelo_empresa_preferencias.sql'),'utf8');
  assert.ok(fuente.includes('@Aplicar bit = 0'));assert.ok(fuente.includes('@InventarioRevisado bit = 0'));
  assert.deepEqual([...fuente.matchAll(/CREATE TABLE dbo\.(\w+)/g)].map(m=>m[1]),['Empresas','PreferenciasOperativas']);
  const codigo=fuente.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g,'');
  assert.equal(/\b(?:INSERT INTO|UPDATE dbo|DELETE FROM|DROP TABLE|ALTER TABLE)\b/i.test(codigo),false);
  const copia=aislado.migracionConfiguracion(contexto);
  const cuerpo=s=>s.slice(s.indexOf('CREATE TABLE dbo.Empresas'),s.indexOf('EXEC sys.sp_addextendedproperty @name=N\'HostFlowConfiguracionModelo\''));
  assert.equal(cuerpo(copia),cuerpo(fuente));assert.ok(copia.includes(base.BASE));assert.ok(copia.includes(runId));
});

test('propuestas SQL: inventario completo, destino exacto, autocommit inicial y permisos mínimos solo como texto',()=>{
  const leer=nombre=>fs.readFileSync(path.join(__dirname,'../sql/proposals/configuracion_empresa/',nombre),'utf8');
  const inventario=leer('00_metadatos_solo_lectura.sql');
  assert.ok(inventario.includes('WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id'));
  for(const nombre of ['00_metadatos_solo_lectura.sql','03_verificacion_solo_lectura.sql']) {
    const codigo=leer(nombre).replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,'');
    assert.equal(/\b(?:INSERT|UPDATE|DELETE|EXEC|CREATE|ALTER|DROP|MERGE|TRUNCATE|GRANT)\b/i.test(codigo.replace(/N?'(?:[^']|'')*'/g,"''")),false);
  }
  const migracion=leer('01_modelo_empresa_preferencias.sql'),vinculacion=leer('02_vinculacion_inicial_pendiente.sql');
  for(const sql of [migracion,vinculacion]) {
    assert.ok(sql.includes('@@TRANCOUNT<>0'));
    assert.ok(sql.indexOf('@@TRANCOUNT<>0')<sql.indexOf('BEGIN TRANSACTION;'));
    assert.ok(sql.includes('XACT_STATE()<>0 ROLLBACK TRANSACTION'));
    assert.ok(sql.includes("SERVERPROPERTY('EngineEdition')),0)<>5"));
  }
  assert.ok(migracion.includes("@BaseEsperada COLLATE Latin1_General_100_BIN2<>N'HostFlow'"));
  assert.ok(vinculacion.includes('@Aprovisionar bit=0'));
  const permisos=leer('04_permisos_propuestos_solo_lectura.sql');
  assert.ok(permisos.includes('QUOTENAME(@PrincipalBackend)'));
  assert.equal(/\b(?:EXEC|db_owner|ALTER|DELETE)\b/.test(permisos),false);
  assert.equal((permisos.match(/GRANT SELECT, UPDATE ON OBJECT::/g)||[]).length,2);
});
