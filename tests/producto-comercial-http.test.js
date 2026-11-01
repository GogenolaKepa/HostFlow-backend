const {test}=require('node:test'),assert=require('node:assert/strict');
const {crearProductoE2E}=require('./helpers/productoComercialE2E');
const {crearMontajeComercial}=require('../src/routes/montajeComercialPreparado');
test('app real: login independiente, montaje ausente y TLS no confía en headers sin proxy aprobado',async()=>{
  const e=await crearProductoE2E({origen:'http://127.0.0.1:5179'}),{crearApp}=require('../src/app');
  const runtime={estado:'preparado',handler:(_req,res)=>res.sendStatus(204),consultar:()=>({disponible:true,worker:{estado:'activo'},pools:{pools:Array.from({length:4},()=>({conectado:true}))}})};
  const montar=()=>crearMontajeComercial({activacionAprobada:true,runtime,origen:'https://cuentas.example.invalid'});
  assert.throws(()=>crearApp({montajeComercial:montar(),proxiesComerciales:['loopback']}),/Proxies/);
  for(const [app,esperado] of [[crearApp(),401],[crearApp({montajeComercial:montar()}),426],[crearApp({montajeComercial:montar(),proxiesComerciales:['127.0.0.1']}),200]]){
    const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port;
    try{
      assert.equal((await fetch(base+'/api/cuentas-comerciales/capacidades',{headers:{'X-Forwarded-Proto':'https'}})).status,esperado);
      const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.operador.usuario.email,password:e.operador.password})});
      assert.equal(login.status,200);const sesion=await login.json();assert.equal(sesion.usuario.rol,'Operador');
    }finally{await new Promise(r=>server.close(r));}
  }
});
