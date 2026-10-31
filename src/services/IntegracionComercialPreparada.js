const {AutenticacionComercialSql}=require('../repositories/AutenticacionComercialSql');
const {IngresoComercialSql}=require('../repositories/IngresoComercialSql');
const {AutenticacionComercialService}=require('./AutenticacionComercialService');
const {IngresoRecuperacionService}=require('./IngresoRecuperacionService');
const {EntregaCorreoSeguridad}=require('../security/comercial/EntregaCorreoSeguridad');
const {crearRouterCuentasComerciales}=require('../routes/cuentasComercialesAisladas');
const {crearAnilloClavesCorreo}=require('../security/comercial/AnilloClavesCorreo');
const {crearIndicePrivado}=require('../security/comercial/credencialesTemporales');
const {ResendCorreo}=require('../security/comercial/ResendCorreo');
const {SupervisorComercial}=require('./SupervisorComercial');

// Factoría de composición SIN IMPORTAR desde app/server operativos. No abre pools,
// no lee .env y no monta rutas ni inicia timers. Un flag de Vite nunca la habilita.
async function prepararIntegracionComercial({habilitado=false,sql,pools,claves,correo,autenticar,acreditacion}={}) {
  if(habilitado!==true)return Object.freeze({estado:'inactiva'});
  if(!acreditacion?.referencia || !['sqlValidado','dominioVerificado','recuperacionVerificada','seguridadHttpVerificada'].every(k=>acreditacion[k]===true))throw Error('Falta acreditación de infraestructura.');
  if(typeof autenticar!=='function'||!sql||!pools||!correo)throw TypeError('Faltan dependencias explícitas.');
  const protector=crearAnilloClavesCorreo(claves?.cifrado);
  const indicePrivado=crearIndicePrivado(claves?.indice);
  if(claves.cifrado.claves.some(v=>v.clave.equals(claves.indice)))throw TypeError('Cifrado y HMAC requieren claves independientes.');
  const repos={};
  const permisos={
    cuentas:[['authcom.Contactos','SELECT'],['authcom.Contactos','INSERT'],['authcom.Desafios','SELECT'],['authcom.Desafios','INSERT'],['authcom.Desafios','UPDATE'],['authcom.Outbox','INSERT'],['authcom.Auditoria','INSERT'],['dbo.Usuarios','INSERT']],
    ingresoHttp:[['authcom.Ingresos','INSERT']],
    workerIngreso:[['authcom.Ingresos','SELECT'],['authcom.Ingresos','UPDATE'],['authcom.Desafios','SELECT'],['authcom.Desafios','INSERT'],['authcom.Desafios','UPDATE'],['authcom.Contactos','SELECT'],['authcom.Outbox','INSERT'],['authcom.Auditoria','INSERT']],
    correo:[['authcom.Outbox','SELECT'],['authcom.Outbox','UPDATE'],['authcom.Desafios','SELECT']],
  };
  for(const perfil of Object.keys(permisos)) {
    if(!pools[perfil])throw TypeError('Falta pool de un perfil comercial.');
    const base=new AutenticacionComercialSql({...sql,pool:pools[perfil],habilitado:true,perfil:perfil==='ingresoHttp'?'ingreso-http':perfil==='workerIngreso'?'worker-ingreso':'cuentas'});
    // Verificación real de marcas y permisos efectivos antes de entregar el router.
    await base.transaccion(async tx=>{
      for(const [nombre,valor] of [['HostFlowAuthIngreso','authcom-ingreso-v1'],['HostFlowAuthCorreo','authcom-correo-v1'],['HostFlowAuthResiliencia','authcom-resiliencia-v1']]) {
        const r=await tx.q('SELECT CONVERT(nvarchar(80),value) AS modelo FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N\'authcom\') AND name=@nombre;',{nombre});
        if(r.recordset[0]?.modelo!==valor)throw Error('Modelo comercial no acreditado.');
      }
      const requeridos=[...permisos[perfil],...['SELECT','INSERT','UPDATE'].map(p=>['authcom.Cuotas',p])];
      if(perfil==='workerIngreso')requeridos.push(...['SELECT','INSERT','UPDATE'].map(p=>['authcom.IngresoFallos',p]));
      for(const [objeto,permiso] of requeridos){const r=await tx.q("SELECT HAS_PERMS_BY_NAME(@objeto,'OBJECT',@permiso) AS permitido;",{objeto,permiso});if(r.recordset[0]?.permitido!==1)throw Error('Permisos comerciales insuficientes.');}
      if(perfil==='cuentas'||perfil==='workerIngreso'){
        // Aceptar GRANT de columnas mínimas, sin exigir SELECT sobre toda la tabla.
        // EmailNormalizado también se usa al buscar por email, no solo al leer por ID.
        const columnas={
          'dbo.Usuarios':['IdUsuario','Nombre','Email','EmailNormalizado','IdRol','Estado','DebeCambiarPassword','VersionSesion','VersionRegistro',...(perfil==='cuentas'?['PasswordHash']:[])],
          'dbo.Roles':['IdRol','Nombre','Activo'],
          'dbo.Empresas':['IdEmpresa','Activo'],
        };
        for(const [objeto,nombres] of Object.entries(columnas))for(const columna of nombres){
          const r=await tx.q("SELECT HAS_PERMS_BY_NAME(@objeto,'OBJECT',@permiso,@columna,'COLUMN') AS permitido;",{objeto,permiso:'SELECT',columna});
          if(r.recordset[0]?.permitido!==1)throw Error('Permiso de lectura de columna insuficiente.');
        }
      }
      // No aceptar por accidente cuatro pools del mismo principal sobredimensionado.
      for(const rol of ['db_owner','db_datawriter','db_ddladmin','db_securityadmin']){
        const r=await tx.q('SELECT IS_ROLEMEMBER(@rol) AS excesivo;',{rol});if(r.recordset[0]?.excesivo!==0)throw Error('Perfil comercial con privilegios excesivos o no acreditados.');
      }
      if(perfil!=='cuentas'){
        const insercion=await tx.q("SELECT HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','INSERT') AS excesivo;");
        if(insercion.recordset[0]?.excesivo!==0)throw Error('Worker/ingreso no debe crear usuarios.');
        for(const permiso of ['SELECT','UPDATE']){
          const r=await tx.q("SELECT HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT',@permiso,N'PasswordHash','COLUMN') AS excesivo;",{permiso});
          if(r.recordset[0]?.excesivo!==0)throw Error('Worker/ingreso no debe leer ni modificar credenciales.');
        }
      }
      if(perfil==='cuentas'){
        for(const columna of ['IdRol','Estado']){
          const r=await tx.q("SELECT HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','UPDATE',@columna,'COLUMN') AS excesivo;",{columna});
          if(r.recordset[0]?.excesivo!==0)throw Error('Cuentas comerciales no debe alterar roles/estado.');
        }
        for(const columna of ['PasswordHash','DebeCambiarPassword','VersionSesion','FechaCambioPassword','FechaActualizacion','IdUsuarioActualizacion']){
          const r=await tx.q("SELECT HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','UPDATE',@columna,'COLUMN') AS permitido;",{columna});
          if(r.recordset[0]?.permitido!==1)throw Error('Permiso de columna insuficiente.');
        }
        // SELECT por columnas: no exigir privilegios sobre campos ajenos al contrato.
        await tx.usuario(-1);if(!await tx.empresaActiva(sql.idEmpresa))throw Error('Empresa no habilitada.');
      }
      if(perfil==='workerIngreso'){await tx.usuario(-1);if(!await tx.empresaActiva(sql.idEmpresa))throw Error('Empresa no habilitada.');}
    });
    repos[perfil]=new IngresoComercialSql({repository:base,habilitado:true});
  }
  const proveedor=new ResendCorreo({...correo,habilitado:true});
  const opciones={protector,indicePrivado,idEmpresa:sql.idEmpresa,origen:correo.origen};
  const cuentas=new AutenticacionComercialService({...opciones,repository:repos.cuentas});
  const trabajadorCuentas=new AutenticacionComercialService({...opciones,repository:repos.workerIngreso});
  const ingreso=new IngresoRecuperacionService({repository:repos.ingresoHttp,protector,indicePrivado,cuentas:trabajadorCuentas});
  const workerIngreso=new IngresoRecuperacionService({repository:repos.workerIngreso,protector,indicePrivado,cuentas:trabajadorCuentas});
  const workerCorreo=new EntregaCorreoSeguridad({repository:repos.correo,protector,proveedor,limiteDiario:correo.limiteDiario});
  let activa=true,ocupado=false,pausado=false,enCurso=Promise.resolve();
  const router=crearRouterCuentasComerciales({cuentas,ingreso,autenticar});
  // Middleware exterior obligatorio: desactivar cierra estas rutas, nunca el login JWT.
  const handler=(req,res,next)=>activa?router(req,res,next):res.status(503).set('Cache-Control','no-store').json({codigo:'CUENTAS_INACTIVAS'});
  async function procesarUna(){
      if(!activa||pausado)return {estado:'pausada'};
      if(ocupado)return {estado:'ocupada'};
      ocupado=true;
      let terminar;enCurso=new Promise(resolve=>{terminar=resolve;});
      try{
        const ingreso=await workerIngreso.procesarUna();
        if(ingreso.estado==='resultado-incierto'){activa=false;pausado=true;}
        if(!activa)return {ingreso,correo:{estado:'pausada'}};
        const correo=await workerCorreo.procesarUna();
        if(['resultado-incierto','pausada-configuracion'].includes(correo.estado)){pausado=true;activa=false;}
        return {ingreso,correo};
      }
      catch{pausado=true;activa=false;return {estado:'pausada-por-error'};} // También cierra HTTP: no acumular nuevas solicitudes con el worker bloqueado.
      finally{ocupado=false;terminar();}
  }
  const supervisor=new SupervisorComercial({procesar:procesarUna});
  return Object.freeze({estado:'preparada',handler,procesarUna,
    desactivar(){activa=false;pausado=true;},
    iniciarWorker(){if(!activa)throw Error('Montaje inactivo.');return supervisor.iniciar().finally(()=>{if(supervisor.consultar().estado==='pausado'){activa=false;pausado=true;}});},
    async cerrar(){activa=false;pausado=true;await supervisor.detener();await enCurso;},
    consultarWorker:()=>supervisor.consultar(),
  });
}
module.exports={prepararIntegracionComercial};
