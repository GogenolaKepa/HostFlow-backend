const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {crearControlPublicoHabitual}=require('../src/security/comercial/ControlPublicoHabitual');
const {crearSesionHabitual}=require('../src/services/SesionRecuperacionHabitual');
const T=require('../src/security/comercial/TunnelRecuperacionWindows');
const {crearAnilloClavesCorreo}=require('../src/security/comercial/AnilloClavesCorreo');
function puertos(){const eventos=[],proceso=new EventEmitter(),control=crearControlPublicoHabitual();let terminar,fin=false,worker='detenido';const cerrado=new Promise(r=>{terminar=()=>{fin=true;eventos.push('tunnel-cerrado');r();};});const host={iniciarWorker(){eventos.push('worker');worker='activo';},consultar:()=>({worker:{estado:worker}}),desactivar(){eventos.push('sellar');},cerrar:async()=>{eventos.push('host-cerrado');return{cerrado:true};}};return{eventos,proceso,control,terminar,host,crearHost:async()=>{eventos.push('host');return host;},comprobarHost:async()=>{eventos.push('TLS');},crearTunnel:async()=>{eventos.push('tunnel');return{listo:Promise.resolve(),cerrado,terminado:()=>fin};},verificar:async()=>{eventos.push('GET');return{resultado:'BORDE_HABITUAL_ACREDITADO',fechaUTC:new Date().toISOString(),GET:7,sinWorker:true};},alCerrar:async()=>{eventos.push('limpiar');},avisar:codigo=>eventos.push(codigo)};}
test('habitual: TLS y GET antes de worker; Ctrl+C espera Tunnel antes de host/SQL',async()=>{
 const p=puertos(),s=crearSesionHabitual(p);await s.iniciar();assert.deepEqual(p.eventos.slice(0,5),['host','TLS','tunnel','GET','worker']);p.proceso.emit('SIGINT');await Promise.resolve();assert.equal(p.eventos.includes('host-cerrado'),false);assert.equal(p.control.enviosPermitidos(),false);p.terminar();assert.equal((await s.terminado).cerrado,true);assert.ok(p.eventos.indexOf('tunnel-cerrado')<p.eventos.indexOf('host-cerrado'));assert.equal(p.proceso.listenerCount('SIGINT'),0);
});
test('habitual: fallo de GET sella sin worker ni fuerza; requiere Ctrl+C para cerrar CF vivo',async()=>{
 const p=puertos();p.verificar=async()=>{throw Error('FICTICIO_PRIVADO');};const s=crearSesionHabitual(p);await s.iniciar();assert.equal(p.control.enviosPermitidos(),false);assert.equal(p.eventos.includes('worker'),false);assert.equal(p.eventos.includes('host-cerrado'),false);assert.ok(p.eventos.includes('PRESIONE_CTRL_C_PARA_CERRAR_TUNNEL'));p.terminar();await s.terminado;assert.doesNotMatch(JSON.stringify(p.eventos),/FICTICIO_PRIVADO/);
});
test('habitual: fallo TLS posterior a crear host lo cierra sin fugas; cierre SQL incierto conserva lock',async()=>{
 const p=puertos();p.comprobarHost=async()=>{throw Error();};const s=crearSesionHabitual(p);await s.iniciar();assert.equal((await s.terminado).cerrado,true);assert.ok(p.eventos.includes('host-cerrado'));assert.equal(p.eventos.includes('tunnel'),false);
 const q=puertos();q.crearHost=async()=>{throw Object.assign(Error(),{codigo:'CIERRE_NO_ACREDITADO'});};const t=crearSesionHabitual(q);await t.iniciar();assert.equal((await t.terminado).cerrado,false);assert.equal(q.eventos.includes('limpiar'),false);
});
test('habitual: pérdida del Tunnel después de acreditar cierra host y bloquea transporte',async()=>{
 const p=puertos(),s=crearSesionHabitual(p);await s.iniciar();p.terminar();await s.terminado;assert.equal(p.control.enviosPermitidos(),false);assert.ok(p.eventos.includes('host-cerrado'));
});
test('habitual: CF child no hereda secretos, DNS no usa fallback ni Bypass y mantiene HTTPS',async()=>{
 assert.deepEqual(Object.keys(T.entornoAuxiliar()).sort(),['LOCALAPPDATA','SystemRoot','USERPROFILE','WINDIR']);for(const k of ['JWT_SECRET','RESEND_API_KEY','HOSTFLOW_AUTH_COMERCIAL_CIFRADO_BASE64','TUNNEL_TOKEN','NO_TLS_VERIFY','NODE_TLS_REJECT_UNAUTHORIZED','NODE_OPTIONS','NODE_EXTRA_CA_CERTS','NODE_USE_ENV_PROXY','HTTPS_PROXY','HTTP_PROXY'])assert.throws(()=>T.comprobarEntorno([k]));
 assert.deepEqual(T.argumentos('FICTICIO.yml',['192.0.2.1']).slice(-4),['run','--dns-resolver-addrs','192.0.2.1:53',T.UUID]);
 const y=T.yaml(String.raw`C:\FICTICIO\cert.pem`);assert.match(y,/service: https:\/\/localhost:4000/);assert.match(y,/noTLSVerify: false/);assert.match(y,/http_status:404/);assert.equal(new RegExp(T.RUTA).test('/api/dashboard/resumen'),false);
 const s=T.servidoresWindows((_e,args,o)=>{assert.doesNotMatch(args.join(' '),/Bypass|ExecutionPolicy|Set-Dns/);assert.equal(o.env.JWT_SECRET,undefined);return{status:0,stdout:'["192.0.2.1"]'};});assert.deepEqual(s,['192.0.2.1']);await assert.rejects(T.comprobarDNS(s,{resolver:()=>({resolve4:async()=>{throw Error();}})}));
});
test('habitual: auxiliar ACL conserva rutas Unicode mediante JSON ASCII y no muestra errores privados',()=>{
 const archivo=path.resolve(__dirname,'../src/security/comercial/ArchivosPrivadosWindows.js'),fuente=fs.readFileSync(archivo,'utf8');let recibido;
 const cargar=status=>{const m={exports:{}};vm.runInNewContext(fuente,{require:n=>n==='node:child_process'?{spawnSync:(_e,_a,o)=>{recibido=o;return{status,stdout:JSON.stringify({cuenta:'PC-ESCRITORIO\\Kepa',sid:'S-1-5-21-1-2-3-1001',privado:true}),stderr:'FICTICIO_PRIVADO'};}}:n==='node:fs'?{lstatSync:()=>({isSymbolicLink:()=>false})}:require(n),module:m,process:{platform:'win32'},Buffer});return m.exports;};
 const ruta=String.raw`D:\FICTICIO\Año\configuración.json`;cargar(0).verificar(ruta);assert.doesNotMatch(recibido.input,/[^\x00-\x7f]/);assert.equal(JSON.parse(recibido.input).ruta,ruta);assert.deepEqual(Object.keys(recibido.env).sort(),['SystemRoot','WINDIR']);assert.throws(()=>cargar(1).verificar(ruta),e=>!e.message.includes('FICTICIO_PRIVADO'));
});
test('habitual: liberar anillo inutiliza clones sin modificar la clave del dueño',()=>{
 const clave=Buffer.alloc(32,7),anillo=crearAnilloClavesCorreo({activa:'ficticio',claves:[{keyId:'ficticio',clave}]});const s=anillo.sellar({ficticio:true},'id-ficticio');anillo.liberar();assert.throws(()=>anillo.abrir(s,'id-ficticio'));assert.equal(clave.every(b=>b===7),true);clave.fill(0);
});
