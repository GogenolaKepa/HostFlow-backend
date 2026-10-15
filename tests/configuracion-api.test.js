const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const UsuarioService=require('../src/services/UsuarioService');
const {AuthService}=require('../src/services/AuthService');
const {ConfiguracionService}=require('../src/services/ConfiguracionService');
const {UsuariosAislados}=require('./helpers/usuariosAislados');
const ConfiguracionAislada=require('./helpers/configuracionAislada');
const {contextoEmpresa,exigirEscrituraConfiguracion}=require('../src/config/configuracionEmpresa');
const secret=randomBytes(32).toString('hex');process.env.JWT_SECRET=secret;
const usuarios=new UsuariosAislados(), repo=new ConfiguracionAislada(usuarios);
const auth=new AuthService({origen:'sql',repository:usuarios,cuentas:new UsuarioService(usuarios,{cost:4}),secret:()=>secret});
require.cache[require.resolve('../src/services/AuthService')].exports=auth;
let enabled=true,soloLectura=false,negocio=0;
require.cache[require.resolve('../src/services/ConfiguracionService')].exports=new ConfiguracionService({repository:repo,contexto:()=>contextoEmpresa(enabled?{HOSTFLOW_CONFIGURACION_ENABLED:'1',HOSTFLOW_EMPRESA_ID:'1'}:{}),comprobarEscritura:()=>exigirEscrituraConfiguracion({HOSTFLOW_CONFIGURACION_READ_ONLY:soloLectura?'1':'0'})});
const db=require.resolve('../src/config/database');
require.cache[db]={id:db,filename:db,loaded:true,exports:new Proxy({},{get(){throw Error('Acceso Azure prohibido.');}})};
for(const file of fs.readdirSync(path.join(__dirname,'../src/controllers'))) {
  if(['AuthController.js','UsuarioController.js','ConfiguracionController.js'].includes(file))continue;
  const id=require.resolve(`../src/controllers/${file}`);
  require.cache[id]={id,filename:id,loaded:true,exports:new Proxy({},{get(){return(_req,res)=>{negocio++;res.json({ejecutado:true});};}})};
}
const upload=require.resolve('../src/middlewares/propiedadImagenUpload');require.cache[upload]={id:upload,filename:upload,loaded:true,exports:{array:()=> (_req,_res,next)=>next()}};
const app=require('../src/app');let server,url,admin,operador;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}`;});
after(()=>new Promise(r=>server.close(r)));
beforeEach(async()=>{usuarios.filas.clear();usuarios.numeroRevision=0;admin=await usuarios.agregar({id:1});operador=await usuarios.agregar({id:2,rol:'Operador'});repo.reset();enabled=true;soloLectura=false;negocio=0;});
const token=async user=>(await auth.login(user.usuario.email,user.password)).token;
async function pedir(method,ruta,jwt,body) {const r=await fetch(url+ruta,{method,headers:{'content-type':'application/json',...(jwt?{authorization:`Bearer ${jwt}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}

test('JWT ausente da 401; Operador no consulta ni cambia información administrativa',async()=>{
  const jwt=await token(operador);
  for(const [method,ruta] of [['GET','/empresa'],['PUT','/empresa'],['GET','/operativas'],['PUT','/operativas']]) {
    assert.equal((await pedir(method,`/api/configuracion${ruta}`)).status,401);
    assert.equal((await pedir(method,`/api/configuracion${ruta}`,jwt,method==='PUT'?{}:undefined)).status,403);
  }
  assert.equal(repo.lecturas,0);assert.equal(repo.escrituras,0);assert.equal(negocio,0);
});
test('Operador recibe solo horarios operativos predeterminados, no datos empresariales o revisiones',async()=>{
  const result=await pedir('GET','/api/configuracion/predeterminados-reserva',await token(operador));
  assert.equal(result.status,200);assert.deepEqual(Object.keys(result.data.predeterminados).sort(),['horaEgreso','horaIngreso','zonaHoraria']);assert.equal(repo.escrituras,0);
});
test('Admin guarda y recupera; datos normalizados, conflicto 409 y destino cliente rechazado',async()=>{
  const jwt=await token(admin);
  const actual=(await pedir('GET','/api/configuracion/empresa',jwt)).data.empresa;
  for(const extra of [{idEmpresa:2},{idUsuarioActualizacion:2},{activo:false}])assert.equal((await pedir('PUT','/api/configuracion/empresa',jwt,{...actual,...extra})).status,400);
  assert.equal((await pedir('GET','/api/configuracion/empresa?idEmpresa=2',jwt)).status,400);
  const saved=await pedir('PUT','/api/configuracion/empresa',jwt,{...actual,nombreComercial:' Empresa API '});// SQL doble aislado.
  assert.equal(saved.status,200);assert.equal(saved.data.empresa.nombreComercial,'Empresa API');
  assert.equal((await pedir('PUT','/api/configuracion/empresa',jwt,actual)).status,409);
  assert.equal(repo.empresas.get(2).nombreComercial,'Empresa aislada 2');assert.equal(negocio,0);
});
test('cambio obligatorio y JWT revocado bloquean configuración antes del controlador',async()=>{
  const jwt=await token(admin);usuarios.filas.get(1).debeCambiarPassword=true;
  assert.equal((await pedir('GET','/api/configuracion/empresa',jwt)).data.codigo,'PASSWORD_CHANGE_REQUIRED');
  usuarios.filas.get(1).debeCambiarPassword=false;usuarios.filas.get(1).versionSesion++;
  assert.equal((await pedir('GET','/api/configuracion/empresa',jwt)).status,401);assert.equal(repo.lecturas,0);
});
test('guardado permanece bloqueado por defecto: 503 sin SQL y sin falso éxito',async()=>{
  const jwt=await token(admin);enabled=false;
  assert.equal((await pedir('GET','/api/configuracion/empresa',jwt)).status,503);
  assert.equal((await pedir('PUT','/api/configuracion/empresa',jwt,{})).status,503);
  assert.equal((await pedir('GET','/api/configuracion/predeterminados-reserva',await token(operador))).status,503);
  assert.equal(repo.escrituras,0);assert.equal(repo.lecturas,0);
});

