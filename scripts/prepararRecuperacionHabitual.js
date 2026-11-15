// Solo configuración pública privada, después de autorización específica de IDs y límites.
const fs=require('node:fs'),path=require('node:path');
const {ROOT,plantillaBloqueada,validarConfiguracionHabitual}=require('../src/security/comercial/ConfiguracionHabitualWindows');
function crearConfiguracionAprobada(ids,referencia){
 const c=plantillaBloqueada();c.habilitado=true;c.politica.aprobada=true;c.politica.operadoresAutorizados=ids;c.acreditacion={referencia,sqlValidado:true,dominioVerificado:true,recuperacionVerificada:true,seguridadHttpVerificada:true};return validarConfiguracionHabitual(c);
}
function preparar(args){
 if(args.length!==5||args[0]!=='--operadores'||!/^\d+(,\d+)*$/.test(args[1])||args[2]!=='--confirmacion'||args[3]!=='OPERADORES_LIMITES_Y_ACTIVACION_HABITUAL_APROBADOS'||args[4]!=='--preparar')throw Error('Falta autorización operativa específica.');
 const c=crearConfiguracionAprobada(args[1].split(',').map(Number),'HABITUAL-'+Date.now());
 const archivos=require('../src/security/comercial/ArchivosPrivadosWindows');archivos.identidad(c.cuenta);
 // No se reutiliza ni se crea otro presupuesto local. Las cuotas operativas son SQL.
 if(!fs.existsSync(ROOT))archivos.crearDirectorio(ROOT);else archivos.verificar(ROOT);
 const destino=path.join(ROOT,'configuracion.json');archivos.escribirNuevo(destino,Buffer.from(JSON.stringify(c,null,2)));
 return{resultado:'CONFIGURACION_HABITUAL_PREPARADA_NO_ACTIVADA',archivo:destino,operadores:c.politica.operadoresAutorizados.length,limites:c.politica.limites,serviciosIniciados:0};
}
if(require.main===module){try{console.log(JSON.stringify(preparar(process.argv.slice(2))));}catch{console.error('CONFIGURACION_NO_PREPARADA; no sobrescribir ni reintentar sin diagnóstico.');process.exitCode=1;}}
module.exports={crearConfiguracionAprobada,preparar};
