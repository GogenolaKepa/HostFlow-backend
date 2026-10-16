// Sin SQL, motor, dotenv, aplicacion ni conexion real.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {LONGITUD_PRIORIDAD,PRIORIDADES_PERSONALES,TIPOS_PREFERENCIA}=require('../src/config/notificaciones');
const {filtrosAvisos,filtrosPersonales}=require('../src/security/validacionNotificaciones');
const {NotificacionRepository}=require('../src/repositories/NotificacionRepository');
const {NotificacionService}=require('../src/services/NotificacionService');
const dir=path.resolve(__dirname,'../sql/proposals/notificaciones');
const leer=n=>fs.readFileSync(path.join(dir,n),'utf8');
const ddl=()=>leer('01_modelo_bloqueado.sql');
const sinLiterales=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'').replace(/N?'(?:''|[^'])*'/g,"''");

test('Prioridad: cuatro valores canonicos, incluida Informativa de 11 caracteres, caben en nvarchar(16)',async()=>{
  assert.equal(LONGITUD_PRIORIDAD,16);assert.equal('Informativa'.length,11);
  assert.deepEqual(PRIORIDADES_PERSONALES,['Critica','Alta','Media','Informativa']);
  assert.match(ddl(),/Prioridad nvarchar\(16\) COLLATE Latin1_General_100_BIN2 NOT NULL/);
  const llamadas=[];
  const driver={Int:{tipo:'int'},NVarChar:longitud=>({tipo:'nvarchar',longitud})};
  const request=async()=>({input(nombre,tipo,valor){
    if(nombre==='Prioridad'){assert.equal(tipo.longitud,16);assert.ok(valor.length<=tipo.longitud);llamadas.push(valor);}return this;
  },query:async()=>({recordsets:[[{total:0,totalSinFiltros:0,hasta:null}],[]]})});
  const repo=new NotificacionRepository({request,driver}),service=new NotificacionService();
  for(const prioridad of PRIORIDADES_PERSONALES){
    assert.ok(prioridad.length<=LONGITUD_PRIORIDAD);
    assert.equal(filtrosAvisos({prioridad}).prioridad,prioridad);
    assert.equal(filtrosPersonales({prioridad}).prioridad,prioridad);
    assert.equal(service.dtoPersonal({idNotificacion:'1',idEntrega:'1',tipo:TIPOS_PREFERENCIA[0],prioridad,fecha:new Date(0),fechaLectura:null,versionRegistro:Buffer.alloc(8)}).prioridad,prioridad);
    await repo.avisos(filtrosAvisos({prioridad}));
    await repo.listarPersonales(1,1,filtrosPersonales({prioridad}),TIPOS_PREFERENCIA);
    assert.ok(ddl().includes(`N'${prioridad}'`));
  }
  assert.equal(llamadas.length,8);
  for(const prioridad of ['Informativ','Informativa ', 'informativa','INFORMATIVA','Crítica','NoDefinida','X'.repeat(16),'X'.repeat(17),'Informativa'+' '.repeat(6)]){
    assert.throws(()=>filtrosPersonales({prioridad}),e=>e.status===400);
  }
  for(const prioridad of ['X'.repeat(16),'X'.repeat(17),'Informativa '])assert.throws(()=>filtrosAvisos({prioridad}),e=>e.status===400);
  // El limite fisico admite 16 unidades UTF-16; el enum sigue siendo mas estricto.
  assert.equal(Buffer.byteLength('X'.repeat(16),'utf16le'),32);
  assert.equal(Buffer.byteLength('X'.repeat(17),'utf16le'),34);
});

