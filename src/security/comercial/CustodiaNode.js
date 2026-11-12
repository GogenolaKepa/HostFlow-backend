const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sobre=require('./SobreSecretosNode');
const windows=require('./ArchivosPrivadosWindows');
const PERFILES=Object.freeze({ingresoHttp:'hostflow_auth_ingreso',workerIngreso:'hostflow_auth_worker',cuentas:'hostflow_auth_cuentas',correo:'hostflow_auth_correo'});
const TIPOS=['crypto','sql','resend-seguridad'];
const fallo=()=>Error('Custodia Node no acreditada.');
function validar(tipo,d){
 const {meta:m,valores:v}=d;
 sobre.campos(m,tipo==='crypto'?['tipo','keyId']:tipo==='sql'?['tipo','principales']:['tipo','dominio','uso']);
 if(m.tipo!==tipo)throw fallo();
 if(tipo==='crypto'){
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(m.keyId||'')||v.length!==2||v.some(b=>b.length!==32)||v[0].equals(v[1]))throw fallo();
 }else if(tipo==='sql'){
  if(JSON.stringify(m.principales)!==JSON.stringify(PERFILES)||v.length!==4||v.some(b=>b.length<32||b.length>128||b.some(c=>c<33||c>126)))throw fallo();
 }else if(tipo==='resend-seguridad'){
  if(m.dominio!=='hostflow.com.ar'||m.uso!=='seguridad'||v.length!==1||v[0].length<20||v[0].length>256||v[0].some(c=>c<33||c>126))throw fallo();
 }else throw fallo();
}
function crearCustodia({raiz,cuenta,archivos=windows}={}){
 raiz=archivos.ruta(raiz);let id;
 function identificar(){id=archivos.identidad(cuenta);return id;}
 function contexto(){return id.sid+'|'+raiz.toLowerCase();}
 function comprobarRaiz(){
  identificar();archivos.verificar(raiz);
  const nombres=fs.readdirSync(raiz);
  if(!nombres.length||nombres.some(n=>!TIPOS.map(t=>t+'.json').includes(n)&&n!=='RECUPERACION.json'))throw fallo();
 }
 async function guardar(tipo,d,secreto){
  validar(tipo,d);let payload,cifrado;
  try{payload=sobre.empaquetar(d.meta,d.valores);cifrado=await sobre.sellar(payload,{secreto,proposito:tipo,contexto:contexto()});archivos.escribirNuevo(path.join(raiz,tipo+'.json'),cifrado);}
  finally{payload?.fill(0);cifrado?.fill(0);}
 }
 async function leer(tipo,secreto){
  if(!TIPOS.includes(tipo))throw fallo();comprobarRaiz();let plano;
  try{plano=await sobre.abrir(archivos.leer(path.join(raiz,tipo+'.json')),{secreto,proposito:tipo,contexto:contexto()});const d=sobre.desempaquetar(plano);try{validar(tipo,d);return d;}catch{d.liberar();throw fallo();}}
  finally{plano?.fill(0);}
 }
 async function primeraProvision({secreto,keyId,autorizar=false,recuperacionPreviaAcreditada=false}={}){
  if(autorizar!==true||recuperacionPreviaAcreditada!==true||!keyId||!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)||fs.existsSync(raiz))throw fallo();
  sobre.validarSecreto(secreto);identificar();archivos.crearDirectorio(raiz);
  const a=crypto.randomBytes(32),h=crypto.randomBytes(32);
  try{if(a.equals(h))throw fallo();await guardar('crypto',{meta:{tipo:'crypto',keyId},valores:[a,h]},secreto);}
  finally{a.fill(0);h.fill(0);}
 }
 async function comprobarImportacion(tipo,secreto){
  if(!['sql','resend-seguridad'].includes(tipo))throw fallo();
  comprobarRaiz();if(fs.existsSync(path.join(raiz,tipo+'.json')))throw fallo();
  // Acreditar la contraseña del almacén ya creado antes de añadir otro propósito.
  const actual=await leer('crypto',secreto);actual.liberar();
 }
 async function importarCredenciales({secreto,tipo,valores,autorizar=false,procedenciaConfirmada=false}={}){
  if(autorizar!==true||procedenciaConfirmada!==true||!Array.isArray(valores)||valores.some(b=>Buffer.isBuffer(b)&&b.equals(secreto)))throw fallo();
  await comprobarImportacion(tipo,secreto);
  const meta=tipo==='sql'?{tipo,principales:PERFILES}:{tipo,dominio:'hostflow.com.ar',uso:'seguridad'};
  await guardar(tipo,{meta,valores},secreto);
 }
 async function exportar({secreto,recuperacion,destino,autorizar=false}={}){
  sobre.validarSecreto(secreto);sobre.validarSecreto(recuperacion);
  if(autorizar!==true||secreto.equals(recuperacion))throw fallo();
  comprobarRaiz();destino=archivos.ruta(destino);
  if(destino.toLowerCase().startsWith(raiz.toLowerCase()+path.sep)||fs.existsSync(destino))throw fallo();
  const bloques=[],tipos=TIPOS.filter(t=>fs.existsSync(path.join(raiz,t+'.json')));let paquete,cifrado;
  try{
   for(const tipo of tipos){const d=await leer(tipo,secreto);try{bloques.push(sobre.empaquetar(d.meta,d.valores));}finally{d.liberar();}}
   // La envoltura externa admite valores hasta 1024 bytes; los payloads fijos caben.
   paquete=sobre.empaquetar({tipo:'respaldo',tipos},bloques);
   cifrado=await sobre.sellar(paquete,{secreto:recuperacion,proposito:'respaldo',contexto:'portable-v1'});
   archivos.escribirNuevo(destino,cifrado);
   return{sha256:crypto.createHash('sha256').update(cifrado).digest('hex'),tipos,restauracionAcreditada:false};
  }finally{for(const b of bloques)b.fill(0);paquete?.fill(0);cifrado?.fill(0);}
 }
 async function abrirRespaldo({recuperacion,respaldo,sha256}={}){
  if(!/^[a-f0-9]{64}$/.test(sha256||''))throw fallo();let plano;
  // Un respaldo cifrado puede venir de otro SID/volumen. Su autenticidad procede
  // del hash independiente y AEAD, no de la ACL del equipo que se perdió.
  respaldo=archivos.ruta(respaldo);if(path.extname(respaldo)!=='.hfbackup')throw fallo();
  const fd=fs.openSync(respaldo,'r');let bytes;
  try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size<1||s.size>65536)throw fallo();bytes=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)throw fallo();
  try{
   plano=await sobre.abrir(bytes,{secreto:recuperacion,proposito:'respaldo',contexto:'portable-v1'});
   const d=sobre.desempaquetar(plano);try{
    sobre.campos(d.meta,['tipo','tipos']);const tipos=d.meta.tipos;
    if(d.meta.tipo!=='respaldo'||!Array.isArray(tipos)||!tipos.length||tipos[0]!=='crypto'||new Set(tipos).size!==tipos.length||tipos.some(t=>!TIPOS.includes(t))||tipos.length!==d.valores.length)throw fallo();
    const items=[];
    try{for(const b of d.valores)items.push(sobre.desempaquetar(b));items.forEach((item,i)=>validar(tipos[i],item));return{tipos,items,liberar(){items.forEach(i=>i.liberar());}};}catch{items.forEach(i=>i.liberar());throw fallo();}
   }finally{d.liberar();}
  }finally{bytes.fill(0);plano?.fill(0);}
 }
 async function restaurar({secreto,recuperacion,respaldo,sha256,autorizar=false}={}){
  if(autorizar!==true||fs.existsSync(raiz)||secreto.equals(recuperacion))throw fallo();sobre.validarSecreto(secreto);identificar();
  const r=await abrirRespaldo({recuperacion,respaldo,sha256});
  try{archivos.crearDirectorio(raiz);for(let i=0;i<r.tipos.length;i++)await guardar(r.tipos[i],r.items[i],secreto);return{keyId:r.items[0].meta.keyId,tipos:r.tipos};}
  finally{r.liberar();}
 }
 async function verificarRespaldo(opciones){
  const r=await abrirRespaldo(opciones);
  try{for(let i=0;i<r.tipos.length;i++){const d=await leer(r.tipos[i],opciones.secreto);try{if(JSON.stringify(d.meta)!==JSON.stringify(r.items[i].meta)||d.valores.some((b,n)=>!b.equals(r.items[i].valores[n])))throw fallo();}finally{d.liberar();}}return{keyId:r.items[0].meta.keyId,tipos:r.tipos,continuidad:true};}
  finally{r.liberar();}
 }
 async function acreditarRecuperacion(opciones){
  if(opciones.autorizar!==true||opciones.custodiaExternaConfirmada!==true||typeof opciones.referencia!=='string'||!opciones.referencia.trim()||opciones.referencia.length>200)throw fallo();
  const v=await verificarRespaldo(opciones);
  const huellas=Object.fromEntries(v.tipos.map(t=>[t,crypto.createHash('sha256').update(archivos.leer(path.join(raiz,t+'.json'))).digest('hex')]));
  archivos.escribirNuevo(path.join(raiz,'RECUPERACION.json'),Buffer.from(JSON.stringify({version:1,keyId:v.keyId,tipos:v.tipos,huellas,respaldoSHA256:opciones.sha256,referencia:opciones.referencia,custodiaExternaConfirmada:true})));
  return{keyId:v.keyId,tipos:v.tipos};
 }
 async function abrirRuntime(secreto){
  comprobarRaiz();const acta=JSON.parse(archivos.leer(path.join(raiz,'RECUPERACION.json')).toString('utf8'));
  sobre.campos(acta,['version','keyId','tipos','huellas','respaldoSHA256','referencia','custodiaExternaConfirmada']);
  if(acta.version!==1||acta.custodiaExternaConfirmada!==true||JSON.stringify(acta.tipos)!==JSON.stringify(TIPOS)||!acta.referencia||!/^[a-f0-9]{64}$/.test(acta.respaldoSHA256||''))throw fallo();
  for(const t of TIPOS)if(crypto.createHash('sha256').update(archivos.leer(path.join(raiz,t+'.json'))).digest('hex')!==acta.huellas[t])throw fallo();
  const abiertos=[];try{for(const t of TIPOS)abiertos.push(await leer(t,secreto));if(abiertos[0].meta.keyId!==acta.keyId)throw fallo();let cerrado=false;
   return{keyId:acta.keyId,claves:{cifrado:abiertos[0].valores[0],indice:abiertos[0].valores[1]},
    lectorSql:async({perfil,principal}={})=>{if(cerrado||!Object.hasOwn(PERFILES,perfil)||principal!==undefined&&principal!==PERFILES[perfil])throw fallo();return{user:PERFILES[perfil],password:abiertos[1].valores[Object.keys(PERFILES).indexOf(perfil)].toString('ascii')};},
    proveedorCorreo:{abrir:async binding=>{if(cerrado||binding.cuenta.toLowerCase()!==id.cuenta.toLowerCase()||binding.dominio!=='hostflow.com.ar'||binding.proposito!=='resend-envio')throw fallo();return{...binding,permisosAcreditados:true,leer:async()=>{if(cerrado)throw fallo();return Buffer.from(abiertos[2].valores[0]);},cerrar:async()=>{}};}},
    identidad:id,cerrar(){if(cerrado)return;cerrado=true;abiertos.forEach(d=>d.liberar());}};
  }catch{abiertos.forEach(d=>d.liberar());throw fallo();}
 }
 return{primeraProvision,comprobarImportacion,importarCredenciales,exportar,restaurar,verificarRespaldo,acreditarRecuperacion,abrirRuntime,leer};
}
module.exports={crearCustodia,PERFILES};
