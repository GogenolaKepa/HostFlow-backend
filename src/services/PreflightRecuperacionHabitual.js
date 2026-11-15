const {isIP}=require('node:net');
const {abrirPoolsComerciales}=require('./PoolsComercialesPreparados');
const {IDENTIDADES}=require('./DependenciasComercialesWindows');
const {normalizarEmail}=require('../security/seguridadUsuarios');
const {validarPoliticaHabitual,correoHabitual}=require('../security/comercial/PoliticaRecuperacionHabitual');
async function comprobarHabitual({runtime,politica,driver=require('mssql'),abrir=abrirPoolsComerciales}={}){
 politica=validarPoliticaHabitual(politica);let conexiones;
 try{
  conexiones=await abrir({habilitado:true,driver,identidades:Object.fromEntries(Object.entries(IDENTIDADES).map(([p,principal])=>[p,{tipo:'sql',principal}])),obtenerCredencial:runtime.lectorSql,timeoutMs:30000});
  const automatica=politica.version===2,consultas=require('./ConsultaElegiblesRecuperacion');
  const req=conexiones.pools.workerIngreso.request();let autorizados=[],numeroElegibles;
  if(automatica){
   const cap=(await req.query(consultas.CAPACIDAD)).recordset?.[0];
   if(cap?.permitido!==1||cap?.modelo!=='authcom-password-local-v1')throw Error('Método password no acreditado.');
   const raw=(await conexiones.pools.workerIngreso.request().query(consultas.CONTEO)).recordset?.[0]?.elegibles;
   numeroElegibles=typeof raw==='number'?raw:typeof raw==='bigint'||typeof raw==='string'&&/^\d+$/.test(raw)?Number(raw):NaN;
   if(!Number.isSafeInteger(numeroElegibles)||numeroElegibles<0)throw Error('Conteo desconocido.');
  }else{
  politica.operadoresAutorizados.forEach((id,i)=>req.input('u'+i,id));
  const resultado=await req.query(`SELECT u.IdUsuario AS idUsuario,u.Email AS email,u.VersionSesion AS versionSesion,c.VersionContacto AS versionContacto,c.VerificadoEn AS verificado
    FROM dbo.Usuarios u JOIN dbo.Roles r ON r.IdRol=u.IdRol JOIN authcom.Contactos c ON c.IdUsuario=u.IdUsuario
    WHERE u.IdUsuario IN (${politica.operadoresAutorizados.map((_,i)=>'@u'+i).join(',')}) AND u.Estado=N'Activo' AND u.DebeCambiarPassword=0
      AND r.Nombre=N'Operador' AND r.Activo=1 AND c.RevocadoEn IS NULL AND c.VerificadoEn IS NOT NULL AND c.VersionContacto>0
      AND c.Email=LOWER(LTRIM(RTRIM(u.Email))) COLLATE Latin1_General_100_BIN2
      AND EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa=1 AND Activo=1);`);
  autorizados=resultado.recordset;
  if(!Array.isArray(autorizados)||autorizados.length!==politica.operadoresAutorizados.length||new Set(autorizados.map(u=>u.idUsuario)).size!==autorizados.length||autorizados.some(u=>!politica.operadoresAutorizados.includes(u.idUsuario)||!Number.isSafeInteger(u.versionSesion)||u.versionSesion<1||!Number.isSafeInteger(u.versionContacto)||u.versionContacto<1||u.verificado==null||!Number.isFinite(new Date(u.verificado).getTime())))throw Error('Operadores autorizados no acreditados.');
  numeroElegibles=autorizados.length;
  }
  const porEmail=new Map(autorizados.map(u=>[normalizarEmail(u.email),u]));if(porEmail.size!==autorizados.length)throw Error('Identidad de destino ambigua.');
  const ingresos=await conexiones.pools.workerIngreso.request().query(`SELECT TOP(201) Id AS id,Sobre AS sobre,CASE WHEN LeaseHasta>SYSUTCDATETIME() THEN 1 ELSE 0 END AS leaseActivo
    FROM authcom.Ingresos WHERE Estado='pendiente' OR Sobre IS NOT NULL;`);
  if(!Array.isArray(ingresos.recordset)||ingresos.recordset.length>200)throw Error('Cola de ingreso requiere revisión.');
  for(const i of ingresos.recordset){if(i.leaseActivo!==0)throw Error('Lease activo; no duplicar worker.');const p=runtime.protectorHabitual.abrir(JSON.parse(i.sobre),i.id);if(!p||Object.keys(p).sort().join('|')!=='email|ip'||!isIP(p.ip))throw Error('Ingreso no acreditado.');normalizarEmail(p.email);}
  const fallos=await conexiones.pools.workerIngreso.request().query("SELECT COUNT_BIG(*) AS total FROM authcom.IngresoFallos WHERE Estado='cuarentena';");
  if(![0,0n,'0'].includes(fallos.recordset?.[0]?.total))throw Error('Cuarentena de ingreso requiere revisión.');
  const salida=await conexiones.pools.correo.request().query(`SELECT TOP(201) o.Id AS id,o.Sobre AS sobre,o.DesafioId AS desafioId,o.EnCuarentena AS cuarentena,o.CodigoFallo AS codigo,
    CASE WHEN o.LeaseHasta>SYSUTCDATETIME() THEN 1 ELSE 0 END AS leaseActivo,d.Proposito AS proposito,d.IdEmpresa AS empresa,d.IdUsuario AS usuarioId,d.Documento AS documento
    FROM authcom.Outbox o LEFT JOIN authcom.Desafios d ON d.Id=o.DesafioId
    WHERE o.Sobre IS NOT NULL OR o.Estado IN('pendiente','procesando','fallida') OR o.EnCuarentena=1;`);
  if(!Array.isArray(salida.recordset)||salida.recordset.length>200)throw Error('Outbox requiere revisión.');
  for(const e of salida.recordset){
   if(e.leaseActivo!==0||![0,false].includes(e.cuarentena)||![null,'TRANSITORIO'].includes(e.codigo))throw Error('Entrega previa requiere revisión.');
   const payload=runtime.protectorHabitual.abrir(JSON.parse(e.sobre),e.id),{email,clase}=correoHabitual(payload);
   let u=porEmail.get(email);
   if(automatica){
    const filas=(await conexiones.pools.workerIngreso.request().input('email',email).query(consultas.POR_EMAIL)).recordset;
    if(!Array.isArray(filas)||filas.length!==1)throw Error('Destino no acreditado.');u=filas[0];
    if(!require('../security/comercial/PoliticaRecuperacionHabitual').usuarioAutorizado(politica,u))throw Error('Método de destino no acreditado.');
   }
   if(!u||clase==='recuperacion'&&(e.empresa!==1||e.proposito!=='recuperacion'||e.usuarioId!==u.idUsuario)||clase==='aviso'&&e.desafioId!==null)throw Error('Entrega ajena al alcance.');
   if(automatica)require('../security/comercial/PoliticaRecuperacionHabitual').validarVinculoCorreo(politica,payload,{...e,documento:e.documento===null?null:JSON.parse(e.documento)}, {...u,emailVerificadoEn:new Date(u.verificado).toISOString()},1);
   else if(clase==='recuperacion'){const d=JSON.parse(e.documento);if(d.versionSesion!==u.versionSesion||d.versionContacto!==u.versionContacto||d.emailVerificadoEn!==new Date(u.verificado).toISOString())throw Error('Entrega de identidad anterior.');}
  }
  return{resultado:'PREFLIGHT_HABITUAL_ACREDITADO',perfiles:4,...(automatica?{cuentasElegibles:numeroElegibles,politica:'PASSWORD_VERIFICADO'}:{operadores:numeroElegibles}),ingresosPendientes:ingresos.recordset.length,outboxPendiente:salida.recordset.length,SQL:'SOLO_SELECT'};
 }finally{await conexiones?.cerrar();}
}
module.exports={comprobarHabitual};
