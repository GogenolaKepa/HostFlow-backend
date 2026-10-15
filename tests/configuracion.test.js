const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const {contextoEmpresa,exigirEscrituraConfiguracion}=require('../src/config/configuracionEmpresa');
const {validarEmpresa,validarOperativas,CAMPOS_EMPRESA}=require('../src/security/validacionConfiguracion');
const {ConfiguracionService}=require('../src/services/ConfiguracionService');
const {UsuariosAislados}=require('./helpers/usuariosAislados');
const ConfiguracionAislada=require('./helpers/configuracionAislada');
const {respuestasSeguras}=require('../src/security/erroresSeguros');
const usuarios=new UsuariosAislados();
const repo=new ConfiguracionAislada(usuarios);
const service=new ConfiguracionService({repository:repo,contexto:()=>({idEmpresa:1})});
let admin;
beforeEach(async()=>{usuarios.filas.clear();usuarios.numeroRevision=0;usuarios.rolesDatos.forEach(r=>r.activo=true);admin=(await usuarios.agregar({id:1})).usuario;repo.reset();});
const empresa=(extra={})=>({...Object.fromEntries(Object.keys(CAMPOS_EMPRESA).map(c=>[c,''])),nombreComercial:'Empresa de prueba',versionRegistro:'0000000000000001',...extra});

test('contexto empresarial desactivado por defecto y sin selección implícita de primera empresa',()=>{
  for(const env of [{},{HOSTFLOW_EMPRESA_ID:'1'},{HOSTFLOW_CONFIGURACION_ENABLED:'true',HOSTFLOW_EMPRESA_ID:'1'}])assert.throws(()=>contextoEmpresa(env),e=>e.status===503);
  for(const id of [undefined,'','0','01','-1','2;DROP','2147483648'])assert.throws(()=>contextoEmpresa({HOSTFLOW_CONFIGURACION_ENABLED:'1',HOSTFLOW_EMPRESA_ID:id}),e=>e.status===503);
  assert.deepEqual(contextoEmpresa({HOSTFLOW_CONFIGURACION_ENABLED:'1',HOSTFLOW_EMPRESA_ID:'17'}),{idEmpresa:17});
});

test('guarda temporal: solo 0 o ausencia permiten escribir; 1 y valores inválidos cierran el guardado',async()=>{
  for(const valor of [undefined,'0'])assert.doesNotThrow(()=>exigirEscrituraConfiguracion({HOSTFLOW_CONFIGURACION_READ_ONLY:valor}));
  for(const valor of ['1','','true','false','01',1])assert.throws(()=>exigirEscrituraConfiguracion({HOSTFLOW_CONFIGURACION_READ_ONLY:valor}),e=>e.status===503&&e.codigo==='CONFIGURACION_SOLO_LECTURA');
  const soloLectura=new ConfiguracionService({repository:new Proxy({},{get(){throw Error('No debe consultarse el repositorio.');}}),contexto:()=>({idEmpresa:1}),comprobarEscritura:()=>exigirEscrituraConfiguracion({HOSTFLOW_CONFIGURACION_READ_ONLY:'1'})});
  for(const tipo of ['empresa','operativas'])await assert.rejects(soloLectura.guardar(admin,tipo,{}),e=>e.codigo==='CONFIGURACION_SOLO_LECTURA');
});

