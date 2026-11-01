const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {crearMontajeComercial}=require('../src/routes/montajeComercialPreparado');
const fs=require('node:fs'),path=require('node:path');
test('fábrica no monta rutas ni aparece en el arranque operativo',()=>{
  assert.equal(crearMontajeComercial(),null);
  for(const f of ['app.js','server.js'])assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),/RuntimeComercialPreparado|PoolsComercialesPreparados|montajeComercialPreparado/);
});
test('HTTPS/origen, capacidades y parada se comprueban en cada petición',async()=>{
  const app=express();app.set('trust proxy','loopback');let estado='detenido',llamadas=0;
  let conectado=true,disponible=true;
  const runtime={estado:'preparado',consultar:()=>({disponible,worker:{estado},pools:{pools:Array.from({length:4},()=>({conectado}))}}),handler:(_req,res)=>{llamadas++;res.sendStatus(204);}};
  app.use('/api/cuentas-comerciales',crearMontajeComercial({activacionAprobada:true,runtime,origen:'https://cuentas.example.invalid'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/cuentas-comerciales';
  const get=(ruta,headers={})=>fetch(base+ruta,{headers});
  try{
    assert.equal((await get('/capacidades')).status,426);
    const headers={'X-Forwarded-Proto':'https',Origin:'https://cuentas.example.invalid'};
    const r=await get('/capacidades',headers);assert.deepEqual(await r.json(),{version:1,recuperacion:false,invitaciones:false});assert.equal(r.headers.get('referrer-policy'),'no-referrer');
    assert.equal((await get('/invitaciones',headers)).status,503);assert.equal(llamadas,0);
    estado='activo';assert.equal((await get('/invitaciones',headers)).status,204);assert.equal(llamadas,1);
    assert.equal((await get('/capacidades',{...headers,Origin:'https://otro.example.invalid'})).status,403);
    assert.equal((await get('/capacidades?token=ficticio',headers)).status,400);
    estado='pausado';assert.equal((await get('/invitaciones',headers)).status,503);assert.equal(llamadas,1);
    estado='activo';conectado=false;assert.equal((await get('/invitaciones',headers)).status,503);
    conectado=true;disponible=false;assert.equal((await get('/invitaciones',headers)).status,503);
  }finally{await new Promise(r=>server.close(r));}
});
