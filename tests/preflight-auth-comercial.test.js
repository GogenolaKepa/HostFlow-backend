const {test}=require('node:test'),assert=require('node:assert/strict');
const {preflightOffline,identidadesDesdeEntorno}=require('../scripts/preflightAuthComercial');
test('preflight offline no lee dotenv ni secretos y no activa con una bandera',()=>{
  assert.equal(preflightOffline().estado,'inactivo');assert.throws(()=>preflightOffline({HOSTFLOW_AUTH_COMERCIAL_ENABLED:'1'}));
  const env={HOSTFLOW_AUTH_COMERCIAL_ENABLED:'1',DB_SERVER:'hostflow.database.windows.net',DB_DATABASE:'HostFlow',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_AUTH_COMERCIAL_ORIGEN:'https://cuentas.example.invalid',HOSTFLOW_AUTH_COMERCIAL_REMITENTE:'cuentas@example.invalid',HOSTFLOW_AUTH_COMERCIAL_DOMINIO:'example.invalid',HOSTFLOW_AUTHCOM_SQL_AUTH:'entra'};
  for(const p of ['INGRESO','WORKER_INGRESO','CUENTAS','CORREO'])env['HOSTFLOW_AUTHCOM_'+p+'_PRINCIPAL']='hf_ficticio_'+p;
  const r=preflightOffline(env);assert.equal(r.estado,'requiere-acreditacion');assert.equal(r.secretosConsultados,false);assert.equal(r.rutasMontadas,false);
  assert.equal(JSON.stringify(r).includes('hf_ficticio'),false);
  env.HOSTFLOW_AUTHCOM_CORREO_PRINCIPAL=env.HOSTFLOW_AUTHCOM_CUENTAS_PRINCIPAL;assert.throws(()=>identidadesDesdeEntorno(env));
});
