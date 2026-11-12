// Formato de datos nuevo. Node/OpenSSL solamente; no DPAPI, intérpretes o binarios propios.
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const PROPOSITOS=Object.freeze(['crypto','sql','resend-seguridad','respaldo']);
const PARAMETROS=Object.freeze({nombre:'scrypt',N:131072,r:8,p:1,longitud:32});
const fallo=()=>Error('Almacén cifrado no acreditado.');
function campos(o,claves){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join('|')!==[...claves].sort().join('|'))throw fallo();}
function validarSecreto(b){
 if(!Buffer.isBuffer(b)||b.length<32||b.length>256||new Set(b).size<10||b.some(c=>c<32||c>126))throw fallo();
}
function base64(s,n,max=n){if(typeof s!=='string'||s.length>Math.ceil(max/3)*4)throw fallo();const b=Buffer.from(s,'base64');if(b.length<n||b.length>max||b.toString('base64')!==s)throw fallo();return b;}
function validarCabecera(h){
 campos(h,['version','producto','proposito','contexto','kdf','cifrado']);
 if(h.version!==1||h.producto!=='hostflow-secretos-node-v1'||!PROPOSITOS.includes(h.proposito)||typeof h.contexto!=='string'||!h.contexto||h.contexto.length>1024)throw fallo();
 campos(h.kdf,['nombre','N','r','p','longitud','salt']);
 for(const [k,v]of Object.entries(PARAMETROS))if(h.kdf[k]!==v)throw fallo();
 campos(h.cifrado,['nombre','iv']);if(h.cifrado.nombre!=='aes-256-gcm')throw fallo();
 base64(h.kdf.salt,32);base64(h.cifrado.iv,12);
}
// Orden canónico explícito: todas las propiedades y parámetros están autenticados.
function aad(h){return Buffer.from(JSON.stringify([h.version,h.producto,h.proposito,h.contexto,h.kdf.nombre,h.kdf.N,h.kdf.r,h.kdf.p,h.kdf.longitud,h.kdf.salt,h.cifrado.nombre,h.cifrado.iv]));}
let turno=Promise.resolve();
async function derivar(secreto,h){
 validarSecreto(secreto);validarCabecera(h);
 const anterior=turno;let liberar;turno=new Promise(r=>{liberar=r;});await anterior;
 try{return await scrypt(secreto,Buffer.concat([Buffer.from('HostFlow:'+h.proposito+':v1:'),base64(h.kdf.salt,32)]),32,{N:PARAMETROS.N,r:8,p:1,maxmem:256*1024*1024});}
 finally{liberar();}
}
async function sellar(payload,{secreto,proposito,contexto}={}){
 if(!Buffer.isBuffer(payload)||payload.length<1||payload.length>32768)throw fallo();
 const h={version:1,producto:'hostflow-secretos-node-v1',proposito,contexto,kdf:{...PARAMETROS,salt:crypto.randomBytes(32).toString('base64')},cifrado:{nombre:'aes-256-gcm',iv:crypto.randomBytes(12).toString('base64')}};
 let key;
 try{key=await derivar(secreto,h);const c=crypto.createCipheriv('aes-256-gcm',key,base64(h.cifrado.iv,12),{authTagLength:16});c.setAAD(aad(h));const cifrado=Buffer.concat([c.update(payload),c.final()]);return Buffer.from(JSON.stringify({cabecera:h,cifrado:cifrado.toString('base64'),tag:c.getAuthTag().toString('base64')}));}
 catch{throw fallo();}finally{key?.fill(0);}
}
async function abrir(bytes,{secreto,proposito,contexto}={}){
 let key,parcial,final;
 try{
  if(!Buffer.isBuffer(bytes)||bytes.length>65536)throw fallo();
  const d=JSON.parse(bytes.toString('utf8'));campos(d,['cabecera','cifrado','tag']);validarCabecera(d.cabecera);
  if(d.cabecera.proposito!==proposito||d.cabecera.contexto!==contexto)throw fallo();
  const cifrado=base64(d.cifrado,1,32768),tag=base64(d.tag,16);
  key=await derivar(secreto,d.cabecera);const c=crypto.createDecipheriv('aes-256-gcm',key,base64(d.cabecera.cifrado.iv,12),{authTagLength:16});c.setAAD(aad(d.cabecera));c.setAuthTag(tag);
  parcial=c.update(cifrado);final=c.final();return Buffer.concat([parcial,final]);
 }catch{throw fallo();}finally{key?.fill(0);parcial?.fill(0);final?.fill(0);}
}
// Valores sensibles en buffers con longitudes explícitas; no JSON de secretos.
function empaquetar(meta,valores){
 const m=Buffer.from(JSON.stringify(meta));if(m.length>4096||!Array.isArray(valores)||valores.length>16||valores.some(v=>!Buffer.isBuffer(v)||v.length<1||v.length>1024))throw fallo();
 const partes=[Buffer.from('HFN1'),Buffer.alloc(4),m,Buffer.alloc(1)];partes[1].writeUInt32BE(m.length);partes[3][0]=valores.length;
 for(const b of valores){const n=Buffer.alloc(2);n.writeUInt16BE(b.length);partes.push(n,b);}return Buffer.concat(partes);
}
function desempaquetar(payload){
 const valores=[];try{if(!Buffer.isBuffer(payload)||payload.length<10||payload.subarray(0,4).toString()!=='HFN1')throw fallo();const n=payload.readUInt32BE(4);if(n>4096||8+n>=payload.length)throw fallo();const meta=JSON.parse(payload.subarray(8,8+n).toString('utf8'));let pos=8+n;const count=payload[pos++];if(count>16)throw fallo();for(let i=0;i<count;i++){if(pos+2>payload.length)throw fallo();const l=payload.readUInt16BE(pos);pos+=2;if(!l||l>1024||pos+l>payload.length)throw fallo();valores.push(Buffer.from(payload.subarray(pos,pos+l)));pos+=l;}if(pos!==payload.length)throw fallo();return{meta,valores,liberar(){for(const b of valores)b.fill(0);}};}catch{for(const b of valores)b.fill(0);throw fallo();}
}
module.exports={sellar,abrir,empaquetar,desempaquetar,validarSecreto,PARAMETROS,campos};
