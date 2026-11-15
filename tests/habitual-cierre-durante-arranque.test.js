const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),path=require('node:path');
const {crearSesionHabitual}=require(path.resolve(__dirname,'../src/services/SesionRecuperacionHabitual'));
function fixture(){
 const eventos=[],proceso=new EventEmitter();let fin=false,resolverCF;const cerrado=new Promise(r=>resolverCF=()=>{fin=true;eventos.push('CF_CERRADO');r();});
 const host={desactivar(){},iniciarWorker(){assert.fail('No iniciar worker tras cancelar');},consultar:()=>({worker:{estado:'detenido'}}),cerrar:async()=>{eventos.push('HOST_CERRADO');return{cerrado:true};}};
 return{eventos,host,proceso,control:{sellar(){},acreditar(){assert.fail();}},crearHost:async()=>host,comprobarHost:async()=>{},crearTunnel:async()=>({listo:Promise.resolve(),cerrado,terminado:()=>fin}),verificar:async()=>{assert.fail();},alCerrar:async()=>{eventos.push('LIBERAR_CANDADO_Y_CLAVES');},terminarCF:resolverCF,cf:{listo:Promise.resolve(),cerrado,terminado:()=>fin}};
}
test('cierre durante crearHost espera host tardío y nunca libera antes los recursos',async()=>{
 const p=fixture();let entregar;p.crearHost=()=>new Promise(r=>entregar=r);const s=crearSesionHabitual(p),inicio=s.iniciar();p.proceso.emit('SIGINT');await Promise.resolve();await Promise.resolve();const liberoAntes=p.eventos.includes('LIBERAR_CANDADO_Y_CLAVES');entregar(p.host);await inicio;await s.terminado;
 assert.equal(liberoAntes,false);assert.deepEqual(p.eventos,['HOST_CERRADO','LIBERAR_CANDADO_Y_CLAVES']);
});
test('cierre durante crearTunnel conserva candado hasta que el Tunnel tardío cierre',async()=>{
 const p=fixture();let entregar,empezo;const iniciado=new Promise(r=>empezo=r);p.crearTunnel=()=>{empezo();return new Promise(r=>entregar=r);};const s=crearSesionHabitual(p),inicio=s.iniciar();await iniciado;p.proceso.emit('SIGINT');await Promise.resolve();await Promise.resolve();const liberoAntes=p.eventos.includes('LIBERAR_CANDADO_Y_CLAVES');entregar(p.cf);await inicio;p.terminarCF();await s.terminado;
 assert.equal(liberoAntes,false);assert.deepEqual(p.eventos,['CF_CERRADO','HOST_CERRADO','LIBERAR_CANDADO_Y_CLAVES']);
});
