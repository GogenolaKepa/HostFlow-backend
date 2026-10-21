const {ErrorSeguridad}=require('../security/seguridadUsuarios');
const {contextoEmpresa}=require('./configuracionEmpresa');
function estadoMonedas(env=process.env) {
 const activado=env.HOSTFLOW_MONEDAS_SQL_ENABLED==='1',escritura=activado&&env.HOSTFLOW_MONEDAS_WRITE_ENABLED==='1'&&
  (env.HOSTFLOW_CONFIGURACION_READ_ONLY===undefined||env.HOSTFLOW_CONFIGURACION_READ_ONLY==='0');
 const reservas=activado&&env.HOSTFLOW_MONEDAS_RESERVAS_ENABLED==='1';
 return {activado,escritura,reservas,acuerdosEscritura:reservas&&escritura,persistencia:activado?'sql':'pendiente'};
}
function exigirMonedas(escritura=false,env=process.env) {
 const estado=estadoMonedas(env);
 if(!estado.activado)throw new ErrorSeguridad(503,'MONEDAS_PENDIENTES','La persistencia de monedas está pendiente de aprobación. No se guardaron cambios.');
 if(env.HOSTFLOW_AUTH_SOURCE!=='sql')throw new ErrorSeguridad(503,'MONEDAS_PENDIENTES','Monedas requiere autenticación SQL.');
 if(escritura&&!estado.escritura)throw new ErrorSeguridad(503,'MONEDAS_SOLO_LECTURA','Monedas está en modo de solo lectura.');
 return contextoEmpresa(env);
}
module.exports={estadoMonedas,exigirMonedas};
