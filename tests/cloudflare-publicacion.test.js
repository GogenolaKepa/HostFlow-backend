const {test}=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {validarPublicacionCloudflare}=require('../src/config/publicacionCloudflare');
const {configuracionHttp,permiteOrigen}=require('../src/config/httpSeguridad');
const corsSeguro=require('../src/middlewares/corsSeguro');
const {crearMontajeComercial}=require('../src/routes/montajeComercialPreparado');
const env=()=>({HOSTFLOW_PUBLICACION:'cloudflare',HOSTFLOW_PUBLICACION_CONFIRMADA:'1',NODE_ENV:'production',HOSTFLOW_AUTH_SOURCE:'sql',HOSTFLOW_EMPRESA_ID:'1',HOST:'127.0.0.1',PORT:'4000',JWT_SECRET:'SOLO-FICTICIO-LOCAL-'.repeat(3),HOSTFLOW_CORS_ORIGINS:'https://hostflow.com.ar',HOSTFLOW_MONEDAS_WRITE_ENABLED:'0',HOSTFLOW_CONFIGURACION_READ_ONLY:'1',HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED:'0',HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED:'0'});
test('guarda pública inactiva en desarrollo y sin conexiones al importar',()=>{
  assert.equal(validarPublicacionCloudflare().estado,'inactivo');
  assert.equal(configuracionHttp({}).produccion,false);
  assert.ok(!Object.keys(require.cache).some(n=>/[\\/]config[\\/]database\.js$/.test(n)));
  assert.equal(validarPublicacionCloudflare(env()).estado,'preparado');
});
test('Cloudflare rechaza mock, bind público, CORS amplio, JWT débil y protecciones abiertas',()=>{
  for(const [k,v] of Object.entries({HOSTFLOW_PUBLICACION_CONFIRMADA:'0',NODE_ENV:'development',HOSTFLOW_AUTH_SOURCE:'mock',HOST:'0.0.0.0',JWT_SECRET:'corta',HOSTFLOW_CORS_ORIGINS:'https://hostflow.com.ar,https://preview.pages.dev',HOSTFLOW_MONEDAS_WRITE_ENABLED:'1',HOSTFLOW_CONFIGURACION_READ_ONLY:'0',HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED:'1'}))assert.throws(()=>configuracionHttp({...env(),[k]:v}),k);
  const e={...env(),HOSTFLOW_AUTH_COMERCIAL_ENABLED:'1',HOSTFLOW_AUTH_COMERCIAL_ORIGEN:'https://hostflow.com.ar',HOSTFLOW_AUTH_COMERCIAL_PROXIES:'127.0.0.1'};
  assert.doesNotThrow(()=>configuracionHttp(e));assert.throws(()=>configuracionHttp({...e,HOSTFLOW_AUTH_COMERCIAL_ORIGEN:'https://api.hostflow.com.ar'}));
  assert.throws(()=>configuracionHttp({...e,HOSTFLOW_AUTH_COMERCIAL_PROXIES:'0.0.0.0'}));
  const c=configuracionHttp(env());assert.equal(permiteOrigen('https://hostflow.com.ar',c),true);assert.equal(permiteOrigen('https://hostflow.com.ar.evil.invalid',c),false);
});
test('preflight CORS y HTTPS comercial entre dominios con transporte loopback ficticio',async()=>{
  for(const confiar of [false,true]){
    const app=express();if(confiar)app.set('trust proxy',ip=>ip==='127.0.0.1');
    app.use(corsSeguro(configuracionHttp(env())));
    const runtime={estado:'preparado',handler:(_req,res)=>res.sendStatus(204),consultar:()=>({disponible:true,worker:{estado:'activo'},pools:{pools:Array.from({length:4},()=>({conectado:true}))}})};
    app.use('/api/cuentas-comerciales',crearMontajeComercial({activacionAprobada:true,runtime,origen:'https://hostflow.com.ar'}));
    const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const base='http://127.0.0.1:'+s.address().port;
    try{
      const opciones={method:'OPTIONS',headers:{Origin:'https://hostflow.com.ar','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}};
      const pre=await fetch(base+'/api/cuentas-comerciales/invitaciones',opciones);assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'https://hostflow.com.ar');assert.equal(pre.headers.get('access-control-allow-credentials'),null);
      const valido=await fetch(base+'/api/cuentas-comerciales/capacidades',{headers:{Origin:'https://hostflow.com.ar','X-Forwarded-Proto':'https'}});assert.equal(valido.status,confiar?200:426);
      assert.equal((await fetch(base+'/api/cuentas-comerciales/capacidades',{headers:{Origin:'https://otra.invalid','X-Forwarded-Proto':'https'}})).status,403);
    }finally{await new Promise(r=>s.close(r));}
  }
});
