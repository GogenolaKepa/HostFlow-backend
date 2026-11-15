const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
process.env.HOSTFLOW_AUTH_SOURCE='mock';process.env.NODE_ENV='test';
test('construcción habitual desde otra carpeta no crea uploads ni intenta preparar negocio',async()=>{
 const cwd=process.cwd(),temporal=fs.mkdtempSync(path.join(os.tmpdir(),'hf-habitual-importacion-'));
 try{
  process.chdir(temporal);
  const e=await require('./helpers/productoComercialE2E').crearProductoE2E({origen:'http://127.0.0.1:5179'});
  assert.ok(e.app);assert.equal(fs.existsSync(path.join(temporal,'uploads')),false);
  e.cuentas.protector.liberar();
 }finally{process.chdir(cwd);assert.equal(path.dirname(temporal),os.tmpdir());fs.rmdirSync(temporal);}
});
