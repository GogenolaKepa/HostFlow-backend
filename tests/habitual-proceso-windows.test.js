const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const P=require('../src/security/comercial/ProcesoTunnelWindows'),T=require('../src/security/comercial/TunnelRecuperacionWindows');
const {recuperar}=require('../scripts/recuperarCierreHabitual');
const {ROOT}=require('../src/security/comercial/ConfiguracionHabitualWindows');
test('habitual: proceso y argumentos no admiten inyección; auxiliares sin entorno privado',async()=>{
 await assert.rejects(P.abrirVentana(['--token','FICTICIO & otro']));
 let observado;assert.equal(P.pidActivo(123,(_exe,args,o)=>{observado={args,o};return{status:0,stdout:'{"existe":false}'};}),false);
 assert.equal(observado.o.env.JWT_SECRET,undefined);assert.doesNotMatch(observado.args.join(' '),/Stop-Process|taskkill|ExecutionPolicy|Bypass/);
 assert.throws(()=>P.pidActivo(123,()=>({status:0,stdout:'{"existe":null}'})));
 assert.equal(P.consultarProceso({pid:123,inicio:'638999999999999999'},()=>({status:0,stdout:'{"activo":true,"inicio":"638999999999999998"}'})),false);
});
test('habitual: recuperación manual de candado solo tras ausencia completa; conserva evidencia',()=>{
 const lock=path.join(ROOT,'sesion-activa.json'),ref='HABITUAL-1794710000000-00000000-0000-4000-8000-000000000001';
 const mapa=new Map([[lock,Buffer.from(JSON.stringify({version:1,referencia:ref,pid:123,fechaUTC:'2026-11-15T00:00:00.000Z'}))]]);
 const a={identidad(){},verificar(){},leer:p=>mapa.get(p),escribirNuevo:(p,b)=>{if(mapa.has(p))throw Error();mapa.set(p,b);}};
 const disco={existsSync:p=>mapa.has(p),unlinkSync:p=>mapa.delete(p)},procesos={comprobarSinServicios(){},pidActivo:()=>true};
 assert.throws(()=>recuperar({archivos:a,disco,procesos}));assert.equal(mapa.has(lock),true);procesos.pidActivo=()=>null;assert.throws(()=>recuperar({archivos:a,disco,procesos}));
 procesos.pidActivo=()=>false;const r=recuperar({archivos:a,disco,procesos});assert.equal(r.resultado,'CIERRE_ANTERIOR_ARCHIVADO');assert.equal(mapa.has(lock),false);assert.equal(mapa.has(r.evidencia),true);assert.equal([...mapa.keys()].some(p=>p.includes('presupuesto')),false);
});
test('habitual: observador Windows REAL con Node FICTICIO auto-salida, sin servicios ni señales',{skip:process.platform!=='win32'},async()=>{
 const archivo=path.resolve(__dirname,'../src/security/comercial/ProcesoTunnelWindows.js'),fuente=fs.readFileSync(archivo,'utf8'),m={exports:{}};
 vm.runInNewContext(fuente,{require:n=>n==='./TunnelRecuperacionWindows'?{...T,CF:process.execPath}:require(n),module:m,process,Buffer,setTimeout});
 let iniciado=false,inciertos=0;
 const h=await m.exports.abrirVentana([path.resolve(__dirname,'helpers/habitual-auto-salida-ficticia.js')],{onIncierto:()=>{inciertos++;},crear:(exe,args,o)=>{
  assert.deepEqual(Object.keys(o.env).sort(),['LOCALAPPDATA','SystemRoot','USERPROFILE','WINDIR']);assert.equal(o.shell,false);assert.equal(o.windowsHide,true);assert.match(args.at(-1),/WindowStyle Normal/);assert.match(args.at(-1),/WaitForExit/);assert.doesNotMatch(args.join(' '),/Stop-Process|taskkill|Bypass|ExecutionPolicy/);
  // El proceso de test no requiere una ventana visible. Solo cambia visibilidad.
  const a=[...args];a[a.length-1]=a.at(-1).replace('WindowStyle Normal','WindowStyle Hidden');iniciado=true;return spawn(exe,a,o);
 }});
 assert.equal(iniciado,true);assert.ok(Number.isSafeInteger(h.pid));await h.cerrado;assert.equal(h.terminado(),true);assert.equal(inciertos,0);
});
test('habitual: pérdida del observador o metadatos desconocidos no se declaran cierre seguro',async()=>{
 for(const canal of ['proceso','stdin','stdout','stderr']){
 const hijo=new EventEmitter();hijo.stdout=new EventEmitter();hijo.stderr=new EventEmitter();hijo.stdin=new EventEmitter();hijo.stdin.end=()=>queueMicrotask(()=>(canal==='proceso'?hijo:hijo[canal]).emit('error',Error('FICTICIO_PRIVADO')));
 let fallo=false;await assert.rejects(P.abrirVentana(['run'],{crear:()=>hijo,onIncierto:()=>{fallo=true;}}),e=>e.codigo==='CIERRE_NO_ACREDITADO'&&!e.message.includes('FICTICIO_PRIVADO'));assert.equal(fallo,true);
 }
});
