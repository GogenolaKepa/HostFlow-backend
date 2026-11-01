// No importa database.js/.env. Solo abre conexiones mediante activación explícita.
const PERFILES=Object.freeze(['ingresoHttp','workerIngreso','cuentas','correo']);
const PROHIBIDOS=new Set(['dbo','sa','guest','public','hostflowadmin','hostflow_app','hostflow_authcom_owner']);
class ErrorPoolsComerciales extends Error {
  constructor(codigo){super('No se pudo acreditar el runtime SQL comercial.');this.codigo=codigo;}
}
async function abrirPoolsComerciales({habilitado=false,driver,identidades,obtenerCredencial,timeoutMs=10000}={}){
  if(habilitado!==true)return Object.freeze({estado:'inactivo'});
  if(typeof driver?.ConnectionPool!=='function'||typeof obtenerCredencial!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw new ErrorPoolsComerciales('CONFIGURACION_INVALIDA');
  const nombres=new Set(),perfiles={};
  for(const perfil of PERFILES){const i=identidades?.[perfil];
    if(!i||!['sql','entra'].includes(i.tipo)||typeof i.principal!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{2,79}$/.test(i.principal)||PROHIBIDOS.has(i.principal.toLowerCase())||nombres.has(i.principal.toLowerCase()))throw new ErrorPoolsComerciales('IDENTIDAD_INVALIDA');
    nombres.add(i.principal.toLowerCase());
    perfiles[perfil]=Object.freeze({tipo:i.tipo,principal:i.principal});
  }
  const abiertos=[],pools={};let cerrando;
  function cerrar(){return cerrando??=(async()=>{
    const r=await Promise.allSettled(abiertos.map(p=>p.close()));
    if(r.some(x=>x.status==='rejected'))throw new ErrorPoolsComerciales('CIERRE_INCOMPLETO');
  })();}
  try{
    for(const perfil of PERFILES){
      const i=perfiles[perfil],controller=new AbortController();let timer,credencial;
      try{
        credencial=await Promise.race([
          Promise.resolve().then(()=>obtenerCredencial({perfil,principal:i.principal,tipo:i.tipo,signal:controller.signal})),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ErrorPoolsComerciales('CREDENCIAL_NO_DISPONIBLE'));},timeoutMs);}),
        ]);
      }finally{clearTimeout(timer);}
      const config={server:'hostflow.database.windows.net',database:'HostFlow',port:1433,
        options:{encrypt:true,trustServerCertificate:false,enableArithAbort:true},
        pool:{min:0,max:2,idleTimeoutMillis:30000},connectionTimeout:timeoutMs,requestTimeout:30000};
      if(i.tipo==='sql'){
        if(credencial?.user!==i.principal||typeof credencial.password!=='string'||!credencial.password||credencial.password.length>256)throw new ErrorPoolsComerciales('CREDENCIAL_NO_DISPONIBLE');
        config.user=credencial.user;config.password=credencial.password;
      }else{
        if(typeof credencial?.token!=='string'||!credencial.token||/[\r\n\s]/.test(credencial.token)||!Number.isFinite(credencial.expiraEn)||credencial.expiraEn<Date.now()+60000)throw new ErrorPoolsComerciales('CREDENCIAL_NO_DISPONIBLE');
        config.authentication={type:'azure-active-directory-access-token',options:{token:credencial.token}};
      }
      credencial=undefined;
      const p=new driver.ConnectionPool(config);abiertos.push(p);
      // Nunca registrar objetos de conexión o errores del driver con credenciales.
      p.on('error',()=>{});await p.connect();
      const r=await p.request().query("SELECT DB_NAME() AS base,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS servidor,CONVERT(int,SERVERPROPERTY('EngineEdition')) AS motor,USER_NAME() AS principal;");
      const id=r.recordset[0];
      if(id?.base!=='HostFlow'||id.servidor!=='hostflow'||id.motor!==5||id.principal!==i.principal)throw new ErrorPoolsComerciales('IDENTIDAD_NO_ACREDITADA');
      pools[perfil]=p;
    }
    return Object.freeze({estado:'preparados',pools:Object.freeze(pools),cerrar,
      consultar:()=>Object.freeze({estado:cerrando?'cerrado-o-cerrando':'preparado',pools:PERFILES.map(perfil=>({perfil,conectado:!!pools[perfil].connected}))})});
  }catch(error){
    try{await cerrar();}catch{throw new ErrorPoolsComerciales('CIERRE_INCOMPLETO');}
    throw new ErrorPoolsComerciales(error instanceof ErrorPoolsComerciales?error.codigo:'SQL_NO_DISPONIBLE');
  }
}
module.exports={abrirPoolsComerciales,PERFILES,ErrorPoolsComerciales};
