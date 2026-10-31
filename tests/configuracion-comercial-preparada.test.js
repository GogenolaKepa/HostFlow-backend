const {test}=require('node:test');
const assert=require('node:assert/strict');
const {leerConfiguracionComercial,ensamblarComercial}=require('../src/services/ConfiguracionComercialPreparada');
test('configuración comercial es inactiva por defecto, sin secretos ni dependencias implícitas',async()=>{
  assert.deepEqual(leerConfiguracionComercial(),{habilitado:false});assert.deepEqual(await ensamblarComercial(),{estado:'inactiva'});
  assert.throws(()=>leerConfiguracionComercial({HOSTFLOW_AUTH_COMERCIAL_ENABLED:'true'}));
});
test('flag de servidor solo no activa: exige destino, origen y acreditaciones adicionales',async()=>{
  const env={HOSTFLOW_AUTH_COMERCIAL_ENABLED:'1',DB_SERVER:'hostflow.database.windows.net',DB_DATABASE:'HostFlow',HOSTFLOW_EMPRESA_ID:'1',HOSTFLOW_AUTH_COMERCIAL_ORIGEN:'https://cuentas.example.invalid',HOSTFLOW_AUTH_COMERCIAL_REMITENTE:'cuentas@example.invalid',HOSTFLOW_AUTH_COMERCIAL_DOMINIO:'example.invalid'};
  const config=leerConfiguracionComercial(env);assert.equal(config.correo.limiteDiario,100);
  await assert.rejects(ensamblarComercial({configuracion:config}));await assert.rejects(ensamblarComercial({configuracion:config,dependencias:{}}));
  for(const cambio of[{DB_SERVER:'localhost'},{HOSTFLOW_EMPRESA_ID:'2'},{HOSTFLOW_AUTH_COMERCIAL_ORIGEN:'http://cuentas.example.invalid'},{HOSTFLOW_AUTH_COMERCIAL_LIMITE_DIARIO:'0'}])assert.throws(()=>leerConfiguracionComercial({...env,...cambio}));
});