test('errores de activación conservan códigos públicos y mensajes fijos sin filtrar detalles',()=>{
  for(const codigo of ['CONFIGURACION_SOLO_LECTURA','CONFIGURACION_PENDIENTE','EMPRESA_NO_CONFIGURADA','MODELO_CONFIGURACION_PENDIENTE','CONFIGURACION_SQL_REQUERIDA','CONFIGURACION_NO_DISPONIBLE','CODIGO_DESCONOCIDO']) {
    let salida;
    const res={statusCode:503,set(){},json(datos){salida=datos;}};
    respuestasSeguras({path:'/api/configuracion/empresa'},res,()=>{});
    res.json({codigo,mensaje:'detalle-interno-no-publicable',detalles:{sql:'no-publicable'}});
    assert.equal(salida.codigo,codigo==='CODIGO_DESCONOCIDO'?'ERROR_INTERNO':codigo);
    assert.deepEqual(Object.keys(salida).sort(),['codigo','mensaje']);
    assert.ok(!salida.mensaje.includes('no-publicable'));assert.equal(res.statusCode,503);
  }
});
test('validación empresarial: límites, campos cerrados, vacíos, correo y controles',()=>{
  assert.equal(validarEmpresa(empresa({nombreComercial:' Negocio ',correoContacto:' INFO@EXAMPLE.INVALID '})).datos.correoContacto,'info@example.invalid');
  for(const invalid of [{nombreComercial:' '},{nombreComercial:'x'.repeat(121)},{correoContacto:'no-es-correo'},{ciudad:'a\u0000b'},{idEmpresa:2},{activo:false},{rol:'Administrador'},{versionRegistro:'1'}])assert.throws(()=>validarEmpresa(empresa(invalid)),e=>e.status===400);
  for(const [campo,limite] of Object.entries(CAMPOS_EMPRESA))assert.throws(()=>validarEmpresa(empresa({[campo]:'x'.repeat(limite+1)})),e=>e.status===400);
});
test('horarios HH:mm y zona fija: no se impone relación check-out/check-in ni se admiten reglas nuevas',()=>{
  const base={horaIngreso:'00:00',horaEgreso:'23:59',versionRegistro:'0000000000000002'};
  assert.equal(validarOperativas(base).datos.horaIngreso,'00:00');
  for(const invalid of [{horaIngreso:'24:00'},{horaEgreso:'9:00'},{horaIngreso:'12:60'},{horaIngreso:'12:00:00'},{zonaHoraria:'UTC'},{limpiezaAutomatica:false}])assert.throws(()=>validarOperativas({...base,...invalid}),e=>e.status===400);
});
test('persistir y recuperar datos afecta solo la empresa del servidor, con auditoría y nueva revisión',async()=>{
  const ajena=await repo.leer(2,'empresa');
  const saved=await service.guardar(admin,'empresa',empresa({nombreComercial:' Empresa actualizada '}));
  assert.equal(saved.nombreComercial,'Empresa actualizada');assert.notEqual(saved.versionRegistro,'0000000000000001');
  assert.deepEqual(await service.obtener('empresa'),saved);assert.deepEqual(await repo.leer(2,'empresa'),ajena);assert.equal(repo.ultimoActor,1);
});
test('dos ediciones concurrentes con la misma revisión: solo una persiste',async()=>{
  const results=await Promise.allSettled([service.guardar(admin,'empresa',empresa({nombreComercial:'Primera'})),service.guardar(admin,'empresa',empresa({nombreComercial:'Segunda'}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.equal(repo.escrituras,1);
});
test('revalidación transaccional de actor: revocado, inactivo, cambio obligatorio y democión no escriben',async()=>{
  for(const cambio of [{versionSesion:99},{estado:'Inactivo'},{debeCambiarPassword:true},{rol:'Operador'}]) {
    usuarios.filas.set(1,{...admin,...cambio});
    await assert.rejects(service.guardar(admin,'empresa',empresa()),e=>[401,403].includes(e.status));assert.equal(repo.escrituras,0);
  }
});
test('persistencia no habilitada ni errores SQL producen guardados o mensajes privados',async()=>{
  const apagado=new ConfiguracionService({repository:repo,contexto:()=>contextoEmpresa({})});
  await assert.rejects(apagado.obtener('empresa'),e=>e.status===503);assert.equal(repo.lecturas,0);
  repo.comprobarModelo=async()=>{throw Error('detalle-privado-sql');};
  try {await assert.rejects(service.obtener('empresa'),e=>e.status===503&&!e.message.includes('privado'));}
  finally {delete repo.comprobarModelo;}
});
