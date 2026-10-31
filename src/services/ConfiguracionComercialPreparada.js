// Parser puro. No lee process.env/.env, vault, SQL ni red al importar.
// Solo prepara opciones del servidor; no monta HTTP ni crea pools.
const {prepararIntegracionComercial}=require('./IntegracionComercialPreparada');
function leerConfiguracionComercial(env={}){
  const flag=env.HOSTFLOW_AUTH_COMERCIAL_ENABLED??'0';
  if(!['0','1'].includes(flag))throw TypeError('Bandera comercial inválida.');
  if(flag==='0')return Object.freeze({habilitado:false});
  if(env.DB_SERVER!=='hostflow.database.windows.net'||env.DB_DATABASE!=='HostFlow'||env.HOSTFLOW_EMPRESA_ID!=='1')throw TypeError('Destino comercial no aprobado.');
  const u=new URL(env.HOSTFLOW_AUTH_COMERCIAL_ORIGEN);
  if(u.protocol!=='https:'||u.origin!==env.HOSTFLOW_AUTH_COMERCIAL_ORIGEN||u.username||u.password)throw TypeError('Origen comercial HTTPS fijo obligatorio.');
  const remitente=env.HOSTFLOW_AUTH_COMERCIAL_REMITENTE,dominio=env.HOSTFLOW_AUTH_COMERCIAL_DOMINIO;
  if(typeof remitente!=='string'||typeof dominio!=='string'||!remitente.endsWith('@'+dominio)||/[\r\n\s]/.test(remitente))throw TypeError('Remitente comercial inválido.');
  const raw=env.HOSTFLOW_AUTH_COMERCIAL_LIMITE_DIARIO??'100';
  if(!/^[1-9]\d{0,4}$|^100000$/.test(raw))throw TypeError('Presupuesto comercial inválido.');
  return Object.freeze({habilitado:true,sql:Object.freeze({servidorEsperado:'hostflow',baseEsperada:'HostFlow',idEmpresa:1}),
    correo:Object.freeze({origen:u.origin,remitente,dominioVerificado:dominio,limiteDiario:Number(raw)})});
}
async function ensamblarComercial({configuracion=leerConfiguracionComercial(),dependencias}={}){
  if(configuracion.habilitado!==true)return prepararIntegracionComercial();
  if(!dependencias)throw TypeError('Dependencias comerciales no acreditadas.');
  // Una bandera no sustituye pools, claves, autenticador ni acreditaciones verificadas.
  return prepararIntegracionComercial({...dependencias,habilitado:true,sql:{...dependencias.sql,...configuracion.sql},correo:{...dependencias.correo,...configuracion.correo}});
}
module.exports={leerConfiguracionComercial,ensamblarComercial};