test('DDL v2: claves nativas referenciables y collation acreditada antes de escribir',()=>{
  const s=ddl(),inicio=s.indexOf('BEGIN TRANSACTION');
  for(const fragmento of ['@CollationEsperada sysname=NULL','c.user_type_id=56','c.is_computed=0','c.encryption_type IS NULL','i.is_unique=1','i.has_filter=0','i.is_disabled=0','i.is_hypothetical=0','k.key_ordinal>0)=1']){
    assert.ok(s.indexOf(fragmento)>0&&s.indexOf(fragmento)<inicio,fragmento);
  }
  assert.ok(s.includes("SERVERPROPERTY('EngineEdition')),0)<>5"));
  assert.ok(s.includes('DATALENGTH(ReferenciaTipo)=DATALENGTH(RTRIM(ReferenciaTipo))'));
  for(const tipo of TIPOS_PREFERENCIA){assert.ok(tipo.length<=40);assert.equal(s.split(`N'${tipo}'`).length-1,3);}
  assert.equal((s.match(/PRIMARY KEY/g)||[]).length,4);assert.equal((s.match(/CONSTRAINT UQ_/g)||[]).length,2);
  assert.equal((s.match(/CREATE INDEX/g)||[]).length,3);assert.equal((s.match(/DEFAULT SYSUTCDATETIME/g)||[]).length,4);
  assert.equal((s.match(/FOREIGN KEY/g)||[]).length,6);assert.equal((s.match(/CONSTRAINT CK_/g)||[]).length,9);
  for(const relacion of [
    'FOREIGN KEY(IdEmpresa) REFERENCES dbo.Empresas(IdEmpresa)',
    'FOREIGN KEY(IdNotificacion) REFERENCES dbo.Notificaciones(IdNotificacion)',
    'FOREIGN KEY(IdUsuario) REFERENCES dbo.Usuarios(IdUsuario)',
    'FOREIGN KEY(IdUsuarioActualizacion) REFERENCES dbo.Usuarios(IdUsuario)',
  ])assert.ok(s.includes(relacion));
  for(const clave of ['UNIQUE(IdEmpresa,ClaveEvento)','PRIMARY KEY(IdNotificacion,IdUsuario)','PRIMARY KEY(IdUsuario,Tipo)','PRIMARY KEY(IdEmpresa,Tipo)','WHERE FechaLectura IS NULL'])assert.ok(s.includes(clave));
  assert.equal((s.match(/@value=N'hostflow-notificaciones-v2'/g)||[]).length,4);
  assert.equal(/\b(CASCADE|ALTER TABLE|CREATE USER|GRANT|DROP)\b/.test(sinLiterales(s)),false);
});

test('Verificacion administrativa: permisos del principal por catalogo, siete nuevos y 48 historicos, sin SID',()=>{
  const s=leer('06_verificacion_permisos_directos_bloqueada.sql');
  assert.ok(s.includes('@Verificar bit=0'));assert.ok(s.includes('@PrincipalBackend sysname=NULL'));
  assert.ok(s.includes('p.grantee_principal_id=@PrincipalId'));
  assert.equal((s.match(/,N'Nuevo7'\)/g)||[]).length,7);
  const {MATRIZ}=require('../scripts/lib/permisosMinimos');
  for(const t of MATRIZ)for(const op of t.operaciones)assert.ok(s.includes(`(N'${t.tabla}',N'',N'${op}',N'Historico48')`));
  assert.equal((s.match(/,N'Historico48'\)/g)||[]).length,48);
  for(const col of ['Habilitada','FechaActualizacion','FechaLectura'])assert.ok(s.includes(`N'${col}',N'UPDATE',N'Nuevo7'`));
  for(const t of ['PreferenciasNotificacionUsuario','NotificacionDestinatarios'])assert.equal(s.includes(`N'${t}',N'',N'UPDATE',N'Nuevo7'`),false);
  assert.ok(s.includes('FULL JOIN Actuales'));assert.ok(s.includes("a.state='G'"));assert.ok(s.includes("N'Adicional'"));
  assert.ok(s.includes('db_datareader')&&s.includes('db_datawriter')&&s.includes('sys.database_role_members'));
  assert.equal(/\bsid\b/i.test(sinLiterales(s)),false);
  assert.equal(/\b(EXEC|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|DENY)\b/i.test(sinLiterales(s)),false);
  assert.equal(/HAS_PERMS_BY_NAME\(N'dbo\./.test(leer('03_verificacion_solo_lectura.sql')),false);
  assert.ok(leer('03_verificacion_solo_lectura.sql').includes("N'Prioridad',231,32"));
});

