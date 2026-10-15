const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const base=require('./integration/sqlAislado');
const {limpiar,ejecutar,TABLAS}=require('./integration/sqlConfiguracionAislada');
const runId=randomUUID();
function fixture(tablas) {
  const comandos=[];
  const row={base:base.BASE,equipo:base.EQUIPO,servidor:base.EQUIPO,instancia:null,motor:3,edicion:'Enterprise Evaluation Edition (64-bit)',version:'17.0',soloWindows:1,transporte:'Shared memory',autenticacion:'NTLM',collation:base.COLLATION,marca:base.MARCA,objetosInesperados:0};
  const pool={request:()=>({query:async sql=>({recordset:sql.includes('DB_NAME()')?[row]:tablas}),batch:async sql=>{comandos.push(sql);}})};
  return {pool,comandos};
}
test('limpieza nunca elimina tablas con marca ausente, otra ejecución u objetos ajenos',async()=>{
  for(const tabla of [{tabla:'Empresas',propietario:null},{tabla:'PreferenciasOperativas',propietario:randomUUID()},{tabla:'Reservas',propietario:runId}]){
    const {pool,comandos}=fixture([{esquema:'dbo',id:12,...tabla}]);
    await assert.rejects(limpiar(pool,{runId}));assert.equal(comandos.length,0);
  }
});
test('limpieza acreditada usa una transacción, IDs verificados y orden de dependencias',async()=>{
  const {pool,comandos}=fixture(['Roles','Usuarios','Empresas','PreferenciasOperativas'].map((tabla,i)=>({tabla,esquema:'dbo',id:i+10,propietario:runId})));
  await limpiar(pool,{runId});const sql=comandos[0];
  assert.ok(sql.includes('BEGIN TRANSACTION'));assert.ok(sql.includes("OBJECT_ID(N'dbo.Empresas',N'U'),0)<>12"));
  assert.ok(sql.indexOf('DROP TABLE dbo.PreferenciasOperativas')<sql.indexOf('DROP TABLE dbo.Empresas'));
  assert.ok(sql.indexOf('DROP TABLE dbo.Empresas')<sql.indexOf('DROP TABLE dbo.Usuarios'));
  assert.equal(sql.includes('DROP DATABASE'),false);
});

test('ciclo de configuración limpia tras éxito o fallo; una limpieza fallida nunca se presenta como éxito',async()=>{
  for(const [fallaOperacion,fallaLimpieza] of [[false,false],[true,false],[true,true]]) {
    const tablas=[];
    const {pool,comandos}=fixture(tablas);
    const batch=pool.request().batch;
    pool.request=()=>({query:fixture(tablas).pool.request().query,batch:async sql=>{
      await batch(sql);
      for(const tabla of TABLAS)if(sql.includes(`CREATE TABLE dbo.${tabla}`) && !tablas.some(t=>t.tabla===tabla))tablas.push({tabla,esquema:'dbo',id:tablas.length+10,propietario:runId});
      if(sql.includes('DROP TABLE dbo.')) {
        if(fallaLimpieza)throw Error('Fallo privado simulado de limpieza.');
        tablas.length=0;
      }
    }});
    const operacion=()=>{if(fallaOperacion)throw Error('Fallo privado de operación.');return 7;};
    if(fallaOperacion)await assert.rejects(ejecutar(pool,{runId},operacion),e=>e.faseLocal.startsWith(fallaLimpieza?'limpieza':'integración') && !e.message.includes('Fallo privado'));
    else assert.equal(await ejecutar(pool,{runId},operacion),7);
    assert.ok(comandos.some(sql=>sql.includes('DROP TABLE dbo.PreferenciasOperativas')));
    if(!fallaLimpieza)assert.equal(tablas.length,0);
  }
});
