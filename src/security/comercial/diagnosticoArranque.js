// Solo metadatos estáticos de arranque; nunca mensajes, causas, SQL o parámetros.
const ETAPAS=new Set(['CONFIGURACION_SERVIDOR','CARGA_APP','VALIDACION_HOST','PREPARACION_LOGIN_SQL','PREPARACION_COMERCIAL','CONSTRUIR_APP','CREAR_HTTPS','ESCUCHAR_HTTPS','ESCUCHAR_HTTP','ABRIR_POOLS_COMERCIALES','ENSAMBLAR_COMERCIAL','DEPENDENCIAS_HOST','IDENTIDAD_WINDOWS','PROVEEDOR_LOCAL_CORREO','INICIAR_SERVIDOR','ESPERAR_SERVIDOR','ACTIVAR_WORKER','CIERRE']);
const CODIGOS=new Set(['ETIMEOUT','ESOCKET','ELOGIN','ECONNCLOSED','ECONNREFUSED','EREQUEST','EADDRINUSE','EACCES','ERR_OSSL_PEM_NO_START_LINE','ERR_OSSL_ASN1_TOO_LONG','SQL_NO_DISPONIBLE','IDENTIDAD_NO_ACREDITADA','CREDENCIAL_NO_DISPONIBLE','CIERRE_INCOMPLETO','CIERRE_NO_ACREDITADO','PERMISO_COMERCIAL_FALTANTE','SQL_NO_PREPARADO','COMERCIAL_NO_PREPARADO','JWT_NO_PREPARADO','AUTH_SOURCE_DESFASE','NO_CLASIFICADO']);
const PERFILES=new Set(['ingresoHttp','workerIngreso','cuentas','correo','operativo']);
function limpiar(d){
 if(!d||!ETAPAS.has(d.etapa))return null;
 return Object.freeze({etapa:d.etapa,categoria:CODIGOS.has(d.categoria)?d.categoria:'NO_CLASIFICADO',perfil:PERFILES.has(d.perfil)?d.perfil:null,numeroSQL:Number.isInteger(d.numeroSQL)&&d.numeroSQL>0&&d.numeroSQL<65536?d.numeroSQL:null});
}
function diagnostico(etapa,error,perfil){
 const previo=limpiar(error?.diagnosticoArranque);if(previo)return previo;
 const codigo=error?.codigo||error?.code,n=error?.number??error?.originalError?.info?.number;
 return limpiar({etapa:ETAPAS.has(etapa)?etapa:'VALIDACION_HOST',categoria:codigo,perfil,numeroSQL:n});
}
function errorArranque(etapa,original){const e=Error('Arranque no acreditado; diagnóstico sanitizado disponible.');e.diagnosticoArranque=diagnostico(etapa,original);return e;}
module.exports={limpiar,diagnostico,errorArranque};
