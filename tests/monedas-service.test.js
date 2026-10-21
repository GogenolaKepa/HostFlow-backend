const {test}=require('node:test');const assert=require('node:assert/strict');
const {MonedasService}=require('../src/services/MonedasService');
const {exigirMonedas}=require('../src/config/monedas');
const {ErrorSeguridad}=require('../src/security/seguridadUsuarios');
const actor={idUsuario:9981,versionSesion:1};
const contexto=()=>({idEmpresa:1});const reloj=()=>new Date('2026-10-17T15:00:00Z');
test('Guardas monetarias apagadas/solo lectura fallan antes de acceder al repositorio',async()=>{
 const repo=new Proxy({}, {get(){throw Error('SQL prohibido');}});
 const s=new MonedasService({repository:repo,contexto:()=>exigirMonedas(true,{}),estado:()=>({activado:false})});
 await assert.rejects(s.guardar(actor,{}),e=>e.codigo==='MONEDAS_PENDIENTES');
 assert.deepEqual((await s.alertas()).alertas,[]);
 assert.throws(()=>exigirMonedas(true,{HOSTFLOW_MONEDAS_SQL_ENABLED:'1',HOSTFLOW_AUTH_SOURCE:'sql',HOSTFLOW_CONFIGURACION_ENABLED:'1',HOSTFLOW_EMPRESA_ID:'1'}),e=>e.codigo==='MONEDAS_SOLO_LECTURA');
 assert.throws(()=>exigirMonedas(true,{HOSTFLOW_MONEDAS_SQL_ENABLED:'1',HOSTFLOW_MONEDAS_WRITE_ENABLED:'1',HOSTFLOW_CONFIGURACION_READ_ONLY:'1',HOSTFLOW_AUTH_SOURCE:'sql',HOSTFLOW_CONFIGURACION_ENABLED:'1',HOSTFLOW_EMPRESA_ID:'1'}),e=>e.codigo==='MONEDAS_SOLO_LECTURA','La protección empresarial de solo lectura prevalece sobre la bandera nueva.');
});
test('Cotización manual requiere confirmación, contrato cerrado, revision, tasa positiva y autor del servidor',async()=>{
 let guardado,commits=0;
 const repo={transaccion:async(a,id,fn)=>{assert.deepEqual(a,actor);assert.equal(id,1);const r=await fn(repo);commits++;return r;},guardarConfiguracion:async(...args)=>{guardado=args;return {versionRegistro:'0000000000000001'};}};
 const s=new MonedasService({repository:repo,contexto,reloj});
 for(const body of [{fuente:'MANUAL',valor:'1000',revision:null},{fuente:'MANUAL',valor:'0',confirmarManual:true,revision:null},
  {fuente:'MANUAL',valor:'1000',confirmarManual:true,revision:'vieja'},{fuente:'MANUAL',valor:'1000',confirmarManual:true,revision:null,idEmpresa:2}])await assert.rejects(s.guardar(actor,body));
 assert.equal(commits,0);await s.guardar(actor,{fuente:'MANUAL',valor:'1234.56789012',confirmarManual:true,revision:null});
 assert.equal(guardado[1].valor,'1234.56789012');assert.equal(guardado[1].fecha,'2026-10-17');assert.equal(guardado[3],actor.idUsuario);assert.equal(commits,1);
});
test('Fuente oficial usa snapshot servidor; no acepta valor cliente ni BNA inventado',async()=>{
 const q={fuente:'BCRA',tipo:'BCRA_TIPO_COTIZACION',valor:'1000.00000000',fecha:'2026-10-16'};let guardado;
 const repo={transaccion:async(_a,_i,fn)=>fn(repo),guardarConfiguracion:async(_id,d)=>{guardado=d;return d;}};
 const s=new MonedasService({repository:repo,contexto,cotizaciones:{vigente:id=>{if(id!=='ficticio')throw Error('Vencida');return q;}}});
 await assert.rejects(s.guardar(actor,{fuente:'BNA',revision:null}));await assert.rejects(s.guardar(actor,{fuente:'BCRA',cotizacionId:'vencida',revision:null}));
 await s.guardar(actor,{fuente:'BCRA',cotizacionId:'ficticio',valor:'999999',revision:null});assert.deepEqual(guardado,q);
});
test('Tarifa ARS/USD se guarda explicitamente, precio positivo, referencia servidor; no toca precios históricos',async()=>{
 let guardado;const config={fuente:'BCRA',tipo:'BCRA_TIPO_COTIZACION',valor:'1000.00000000',fecha:'2026-10-16'};
 const repo={transaccion:async(_a,_i,fn)=>fn(repo),configuracion:async()=>config,guardarTarifa:async(...a)=>{guardado=a;return a[2];}};
 const s=new MonedasService({repository:repo,contexto,reloj});
 for(const cambio of [{moneda:'EUR'},{precio:'0'},{confirmar:false},{revision:'x'}])await assert.rejects(s.guardarTarifa(actor,5,{moneda:'USD',precio:'100',revision:null,confirmar:true,...cambio}));
 const resultado=await s.guardarTarifa(actor,5,{moneda:'USD',precio:'100.25',revision:null,confirmar:true});assert.deepEqual(resultado,{moneda:'USD',precio:'100.25'});assert.deepEqual(guardado[5],config);
});
test('Avisos derivados: GET no sincroniza, claves estables, misma fuente y ausencia explícita de referencias',async()=>{
 const tarifa={idPropiedad:5,nombre:'Ficticia',moneda:'ARS',precio:'100000',versionRegistro:'01',referencia:{fuente:'BCRA',tipo:'BCRA_TIPO_COTIZACION',valor:'1000',fecha:'2026-10-16'}};
 const repo={comprobarModelo:async()=>{},configuracion:async()=>({...tarifa.referencia,valor:'1250'}),tarifas:async()=>[tarifa]};
 const s=new MonedasService({repository:repo,contexto,reloj,estado:()=>({activado:true})});
 const a=await s.alertas(),b=await s.alertas();assert.equal(a.alertas.length,1);assert.equal(a.alertas[0].id,b.alertas[0].id);assert.equal(tarifa.precio,'100000');
 repo.configuracion=async()=>null;assert.equal((await s.alertas()).alertas.length,0);
 repo.comprobarModelo=async()=>{throw new ErrorSeguridad(503,'MONEDAS_MODELO_PENDIENTE','Pendiente');};await assert.rejects(s.alertas());
});
