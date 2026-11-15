const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const rb=createRequire(path.resolve(__dirname,'../scripts/hostflowHabitualWindows.js'));
const {ejecutar}=rb('./iniciarComercialWindows');
const {crearConfiguracionAprobada}=rb('./prepararRecuperacionHabitual');
const {ROOT,entornoHabitual}=rb('../src/security/comercial/ConfiguracionHabitualWindows');
const {crearTlsLocal}=rb('../src/security/comercial/TlsLocalNode');
function cargar(){return rb('./hostflowHabitualWindows');}
function fixture(){
 const cfg=crearConfiguracionAprobada([3],'HABITUAL-1794710000000'),mapa=new Map([[path.join(ROOT,'configuracion.json'),Buffer.from(JSON.stringify(cfg))]]),eventos=[],avisos=[];
 let fin=false,terminar,worker='detenido',sql=0,liberado=false;
 const cerrado=new Promise(r=>{terminar=()=>{fin=true;eventos.push('TUNNEL_CERRADO');r();};});
 const proceso=new EventEmitter();Object.assign(proceso,{platform:'win32',pid:54321,stdin:{isTTY:true},stderr:{isTTY:true,write:s=>{avisos.push(s);if(s.startsWith('HOSTFLOW_HABITUAL_DISPONIBLE'))setTimeout(terminar,1);}}});
 const runtime={keyId:'ficticio_habitual_v1',claves:{cifrado:Buffer.alloc(32,7),indice:Buffer.alloc(32,8)},identidad:{cuenta:'PC-ESCRITORIO\\Kepa'},lectorSql:async()=>{throw Error('SQL_REAL_PROHIBIDO');},proveedorCorreo:{abrir:async b=>({...b,permisosAcreditados:true,leer:async()=>{throw Error('LECTURA_APIKEY_PROHIBIDA');},cerrar:async()=>{eventos.push('PROVEEDOR_CERRADO');}})},cerrar(){if(liberado)return;liberado=true;this.claves.cifrado.fill(0);this.claves.indice.fill(0);eventos.push('CLAVES_LIBERADAS');}};
 const f={cfg,mapa,eventos,avisos,proceso,runtime,terminar,driverIntentos:()=>sql,liberado:()=>liberado};
 const p=f.puertos={archivos:{identidad(){},verificar(){},leer:r=>{if(!mapa.has(r))throw Error('FICTICIO_NO_EXISTE');return mapa.get(r);},escribirNuevo:(r,b)=>{if(mapa.has(r))throw Error('FICTICIO_EXISTE');mapa.set(r,Buffer.from(b));}},disco:{unlinkSync:r=>{assert.equal(r,path.join(ROOT,'sesion-activa.json'));mapa.delete(r);eventos.push('LOCK_RETIRADO');}},comprobarSinServicios(){},comprobarTunnel(){},leerSecreto:async()=>Buffer.alloc(32,6),crearCustodia:()=>({abrirRuntime:async()=>runtime}),comprobarSql:async()=>{eventos.push('PREFLIGHT_FICTICIO');return{ingresosPendientes:0,outboxPendiente:0};},comprobarDNS:async s=>s,servidoresWindows:()=>['192.0.2.1'],crearTls:crearTlsLocal,validarOffline(){},tlsOrigen:async()=>eventos.push('TLS_FICTICIO'),crearTunnel:async()=>({listo:Promise.resolve(),cerrado,terminado:()=>fin}),verificarBorde:async()=>({resultado:'BORDE_HABITUAL_ACREDITADO',fechaUTC:new Date().toISOString(),GET:7,sinWorker:true}),transportar:async()=>{throw Error('ENVIO_REAL_PROHIBIDO');}};
 f.crearServidor=async comercial=>{
  eventos.push('BOOTSTRAP_REAL_PREPARADO');assert.equal(comercial.dependencias.dependencias.claves.cifrado.activa,runtime.keyId);
  const servidor={listening:true,close(cb){this.listening=false;eventos.push('HTTP_CERRADO');cb();},comercial:{estado:'preparado',iniciarWorker(){worker='activo';eventos.push('WORKER_FICTICIO');},consultar:()=>({worker:{estado:worker}}),desactivar(){},cerrar:async()=>eventos.push('POOLS_FICTICIOS_CERRADOS')}};return servidor;
 };
 p.ejecutarHost=(args,op)=>ejecutar(args,{...op,driver:{ConnectionPool:class{constructor(){sql++;throw Error('SQL_REAL_PROHIBIDO');}}},iniciarServidor:c=>f.crearServidor(c),cerrarSQLPrincipal:async()=>{if(f.fallarCierre)throw Error('CIERRE_FICTICIO_INCIERTO');}});
 return f;
}
async function entorno(fn){const keys=[...Object.keys(entornoHabitual()),'HOSTFLOW_AUTH_COMERCIAL_KEY_ID'],antes=new Map(keys.map(k=>[k,process.env[k]]));try{return await fn();}finally{for(const[k,v]of antes){if(v===undefined)delete process.env[k];else process.env[k]=v;}}}
test('habitual atraviesa el bootstrap real y toma keyId del runtime, sin SQL/servicios/correos reales',()=>entorno(async()=>{
 const f=fixture();const r=await cargar().iniciar({proceso:f.proceso,puertos:f.puertos});
 assert.equal(r.cerrado,true);assert.ok(f.eventos.includes('BOOTSTRAP_REAL_PREPARADO'));assert.ok(f.avisos.includes('HOSTFLOW_HABITUAL_DISPONIBLE\n'));assert.equal(f.driverIntentos(),0);assert.equal(f.mapa.has(path.join(ROOT,'sesion-activa.json')),false);assert.ok(f.eventos.indexOf('TUNNEL_CERRADO')<f.eventos.indexOf('HTTP_CERRADO'));assert.ok(f.eventos.indexOf('HTTP_CERRADO')<f.eventos.indexOf('LOCK_RETIRADO'));
}));
test('preimagen: entorno habitual sin keyId es rechazado por la validación real de dependencias',()=>{
 const f=fixture(),{prepararDependenciasWindows}=rb('../src/services/DependenciasComercialesWindows');
 assert.throws(()=>prepararDependenciasWindows({aprobacion:true,env:entornoHabitual(),acreditacion:f.cfg.acreditacion,driver:{ConnectionPool:class{}},obtenerCredencial:async()=>{},transportar:async()=>{},obtenerSecretoCorreo:async()=>{},clavesMemoria:f.runtime.claves,tlsDirecto:true,politicaHabitual:f.cfg.politica}),/Versión de clave comercial no acreditada/);
});
test('keyId faltante bloquea antes de SQL y no alcanza servidor ni worker',()=>entorno(async()=>{
 const f=fixture();f.runtime.keyId=undefined;const r=await cargar().iniciar({proceso:f.proceso,puertos:f.puertos});assert.equal(r.cerrado,false);assert.equal(f.driverIntentos(),0);assert.equal(f.eventos.includes('WORKER_FICTICIO'),false);
}));
test('error de bootstrap queda sanitizado y se cierra sin borrar evidencia',()=>entorno(async()=>{
 const f=fixture();f.crearServidor=async()=>{throw Object.assign(Error('FICTICIO_TOKEN_PRIVADO'),{code:'ECONNREFUSED'});};const r=await cargar().iniciar({proceso:f.proceso,puertos:f.puertos});assert.equal(r.cerrado,true);assert.equal(f.driverIntentos(),0);const fallos=[...f.mapa].filter(([p])=>path.basename(p).startsWith('fallo.'));assert.equal(fallos.length,1);const d=JSON.parse(fallos[0][1]);assert.equal(d.fase,'CREAR_HOST');assert.equal(d.diagnostico.etapa,'INICIAR_SERVIDOR');assert.equal(d.diagnostico.categoria,'ECONNREFUSED');assert.doesNotMatch(JSON.stringify(f.avisos)+fallos[0][1].toString(),/FICTICIO_TOKEN_PRIVADO|stack|password/);assert.equal(f.eventos.includes('WORKER_FICTICIO'),false);
}));
test('fallo de TLS se registra y nunca abre Tunnel o worker',()=>entorno(async()=>{
 const f=fixture();let tunnel=0;f.puertos.tlsOrigen=async()=>{throw Error('FICTICIO_TLS_PRIVADO');};f.puertos.crearTunnel=async()=>{tunnel++;throw Error();};await cargar().iniciar({proceso:f.proceso,puertos:f.puertos});const fallo=[...f.mapa].find(([p])=>path.basename(p).startsWith('fallo.'));assert.equal(JSON.parse(fallo[1]).fase,'TLS_ORIGEN');assert.equal(tunnel,0);assert.equal(f.eventos.includes('WORKER_FICTICIO'),false);assert.doesNotMatch(fallo[1].toString(),/FICTICIO_TLS_PRIVADO/);
}));
test('cierre SQL incierto conserva candado y no libera claves ni arranca worker',()=>entorno(async()=>{
 const f=fixture();f.fallarCierre=true;f.crearServidor=async()=>{throw Error('FICTICIO_SERVIDOR');};const r=await cargar().iniciar({proceso:f.proceso,puertos:f.puertos});assert.equal(r.cerrado,false);assert.equal(f.mapa.has(path.join(ROOT,'sesion-activa.json')),true);assert.equal(f.liberado(),false);assert.equal(f.eventos.includes('WORKER_FICTICIO'),false);
}));
test('cancelación durante bootstrap espera preparación y cierra antes de retirar candado',()=>entorno(async()=>{
 const f=fixture();let entrada,seguir,tunnel=0;const empezado=new Promise(r=>entrada=r),pausa=new Promise(r=>seguir=r),crear=f.crearServidor;f.crearServidor=async c=>{entrada();await pausa;return crear(c);};f.puertos.crearTunnel=async()=>{tunnel++;throw Error('TUNNEL_NO_DEBE_INICIARSE');};
 const inicio=cargar().iniciar({proceso:f.proceso,puertos:f.puertos});await empezado;f.proceso.emit('SIGINT');assert.equal(f.eventos.includes('LOCK_RETIRADO'),false);seguir();const r=await inicio;assert.equal(r.cerrado,true);assert.equal(tunnel,0);assert.equal(f.eventos.includes('WORKER_FICTICIO'),false);assert.ok(f.eventos.indexOf('HTTP_CERRADO')<f.eventos.indexOf('LOCK_RETIRADO'));assert.equal(f.liberado(),true);
}));
test('keyId previo del entorno nunca reemplaza al keyId autenticado del runtime',()=>entorno(async()=>{
 process.env.HOSTFLOW_AUTH_COMERCIAL_KEY_ID='ficticio_ajeno';const f=fixture();const r=await cargar().iniciar({proceso:f.proceso,puertos:f.puertos});assert.equal(r.cerrado,true);assert.ok(f.eventos.includes('BOOTSTRAP_REAL_PREPARADO'));assert.equal(f.driverIntentos(),0);
}));
test('cualquier trabajo pendiente o resultado desconocido bloquea antes de HTTPS/Tunnel/worker',()=>entorno(async()=>{
 for(const previo of [{ingresosPendientes:1,outboxPendiente:0},{ingresosPendientes:0,outboxPendiente:1},{},undefined]){
  const f=fixture();let tls=0;f.puertos.comprobarSql=async()=>previo;f.puertos.crearTls=()=>{tls++;throw Error('TLS_NO_AUTORIZADO');};const r=await cargar().iniciar({proceso:f.proceso,puertos:f.puertos});assert.equal(r.cerrado,false);assert.equal(tls,0);assert.equal(f.driverIntentos(),0);assert.equal(f.eventos.includes('WORKER_FICTICIO'),false);assert.equal(f.mapa.has(path.join(ROOT,'sesion-activa.json')),true);assert.ok(f.avisos.includes('COLAS_NO_VACIAS_O_DESCONOCIDAS_NO_ACTIVAR\n'));
 }
}));
