const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const base=require('./sqlAislado');
const {guardas,propuesta,marcar}=require('./sqlComercialAislado');
async function laboratorioSqlcmd(fn,{soloModeloInicial=false}={}){
  base.exigirEscritura({HOSTFLOW_SQL_TEST_ENABLED:'1',HOSTFLOW_SQL_TEST_WRITE_APPROVED:process.env.HOSTFLOW_SQL_TEST_WRITE_APPROVED});
  const runId=randomUUID(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'hf-authcom-resiliencia-'));let validado=false;
  async function ejecutar(sql){
    const archivo=path.join(temp,randomUUID()+'.sql');fs.writeFileSync(archivo,guardas(runId)+sql,'utf8');
    try{return await new Promise((resolve,reject)=>{
      const p=spawn('C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/180/Tools/Binn/SQLCMD.EXE',['-S','lpc:localhost','-E','-C','-d',base.BASE,'-b','-l','3','-t','30','-f','65001','-i',archivo],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      let salida='';p.stdout.on('data',b=>{salida+=String(b);});p.stderr.resume();
      p.once('error',()=>reject(Error('SQLCMD no disponible.')));p.once('exit',codigo=>codigo===0?resolve(salida):reject(Object.assign(Error('Falló SQL local; sin SQL ni detalles sensibles.'),{codigosSQL:[...salida.matchAll(/Msg (\d+)/g)].map(m=>Number(m[1]))})));
    });}finally{fs.rmSync(archivo,{force:true});}
  }
  try{
    await ejecutar("IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0) OR SCHEMA_ID(N'authcom') IS NOT NULL THROW 51885,'Base no vacía.',1;");validado=true;
    await ejecutar(base.fixtureRoles(runId));await ejecutar(base.migracionParaPruebas(base.BASE,runId));
    await ejecutar(`SET XACT_ABORT ON;BEGIN TRANSACTION;CREATE TABLE dbo.Empresas(IdEmpresa int IDENTITY PRIMARY KEY,Activo bit NOT NULL DEFAULT 1);${marcar('dbo.Empresas',runId)} INSERT dbo.Empresas DEFAULT VALUES;COMMIT;`);
    const etapas=soloModeloInicial?['01_modelo_bloqueado.sql']:['01_modelo_bloqueado.sql','04_ingreso_bloqueado.sql','06_ventana_correo_bloqueada.sql','08_resiliencia_bloqueada.sql'];
    for(const n of etapas){
      try{await ejecutar(propuesta(n,runId));}catch(e){e.fase=n;throw e;}
    }
    return await fn({ejecutar,runId,propuesta:n=>propuesta(n,runId)});
  }finally{
    if(validado){
      const orden=['authcom.Outbox','authcom.Auditoria','authcom.Desafios','authcom.Contactos','authcom.Cuotas','authcom.IngresoFallos','authcom.Ingresos','dbo.Empresas','dbo.Usuarios','dbo.Roles'];
      await ejecutar(`SET XACT_ABORT ON;BEGIN TRY BEGIN TRANSACTION;${orden.map(n=>`IF OBJECT_ID(N'${n}',N'U') IS NOT NULL DROP TABLE ${n};`).join('\n')} IF SCHEMA_ID(N'authcom') IS NOT NULL EXEC(N'DROP SCHEMA authcom;');COMMIT;END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;`);
      await ejecutar("IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0) OR SCHEMA_ID(N'authcom') IS NOT NULL THROW 51890,'Limpieza no acreditada.',1;");
    }
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('hf-authcom-resiliencia-'))throw Error('Temporal inválido.');
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
module.exports={laboratorioSqlcmd};
