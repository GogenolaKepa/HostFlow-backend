const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const {randomBytes}=require('node:crypto');const jwt=require('jsonwebtoken');
const keys=['HOSTFLOW_AUTH_SOURCE','JWT_SECRET','HOSTFLOW_MONEDAS_SQL_ENABLED','HOSTFLOW_MONEDAS_WRITE_ENABLED'];const antes=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
process.env.HOSTFLOW_AUTH_SOURCE='mock';process.env.JWT_SECRET=randomBytes(32).toString('hex');delete process.env.HOSTFLOW_MONEDAS_SQL_ENABLED;delete process.env.HOSTFLOW_MONEDAS_WRITE_ENABLED;
const idDB=require.resolve('../src/config/database');let sqlAccesos=0;
require.cache[idDB]={id:idDB,filename:idDB,loaded:true,exports:{sql:require('mssql'),poolPromise:new Proxy({},{get(){sqlAccesos++;throw Error('Conexion SQL prohibida');}})}};
const {usuarios}=require('../src/data/mockData');const cuentas=['Administrador','Operador'].map((rol,i)=>({idUsuario:9970+i,nombre:'Prueba monedas',email:`monedas${i}@example.invalid`,estado:'Activo',rol:{nombre:rol}}));usuarios.push(...cuentas);
const servicio=require('../src/services/MonedasService');let fuentes=0;
servicio.cotizaciones.fetcher=async()=>{fuentes++;return {ok:true,text:async()=>JSON.stringify({status:200,results:[{fecha:require('../src/domain/monedas').fechaNegocio(),detalle:[{codigoMoneda:'USD',tipoCotizacion:1000}]}]})};};
const app=require('../src/app');let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api/monedas`;});
after(async()=>{await new Promise(r=>server.close(r));for(const u of cuentas)usuarios.splice(usuarios.indexOf(u),1);for(const [k,v]of Object.entries(antes)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const headers=u=>({Authorization:`Bearer ${jwt.sign({idUsuario:u.idUsuario,email:u.email,origen:'mock'},process.env.JWT_SECRET,{expiresIn:'5m'})}`,'Content-Type':'application/json'});
test('Monedas API: 401/403, ID inválido y body cerrado sin SQL ni consultas externas',async()=>{
 for(const [ruta,method,cab,body,status] of [['/estado','GET',{},undefined,401],['/configuracion','GET',headers(cuentas[1]),undefined,403],
 ['/configuracion','PUT',headers(cuentas[1]),{},403],['/tarifas/5','PUT',headers(cuentas[1]),{},403],['/consultar-bcra','POST',headers(cuentas[1]),{confirmar:true},403],
 ['/tarifas/0','PUT',headers(cuentas[0]),{},400],['/consultar-bcra','POST',headers(cuentas[0]),{},400]]){
  const r=await fetch(base+ruta,{method,headers:cab,...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,status);await r.text();
 }
 assert.equal(sqlAccesos,0);assert.equal(fuentes,0);
});
test('Monedas API: GET/HEAD apagados no escriben ni abren SQL; estado no finge persistencia',async()=>{
 for(const cuenta of cuentas)for(const method of ['GET','HEAD'])for(const ruta of ['/estado','/tarifas','/alertas']){
  const r=await fetch(base+ruta,{method,headers:headers(cuenta)});assert.equal(r.status,ruta==='/tarifas'?503:200);await r.text();
 }
 const estado=await (await fetch(base+'/estado',{headers:headers(cuentas[0])})).json();assert.equal(estado.activado,false);assert.equal(estado.escritura,false);
 const r=await fetch(base+'/configuracion',{method:'PUT',headers:headers(cuentas[0]),body:JSON.stringify({fuente:'MANUAL',valor:'1000',revision:null,confirmarManual:true})});assert.equal(r.status,503);assert.equal((await r.json()).codigo,'MONEDAS_PENDIENTES');assert.equal(sqlAccesos,0);assert.equal(fuentes,0);
});
test('Monedas API: consulta oficial solo con POST explícito, caché sin DML y sin automatismos GET',async()=>{
 const r=await fetch(base+'/consultar-bcra',{method:'POST',headers:headers(cuentas[0]),body:JSON.stringify({confirmar:true})});assert.equal(r.status,200);const j=await r.json();assert.equal(j.persistida,false);assert.equal(j.cotizacion.fuente,'BCRA');assert.equal(j.cotizacion.horaPublicacion,null);
 await (await fetch(base+'/consultar-bcra',{method:'POST',headers:headers(cuentas[0]),body:JSON.stringify({confirmar:true})})).text();assert.equal(fuentes,1);assert.equal(sqlAccesos,0);
});
test('API monetaria ampliada: permisos/IDs/esquema fallan antes de SQL, sin alterar los permisos anteriores',async()=>{
 for(const [ruta,method,cuenta,body,esperado]of [
  ['/propiedades','POST',cuentas[1],{},403],['/reservas/7/acuerdo','GET',cuentas[1],null,403],
  ['/reservas/7/acuerdo','PUT',cuentas[1],{},403],['/reservas/7/fijacion','POST',cuentas[1],{},403],
  ['/reservas/0/acuerdo','GET',cuentas[0],null,400],['/reservas/x/fijacion','POST',cuentas[0],{},400],
  ['/propiedades','POST',cuentas[0],{},503],['/reservas/7/acuerdo','GET',cuentas[0],null,503]
 ]){const r=await fetch(base+ruta,{method,headers:headers(cuenta),...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,esperado);await r.text();}
 assert.equal(sqlAccesos,0);
});
