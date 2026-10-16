const { ErrorSeguridad, validarCampos, validarRevision } = require('./seguridadUsuarios');
const { TIPOS_PREFERENCIA, PRIORIDADES, PRIORIDADES_PERSONALES } = require('../config/notificaciones');
const fallo = () => new ErrorSeguridad(400, 'VALIDACION_NOTIFICACIONES', 'Revisá los filtros o las preferencias enviadas.');
function filtrosAvisos(query = {}) {
  validarCampos(query, ['pagina', 'limite', 'categoria', 'prioridad'], []);
  const entero = (v, defecto, max) => {
    if (v === undefined) return defecto;
    if (typeof v !== 'string' || !/^[1-9]\d*$/.test(v) || Number(v) > max) throw fallo();
    return Number(v);
  };
  const categoria = query.categoria ?? 'todas', prioridad = query.prioridad ?? 'todas';
  if (!['todas','reservas','alertas'].includes(categoria) || !['todas',...PRIORIDADES].includes(prioridad)) throw fallo();
  return { pagina: entero(query.pagina, 1, 10000), limite: entero(query.limite, 20, 50), categoria, prioridad };
}
function validarPreferencias(body) {
  validarCampos(body, ['preferencias']);
  if (!Array.isArray(body.preferencias) || body.preferencias.length !== TIPOS_PREFERENCIA.length) throw fallo();
  const vistos = new Set();
  return body.preferencias.map(item => {
    validarCampos(item, ['tipo','habilitada','versionRegistro']);
    if (!TIPOS_PREFERENCIA.includes(item.tipo) || vistos.has(item.tipo) || typeof item.habilitada !== 'boolean') throw fallo();
    vistos.add(item.tipo);
    return { tipo: item.tipo, habilitada: item.habilitada,
      versionRegistro: item.versionRegistro === null ? null : validarRevision(item.versionRegistro) };
  });
}
function idPersonal(valor){
  if(typeof valor!=='string'||!/^[1-9]\d{0,18}$/.test(valor)||BigInt(valor)>9223372036854775807n)throw fallo();
  return valor;
}
function filtrosPersonales(query={}){
  validarCampos(query,['limite','cursor','tipo','prioridad','estado'],[]);
  const limite=query.limite===undefined?20:Number(query.limite);
  if(query.limite!==undefined&&(typeof query.limite!=='string'||!/^[1-9]\d?$/.test(query.limite))||!Number.isInteger(limite)||limite>50)throw fallo();
  const tipo=query.tipo??'todas',prioridad=query.prioridad??'todas',estado=query.estado??'todas';
  if(!['todas',...TIPOS_PREFERENCIA].includes(tipo)||!['todas',...PRIORIDADES_PERSONALES].includes(prioridad)||!['todas','noLeidas','leidas'].includes(estado))throw fallo();
  let cursor=null;
  if(query.cursor!==undefined){
    if(typeof query.cursor!=='string'||query.cursor.length>180||!/^[A-Za-z0-9_-]+$/.test(query.cursor))throw fallo();
    try{cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));validarCampos(cursor,['hasta','antes']);idPersonal(cursor.hasta);idPersonal(cursor.antes);if(BigInt(cursor.antes)>BigInt(cursor.hasta))throw fallo();}catch{throw fallo();}
  }
  return {limite,tipo,prioridad,estado,cursor};
}
module.exports = { filtrosAvisos, validarPreferencias, filtrosPersonales, idPersonal };