test('activación de solo lectura permite GET y bloquea ambos PUT antes de consultar Configuración',async()=>{
  soloLectura=true;
  const jwt=await token(admin),jwtOperador=await token(operador);
  let transacciones=0;
  const transaccion=repo.transaccion;
  repo.transaccion=async()=>{transacciones++;throw Error('No debe iniciarse una transacción.');};
  try {
    for(const ruta of ['/empresa','/operativas']) {
      const urlConfiguracion=`/api/configuracion${ruta}`;
      const datos=await pedir('GET',urlConfiguracion,jwt);
      assert.equal(datos.status,200);
      assert.deepEqual(datos.data.estado,{persistencia:'sql',soloLectura:true});
      const lecturas=repo.lecturas;
      const result=await pedir('PUT',urlConfiguracion,jwt,ruta==='/empresa'?datos.data.empresa:datos.data.preferencias);
      assert.equal(result.status,503);assert.equal(result.data.codigo,'CONFIGURACION_SOLO_LECTURA');
      assert.equal(repo.lecturas,lecturas);
      assert.equal((await pedir('PUT',urlConfiguracion,undefined,{})).status,401);
      assert.equal((await pedir('PUT',urlConfiguracion,jwtOperador,{})).status,403);
    }
    assert.equal((await pedir('GET','/api/configuracion/predeterminados-reserva',jwtOperador)).status,200);
    assert.equal(repo.escrituras,0);assert.equal(transacciones,0);assert.equal(negocio,0);
    soloLectura=false;
    assert.deepEqual((await pedir('GET','/api/configuracion/empresa',jwt)).data.estado,{persistencia:'sql',soloLectura:false});
  } finally {repo.transaccion=transaccion;}
});

test('PUT directo: entradas inválidas dan 400 sin persistir ni divulgar datos empresariales', async()=>{
  const jwt=await token(admin);
  const empresa=(await pedir('GET','/api/configuracion/empresa',jwt)).data.empresa;
  const invalidos=[null,[],{}, {...empresa,nombreComercial:' '}, {...empresa,ciudad:42}, {...empresa,correoContacto:'incorrecto'},
    {...empresa,versionRegistro:'00'}, {...empresa,IdEmpresa:2}, {...empresa,informacionAdicional:'control\u0000'}];
  for(const body of invalidos) {
    const r=await fetch(url+'/api/configuracion/empresa',{method:'PUT',headers:{authorization:`Bearer ${jwt}`,'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal(r.status,400);const data=await r.json();assert.equal(typeof data.mensaje,'string');assert.ok(Object.keys(data).every(k=>['codigo','mensaje'].includes(k)));
  }
  for(const body of [{horaIngreso:'24:00',horaEgreso:'10:00',versionRegistro:'0000000000000002'},
    {horaIngreso:'15:00',horaEgreso:'10:00',versionRegistro:'0000000000000002',zonaHoraria:'UTC'}]) {
    assert.equal((await pedir('PUT','/api/configuracion/operativas',jwt,body)).status,400);
  }
  assert.equal(repo.escrituras,0);assert.equal(negocio,0);
});

test('GET/HEAD/PUT conservan 401/403, no-store y las restricciones antes de acceder a datos',async()=>{
  const jwt=await token(operador);
  for(const method of ['GET','HEAD','PUT']) {
    const r=await fetch(url+'/api/configuracion/empresa',{method,headers:{authorization:`Bearer ${jwt}`}});
    assert.equal(r.status,403);
  }
  assert.equal((await pedir('GET','/api/configuracion/empresa','token-no-valido')).status,401);
  const tokenAdmin=await token(admin);
  const r=await fetch(url+'/api/configuracion/empresa',{headers:{authorization:`Bearer ${tokenAdmin}`}});
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  const lectura=repo.lecturas;
  for(const cambio of [{estado:'Inactivo'},{rol:'Operador'},{rol:'Propietario'}]) {
    usuarios.filas.set(1,{...admin.usuario,...cambio});
    assert.ok([401,403].includes((await pedir('GET','/api/configuracion/empresa',tokenAdmin)).status));
  }
  assert.equal(repo.lecturas,lectura);assert.equal(repo.escrituras,0);assert.equal(negocio,0);
});
