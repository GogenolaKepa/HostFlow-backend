// Operación manual de recuperación de metadatos tras caída del proceso/PC.
// No borra historial, presupuestos, claves ni colas; no mata procesos.
const fs=require('node:fs'),path=require('node:path');
const {ROOT}=require('../src/security/comercial/ConfiguracionHabitualWindows');
function recuperar({archivos=require('../src/security/comercial/ArchivosPrivadosWindows'),procesos=require('../src/security/comercial/ProcesoTunnelWindows'),disco=fs}={}){
 archivos.identidad('PC-ESCRITORIO\\Kepa');archivos.verificar(ROOT);procesos.comprobarSinServicios();
 const lock=path.join(ROOT,'sesion-activa.json');if(!disco.existsSync(lock))return{resultado:'SIN_CANDADO_PENDIENTE',modificado:false};
 const b=archivos.leer(lock),s=JSON.parse(b.toString('utf8'));
 if(Object.keys(s).sort().join('|')!=='fechaUTC|pid|referencia|version'||s.version!==1||!/^HABITUAL-\d{13}-[a-f0-9-]{36}$/.test(s.referencia)||!Number.isFinite(Date.parse(s.fechaUTC))||procesos.pidActivo(s.pid)!==false)throw Error('Cierre anterior no acreditado.');
 const evidencia=path.join(ROOT,'cierre-pendiente.'+s.referencia+'.json');archivos.escribirNuevo(evidencia,b);
 if(!archivos.leer(lock).equals(b))throw Error('El candado cambió; conservar todo.');
 disco.unlinkSync(lock);return{resultado:'CIERRE_ANTERIOR_ARCHIVADO',modificado:true,evidencia};
}
if(require.main===module){try{if(process.argv.slice(2).join('|')!=='--confirmacion|CIERRE_ANTERIOR_VERIFICADO')throw Error();console.log(JSON.stringify(recuperar()));}catch{console.error('CIERRE_ANTERIOR_NO_ACREDITADO; no eliminar archivos ni forzar procesos.');process.exitCode=1;}}
module.exports={recuperar};
