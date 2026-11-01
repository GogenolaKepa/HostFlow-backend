// Diagnóstico OFFLINE explícito. No dotenv, conexiones, vault, workers ni correo.
const {leerConfiguracionComercial}=require('../src/services/ConfiguracionComercialPreparada');
const {PERFILES}=require('../src/services/PoolsComercialesPreparados');
function identidadesDesdeEntorno(env={}){
  const nombres={ingresoHttp:'INGRESO',workerIngreso:'WORKER_INGRESO',cuentas:'CUENTAS',correo:'CORREO'};
  const tipo=env.HOSTFLOW_AUTHCOM_SQL_AUTH;
  if(!['sql','entra'].includes(tipo))throw Error('Configuración de identidades incompleta.');
  const resultado=Object.fromEntries(PERFILES.map(p=>[p,{tipo,principal:env['HOSTFLOW_AUTHCOM_'+nombres[p]+'_PRINCIPAL']}]));
  if(Object.values(resultado).some(v=>typeof v.principal!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{2,79}$/.test(v.principal)||['dbo','sa','guest','public','hostflow_app','hostflowadmin','hostflow_authcom_owner'].includes(v.principal.toLowerCase()))||new Set(Object.values(resultado).map(v=>v.principal.toLowerCase())).size!==4)throw Error('Configuración de identidades incompleta.');
  return resultado; // Solo nombres/tipo; credenciales nunca se leen de este entorno.
}
function preflightOffline(env={}){
  const config=leerConfiguracionComercial(env);
  const base={sqlConsultado:false,secretosConsultados:false,correoEnviado:false,workerIniciado:false,rutasMontadas:false};
  if(!config.habilitado)return {...base,estado:'inactivo'};
  identidadesDesdeEntorno(env);
  return {...base,estado:'requiere-acreditacion',perfiles:4,
    pendientes:['instalacion-y-permisos-aceptados','runtime-transaccional','contactos-verificados','dominio-y-secretos-gestionados','seguridad-http-y-activacion-autorizada']};
}
if(require.main===module){
  if(process.argv.slice(2).join(' ')!=='--offline'){console.error('Solo admite --offline. No conecta a infraestructura.');process.exitCode=1;}
  else try{console.log(JSON.stringify(preflightOffline(process.env),null,2));}catch{console.error('Preflight comercial incompleto: revisar configuración pública, sin mostrar valores ni secretos.');process.exitCode=1;}
}
module.exports={preflightOffline,identidadesDesdeEntorno};