test('Copias locales: mismo cuerpo DDL, otro destino con marca, originales Azure sin debilitar',()=>{
  const {preparar}=require('../scripts/prepararNotificacionesLocal');
  const {copia,cuerpo,destino}=preparar();
  assert.equal(copia.slice(copia.indexOf('-- Las FK requieren claves reales')),cuerpo);
  assert.ok(copia.includes('@AplicarLocal bit=0'));assert.ok(copia.includes('HostFlow_Test_Notificaciones_V2'));
  assert.ok(copia.includes('hostflow-notifications-disposable-v2'));assert.ok(copia.includes("CONNECTIONPROPERTY('net_transport')"));
  assert.ok(copia.includes("SERVERPROPERTY('EngineEdition')),0)<>3"));
  assert.ok(ddl().includes("SERVERPROPERTY('EngineEdition')),0)<>5"));
  assert.ok(fs.readFileSync(path.join(destino,'01_fixture_padres_bloqueado.sql'),'utf8').includes('@CrearFixture bit=0'));
  const motor=fs.readFileSync(path.join(destino,'04_pruebas_motor_bloqueadas.sql'),'utf8');
  assert.ok(motor.includes('@ProbarLocal bit=0'));assert.ok(motor.includes('Padres no acreditados como fixtures locales'));
  assert.equal((motor.match(/-- Caso negativo:/g)||[]).length,24);
  assert.equal((motor.match(/COMMIT TRANSACTION/g)||[]).length,0);
  for(const condicion of ['longitud 16','longitud 17','FK evento inexistente','Revision anterior no rechazo','Objetos ajenos al fixture'])assert.ok(motor.includes(condicion));
  const crear=fs.readFileSync(path.join(dir,'../notificaciones_local/00_crear_base_bloqueado.sql'),'utf8');
  assert.ok(crear.includes('@CrearYMarcar bit=0'));assert.ok(crear.indexOf('@@TRANCOUNT<>0')<crear.indexOf('CREATE DATABASE ['));
  assert.equal(/\bBEGIN\s+TRAN(?:SACTION)?\b/i.test(sinLiterales(crear)),false);
  assert.equal(/\bDROP\b/i.test(sinLiterales(crear)),false);
});

test('Propuestas SQL: strings/comentarios y parentesis equilibrados antes de una prueba con motor',()=>{
  // Control lexico basico, NO parser T-SQL ni validacion de motor.
  const fuentes=[...fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).map(leer)];
  const local=path.resolve(__dirname,'../../revision/correcciones-sql-v2/local');
  fuentes.push(...fs.readdirSync(local).filter(n=>n.endsWith('.sql')).map(n=>fs.readFileSync(path.join(local,n),'utf8')));
  for(const fuente of fuentes){
    let estado='codigo',profundidad=0;
    for(let i=0;i<fuente.length;i++){
      const c=fuente[i],siguiente=fuente[i+1];
      if(estado==='linea'){if(c==='\n')estado='codigo';continue;}
      if(estado==='bloque'){if(c==='*'&&siguiente==='/'){estado='codigo';i++;}continue;}
      if(estado==='string'){if(c==="'"){if(siguiente==="'")i++;else estado='codigo';}continue;}
      if(c==='-'&&siguiente==='-'){estado='linea';i++;}
      else if(c==='/'&&siguiente==='*'){estado='bloque';i++;}
      else if(c==="'")estado='string';
      else if(c==='(')profundidad++;
      else if(c===')'){profundidad--;assert.ok(profundidad>=0);}
    }
    assert.ok(['codigo','linea'].includes(estado));assert.equal(profundidad,0);
  }
});
