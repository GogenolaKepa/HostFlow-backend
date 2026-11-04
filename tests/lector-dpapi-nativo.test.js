const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {crearLectorCredencialDpapi}=require('../src/security/comercial/LectorCredencialDpapi');
const {abrirPoolsComerciales}=require('../src/services/PoolsComercialesPreparados');
const directorio=path.resolve(__dirname,'../../revision/ejecucion-real-authcom-2026-11-01/bin');
// Integración Windows optativa: los artefactos externos no forman parte de Git/CI.
const nativo=(nombre,caso)=>test(nombre,{skip:process.platform!=='win32'||!['StubLectorDpapi.exe','LectorDpapi.exe'].every(n=>fs.existsSync(path.join(directorio,n)))},caso);
const artefacto=nombre=>{const ejecutable=path.join(directorio,nombre);return {habilitado:true,ejecutable,sha256:crypto.createHash('sha256').update(fs.readFileSync(ejecutable)).digest('hex')};};
test('lector inactivo y configuración inválida no acceden a credenciales',async()=>{
 await assert.rejects(crearLectorCredencialDpapi()({perfil:'cuentas'}),/inactivo/);
 assert.throws(()=>crearLectorCredencialDpapi({habilitado:true,ejecutable:'relativo.exe',sha256:'0'.repeat(64)}),/no acreditado/);
});
nativo('binario alterado, perfil y principal ajenos quedan bloqueados',async()=>{
 const cfg=artefacto('StubLectorDpapi.exe');
 await assert.rejects(crearLectorCredencialDpapi({...cfg,sha256:'0'.repeat(64)})({perfil:'cuentas'}),/no acreditada/);
 const leer=crearLectorCredencialDpapi(cfg);
 await assert.rejects(leer({perfil:'../cuentas'}),/no acreditado/);
 await assert.rejects(leer({perfil:'cuentas',principal:'hostflow_app'}),/no acreditado/);
 await assert.rejects(leer({perfil:'cuentas',principal:null}),/no acreditado/);
});
nativo('aprovisionamiento requiere permiso expreso y cuenta correcta antes de crear archivos',async()=>{
 const leer=crearLectorCredencialDpapi(artefacto('LectorDpapi.exe'));
 await assert.rejects(leer.provisionar({cuentaWindowsConfirmada:'PC-ESCRITORIO\\Kepa'}),/no autorizado/);
 await assert.rejects(leer.provisionar({cuentaWindowsConfirmada:'PC-ESCRITORIO\\OtraCuenta',autorizar:true}),/distinta/);
});
nativo('pipe rechaza JSON incorrecto, exceso, campos inesperados y datos de otro perfil',async()=>{
 const anterior=process.env.HF_DPAI_TEST_MODE,leer=crearLectorCredencialDpapi(artefacto('StubLectorDpapi.exe'));
 try{for(const modo of ['invalido','exceso','extra','otro','fallo']){process.env.HF_DPAI_TEST_MODE=modo;await assert.rejects(leer({perfil:'cuentas'}),e=>e.message==='Credencial privada no acreditada.');}}
 finally{if(anterior===undefined)delete process.env.HF_DPAI_TEST_MODE;else process.env.HF_DPAI_TEST_MODE=anterior;}
});
nativo('cancelación previa y timeout solo afectan al auxiliar propio',async()=>{
 const anterior=process.env.HF_DPAI_TEST_MODE,c=new AbortController();c.abort();
 const leer=crearLectorCredencialDpapi({...artefacto('StubLectorDpapi.exe'),timeoutMs:100});
 await assert.rejects(leer({perfil:'cuentas',signal:c.signal}));
 try{process.env.HF_DPAI_TEST_MODE='demora';await assert.rejects(leer({perfil:'cuentas'}));}
 finally{if(anterior===undefined)delete process.env.HF_DPAI_TEST_MODE;else process.env.HF_DPAI_TEST_MODE=anterior;}
});
nativo('Node y auxiliar nativo acreditan cuenta ejecutora sin abrir almacén ni SQL',async()=>{
 const id=await crearLectorCredencialDpapi(artefacto('LectorDpapi.exe')).consultarIdentidad();
 assert.equal(id.windows,true);assert.equal(id.cuenta.split('\\').at(-1),require('node:os').userInfo().username);assert.match(id.sid,/^S-1-5-21-/);
});
nativo('callback nativo alimenta cuatro pools ficticios independientes y cierra todos',async()=>{
 const anterior=process.env.HF_DPAI_TEST_MODE;delete process.env.HF_DPAI_TEST_MODE;
 const nombres={ingresoHttp:'hostflow_auth_ingreso',workerIngreso:'hostflow_auth_worker',cuentas:'hostflow_auth_cuentas',correo:'hostflow_auth_correo'},creados=[];
 class ConnectionPool{constructor(c){this.config=c;creados.push(this);}on(){}async connect(){this.connected=true;}request(){return{query:async()=>({recordset:[{base:'HostFlow',servidor:'hostflow',motor:5,principal:this.config.user}]})};}async close(){this.connected=false;}}
 try{
  const p=await abrirPoolsComerciales({habilitado:true,driver:{ConnectionPool},identidades:Object.fromEntries(Object.entries(nombres).map(([perfil,principal])=>[perfil,{tipo:'sql',principal}])),obtenerCredencial:crearLectorCredencialDpapi(artefacto('StubLectorDpapi.exe'))});
  assert.equal(creados.length,4);assert.equal(new Set(creados.map(x=>x.config.user)).size,4);assert.ok(creados.every(x=>x.config.options.encrypt&&x.config.options.trustServerCertificate===false));await p.cerrar();assert.ok(creados.every(x=>!x.connected));
 }finally{if(anterior===undefined)delete process.env.HF_DPAI_TEST_MODE;else process.env.HF_DPAI_TEST_MODE=anterior;}
});
