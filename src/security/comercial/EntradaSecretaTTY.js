// Sin readline/eco, argumentos, logs, portapapeles o entorno. Solo consola personal.
function leerSecreto(pregunta,{entrada=process.stdin,salida=process.stderr}={}){
 if(!entrada.isTTY||!salida.isTTY||typeof entrada.setRawMode!=='function')return Promise.reject(Error('Requiere una terminal personal.'));
 return new Promise((resolve,reject)=>{
  const bytes=Buffer.alloc(256);let n=0,fin=false;const anterior=Boolean(entrada.isRaw);
  const terminar=(error)=>{if(fin)return;fin=true;entrada.removeListener('data',datos);entrada.removeListener('error',fallo);entrada.setRawMode(anterior);entrada.pause();salida.write('\n');const valor=error?null:Buffer.from(bytes.subarray(0,n));bytes.fill(0);if(error)reject(Error('Entrada privada cancelada.'));else resolve(valor);};
  const fallo=()=>terminar(true);
  const datos=b=>{try{for(const c of b){if(c===3)return terminar(true);if(c===13||c===10)return terminar(false);if(c===8||c===127){if(n)bytes[--n]=0;continue;}if(c<32||c>126||n===bytes.length)return terminar(true);bytes[n++]=c;}}finally{if(Buffer.isBuffer(b))b.fill(0);}};
  salida.write(pregunta+' ');entrada.setRawMode(true);entrada.resume();entrada.on('data',datos);entrada.once('error',fallo);
 });
}
module.exports={leerSecreto};
