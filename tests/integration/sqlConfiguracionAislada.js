// Extensión específica del aislamiento existente: las pruebas de seguridad
// conservan su allowlist de dos tablas. Aquí solo se admiten cuatro tablas.
const fs=require('node:fs'),path=require('node:path');
const base=require('./sqlAislado');
const {numerosErrorSQL}=require('../../src/security/seguridadUsuarios');
const TABLAS=Object.freeze(['Roles','Usuarios','Empresas','PreferenciasOperativas']);
const extras=",ISNULL(OBJECT_ID(N'dbo.Empresas',N'U'),-1),ISNULL(OBJECT_ID(N'dbo.PreferenciasOperativas',N'U'),-1)";
function ampliarObjetos(sql) {
  const original="ISNULL(OBJECT_ID(N'dbo.Usuarios',N'U'),-1))";
  if(!sql.includes(original))throw Error('Cambió el contrato de aislamiento.');
  return sql.replace(original,"ISNULL(OBJECT_ID(N'dbo.Usuarios',N'U'),-1)"+extras+")");
}
const METADATOS=ampliarObjetos(base.METADATOS_CONEXION);
function guardas(contexto) {
  return ampliarObjetos(base.guardasSQL(contexto)).replace("t.name NOT IN (N'Roles',N'Usuarios')","t.name NOT IN (N'Roles',N'Usuarios',N'Empresas',N'PreferenciasOperativas')");
}
function validarTablas(tablas,{runId,vacia=false}) {
  base.validarTablas([], {runId});
  if(!Array.isArray(tablas)||(vacia&&tablas.length)||tablas.some(t=>t.esquema!=='dbo'||!TABLAS.includes(t.tabla)||t.propietario!==runId||!Number.isInteger(t.id)||t.id<=0))throw Error('Pertenencia de objetos no acreditada.');
  return tablas;
}
async function verificar(pool,contexto) {
  base.validarConexion((await pool.request().query(METADATOS)).recordset[0],base.BASE);
  return validarTablas((await pool.request().query(base.METADATOS_TABLAS)).recordset,contexto);
}
function driverProtegido(driver,contexto,env) {
  const protegido=base.driverProtegido(driver,contexto,env);
  class Request extends protegido.Request {
    proteger(command) {
      const seguro=super.proteger(command),prefijo=base.guardasSQL(contexto);
      if(!seguro.startsWith(prefijo))throw Error('No se pudo preservar la guarda original.');
      return guardas(contexto)+seguro.slice(prefijo.length);
    }
  }
  return {...protegido,Request};
}
function marca(tabla,runId) {
  validarTablas([{esquema:'dbo',tabla,id:1,propietario:runId}],{runId});
  return `EXEC sys.sp_addextendedproperty @name=N'${base.PROPIEDAD_RUN}',@value=N'${runId}',
   @level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'${tabla}';`;
}
function migracionConfiguracion(contexto) {
  const fuente=fs.readFileSync(path.join(__dirname,'../../sql/proposals/configuracion_empresa/01_modelo_empresa_preferencias.sql'),'utf8');
  const cambios=[['@Aplicar bit = 0','@Aplicar bit = 1'],['@InventarioRevisado bit = 0','@InventarioRevisado bit = 1'],
    ['@BaseEsperada sysname = NULL',`@BaseEsperada sysname = N'${base.BASE}'`],['@ServidorEsperado sysname = NULL',`@ServidorEsperado sysname = N'${base.EQUIPO}'`],
    ["@BaseEsperada COLLATE Latin1_General_100_BIN2<>N'HostFlow'",`@BaseEsperada COLLATE Latin1_General_100_BIN2<>N'${base.BASE}'`],
    ["DATALENGTH(@BaseEsperada)<>DATALENGTH(N'HostFlow')",`DATALENGTH(@BaseEsperada)<>DATALENGTH(N'${base.BASE}')`],
    ["SERVERPROPERTY('EngineEdition')),0)<>5","SERVERPROPERTY('EngineEdition')),0)<>3"]];
  let copia=fuente;
  for(const [anterior,nuevo]of cambios){if(copia.split(anterior).length!==2)throw Error('Cambió una guarda de la propuesta.');copia=copia.replace(anterior,nuevo);}
  copia=copia.replace('COMMIT TRANSACTION;',`${marca('Empresas',contexto.runId)}\n${marca('PreferenciasOperativas',contexto.runId)}\nCOMMIT TRANSACTION;`);
  return guardas(contexto)+copia;
}
function vinculacionInicial(contexto) {
  let copia=fs.readFileSync(path.join(__dirname,'../../sql/proposals/configuracion_empresa/02_vinculacion_inicial_pendiente.sql'),'utf8');
  for(const [anterior,nuevo]of [['@Aprovisionar bit=0','@Aprovisionar bit=1'],['@ServidorEsperado sysname=NULL',`@ServidorEsperado sysname=N'${base.EQUIPO}'`],
    ["SERVERPROPERTY('EngineEdition')),0)<>5","SERVERPROPERTY('EngineEdition')),0)<>3"]]) {
    if(copia.split(anterior).length!==2)throw Error('Cambió la vinculación propuesta.');copia=copia.replace(anterior,nuevo);
  }
  if(copia.split("N'HostFlow'").length!==3)throw Error('Cambió el destino de la vinculación.');
  return guardas(contexto)+copia.replaceAll("N'HostFlow'",`N'${base.BASE}'`);
}
async function limpiar(pool,contexto) {
  contexto.vacia=false;
  const tablas=await verificar(pool,contexto);if(!tablas.length)return;
  const orden=['PreferenciasOperativas','Empresas','Usuarios','Roles'];
  const comandos=orden.filter(n=>tablas.some(t=>t.tabla===n)).map(nombre=>{
    const id=tablas.find(t=>t.tabla===nombre).id;
    return `IF ISNULL(OBJECT_ID(N'dbo.${nombre}',N'U'),0)<>${id} THROW 51590,'Identidad de objeto cambio: no limpiar.',1;\nDROP TABLE dbo.${nombre};`;
  }).join('\n');
  await pool.request().batch(`SET XACT_ABORT ON;BEGIN TRY BEGIN TRANSACTION;${guardas(contexto)}${comandos}
   COMMIT TRANSACTION;END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK TRANSACTION;THROW;END CATCH;`);
}
async function ejecutar(pool,contexto,operacion) {
  let validado=false,fase='aislamiento',resultado,fallo;
  try {
    contexto.vacia=true;await verificar(pool,contexto);validado=true;
    fase='fixtures';await pool.request().batch(base.fixtureRoles(contexto.runId));contexto.vacia=false;
    await pool.request().batch(base.migracionParaPruebas(base.BASE,contexto.runId));
    fase='modelo de configuración';await pool.request().batch(migracionConfiguracion(contexto));
    fase='integración';resultado=await operacion();
  }catch(error){fallo=Object.assign(Error(`Falló configuración SQL local en ${fase}; ejecución ${contexto.runId}. Sin detalles privados.`),{faseLocal:`${fase}/${contexto.faseOperacion||'preparación'}`,codigosSQL:numerosErrorSQL(error),codigoSeguro:typeof error.codigo==='string'&&/^[A-Z_]+$/.test(error.codigo)?error.codigo:undefined,tipoError:error.name});}
  // Limpiar también después de un fallo. Si no puede acreditarse la limpieza,
  // su error tiene prioridad; nunca convertirlo en éxito ni ampliar el borrado.
  if(validado){try{await limpiar(pool,contexto);}catch(error){throw Object.assign(Error(`Limpieza local no acreditada. Inspección manual requerida; ejecución ${contexto.runId}.`),{faseLocal:'limpieza',codigosSQL:numerosErrorSQL(error)});}}
  if(fallo)throw fallo;
  return resultado;
}
module.exports={TABLAS,METADATOS,guardas,validarTablas,verificar,driverProtegido,migracionConfiguracion,vinculacionInicial,limpiar,ejecutar};
