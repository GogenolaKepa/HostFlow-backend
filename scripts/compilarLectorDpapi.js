// Compila solo el auxiliar propio con csc instalado. No instala ni cambia políticas.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
function compilar({salida,raiz=path.resolve(__dirname,'../..')}={}){
 if(process.platform!=='win32'||typeof salida!=='string'||!path.isAbsolute(salida)||!salida.toLowerCase().endsWith('.exe'))throw Error('Salida Windows no acreditada.');
 const revision=path.join(raiz,'revision')+path.sep,destino=path.resolve(salida);
 if(!destino.toLowerCase().startsWith(revision.toLowerCase())||!fs.existsSync(path.dirname(destino))||fs.existsSync(destino))throw Error('Salida debe ser nueva dentro de revision.');
 const fuente=path.join(__dirname,'native/LectorDpapi.cs');
 const csc=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 if(!fs.existsSync(csc))throw Error('Compilador existente no disponible; no instalar automáticamente.');
 const r=spawnSync(csc,['/nologo','/target:exe','/platform:anycpu','/optimize+','/reference:System.Security.dll','/reference:System.Xml.dll','/reference:System.Web.Extensions.dll','/out:'+destino,fuente],{windowsHide:true,encoding:'utf8'});
 if(r.error||r.status!==0)throw Error('Compilación no acreditada; no eludir bloqueos del sistema.');
 return {ejecutable:destino,sha256:crypto.createHash('sha256').update(fs.readFileSync(destino)).digest('hex'),fuenteSha256:crypto.createHash('sha256').update(fs.readFileSync(fuente)).digest('hex')};
}
if(require.main===module){try{if(process.argv.length!==4||process.argv[2]!=='--salida')throw Error();console.log(JSON.stringify(compilar({salida:process.argv[3]})));}catch{console.error('Compilación DPAPI detenida. Sin cambios de políticas o dependencias.');process.exitCode=1;}}
module.exports={compilar};
