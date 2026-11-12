// Opt-in exclusivo del fixture autenticado. NO modifica SQL ni inicia workers.
const fs=require('node:fs');
const {abrirPoolsComerciales}=require('./PoolsComercialesPreparados');
const {PERFILES}=require('../security/comercial/CustodiaNode');
const {crearProtectorCorreo,hashToken}=require('../security/comercial/credencialesTemporales');
const F=Object.freeze({desafio:'c1dd6cbd-977c-4e8a-8c41-c81480c9a2d7',outbox:'42540292-269f-4d6d-94c5-ff0f543d258b',email:'hostflowtesting@gmail.com',keyId:'hostflow-authcom-node-v1'});
const presupuestoEsperado=String.raw`C:\Users\Kepa\AppData\Local\HostFlow\NodePilotoV1\presupuesto-piloto-recuperacion-v1`;
const C={
 ingresos:"SELECT COUNT_BIG(*) AS pendientes FROM authcom.Ingresos WHERE Estado='pendiente' OR Sobre IS NOT NULL OR LeaseHasta>SYSUTCDATETIME();",
 fallos:'SELECT COUNT_BIG(*) AS pendientes FROM authcom.IngresoFallos;',
 desafios:"SELECT COUNT_BIG(*) AS pendientes FROM authcom.Desafios WHERE ConsumidaEn IS NULL AND RevocadaEn IS NULL AND ExpiraEn>SYSUTCDATETIME() AND Id<>@desafio;",
 outbox:"SELECT COUNT_BIG(*) AS pendientes FROM authcom.Outbox WHERE (Sobre IS NOT NULL OR Estado IN ('pendiente','procesando','fallida') OR EnCuarentena=1 OR LeaseHasta>SYSUTCDATETIME()) AND Id<>@outbox;",
 admin:`SELECT CASE WHEN d.IdEmpresa=1 AND d.Proposito='invitacion' AND d.Email=@email AND d.Pendiente=1
  AND d.ConsumidaEn IS NULL AND d.RevocadaEn IS NULL AND d.CreadaEn<=SYSUTCDATETIME() AND d.ExpiraEn>SYSUTCDATETIME()
  AND u.Estado='Activo' AND u.DebeCambiarPassword=0 AND r.Nombre='Administrador' AND r.Activo=1 AND e.Activo=1
  AND u.VersionSesion=TRY_CONVERT(int,JSON_VALUE(d.Documento,'$.versionInvitador'))
  AND JSON_VALUE(d.Documento,'$.rol')='Operador'
  AND NOT EXISTS(SELECT 1 FROM dbo.Usuarios WHERE EmailNormalizado=@email)
  THEN 1 ELSE 0 END AS valido
  FROM authcom.Desafios d LEFT JOIN dbo.Usuarios u ON u.IdUsuario=d.IdInvitador
  LEFT JOIN dbo.Roles r ON r.IdRol=u.IdRol LEFT JOIN dbo.Empresas e ON e.IdEmpresa=d.IdEmpresa WHERE d.Id=@desafio;`,
 entrega:`SELECT o.Id,o.DesafioId,o.Estado,o.Intentos,o.EnCuarentena,o.CodigoFallo,o.Sobre,d.Hash,
  CASE WHEN o.ExpiraEn>SYSUTCDATETIME() AND o.Proxima<=SYSUTCDATETIME() AND o.PrimerIntentoEn>DATEADD(hour,-23,SYSUTCDATETIME())
   AND o.Lease IS NULL AND o.LeaseHasta IS NULL AND d.Pendiente=1 AND d.ConsumidaEn IS NULL AND d.RevocadaEn IS NULL
   AND d.ExpiraEn>SYSUTCDATETIME() AND d.IdEmpresa=1 AND d.Proposito='invitacion' AND d.Email=@email
  THEN 1 ELSE 0 END AS vigente FROM authcom.Outbox o JOIN authcom.Desafios d ON d.Id=o.DesafioId WHERE o.Id=@outbox AND d.Id=@desafio;`,
};
const fallo=()=>Error('Reanudación del fixture no acreditada; no iniciar.');
function validarEntrega(f,protector){
 if(!f||typeof f.Id!=='string'||f.Id.toLowerCase()!==F.outbox||typeof f.DesafioId!=='string'||f.DesafioId.toLowerCase()!==F.desafio||
  f.Estado!=='pendiente'||f.Intentos!==1||f.EnCuarentena!==false||f.CodigoFallo!==null||f.vigente!==1||typeof f.Sobre!=='string')throw fallo();
 const sobre=JSON.parse(f.Sobre);if(sobre.keyId!==F.keyId)throw fallo();
 const p=protector.abrir(sobre,f.Id);
 if(p?.destinatario!==F.email||p.plantilla!=='invitacion')throw fallo();
 const url=new URL(p.enlace);if(url.origin!=='https://hostflow.com.ar'||url.pathname!=='/cuenta/invitacion'||url.search||url.username||url.password||!/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash))throw fallo();
 const hash=hashToken(url.hash.slice(7),'invitacion');
 if(!hash||!Buffer.isBuffer(f.Hash)||f.Hash.length!==32)throw fallo();
 const esperado=Buffer.from(hash,'hex'),coincide=require('node:crypto').timingSafeEqual(f.Hash,esperado);esperado.fill(0);if(!coincide)throw fallo();
 return true;
}
async function comprobarReanudacion(runtime,{presupuesto,archivos,driver=require('mssql'),abrir=abrirPoolsComerciales,sistemaArchivos=fs}={}){
 let pools,protector;
 try{
  if(presupuesto!==presupuestoEsperado||runtime.keyId!==F.keyId)throw fallo();
  archivos.verificar(presupuesto);
  // Cualquier reserva o parcial impide volver a enviar por este modo.
  if(sistemaArchivos.readdirSync(presupuesto).length!==0)throw fallo();
  pools=await abrir({habilitado:true,driver,identidades:Object.fromEntries(Object.entries(PERFILES).map(([p,principal])=>[p,{tipo:'sql',principal}])),obtenerCredencial:runtime.lectorSql,timeoutMs:30000});
  const q=async(perfil,sql)=>{const r=pools.pools[perfil].request();r.input('desafio',F.desafio);r.input('outbox',F.outbox);r.input('email',F.email);return(await r.query(sql)).recordset;};
  for(const [perfil,sql]of [['workerIngreso',C.ingresos],['workerIngreso',C.fallos],['cuentas',C.desafios],['correo',C.outbox]]){
   const r=await q(perfil,sql);if(r.length!==1||![0,0n,'0'].includes(r[0].pendientes))throw fallo();
  }
  const admin=await q('cuentas',C.admin);if(admin.length!==1||admin[0].valido!==1)throw fallo();
  // La auditoría única ya fue validada por la reparación administrativa
  // transaccional acreditada. SQL17 permite INSERT, no SELECT de Auditoria:
  // conservar esa evidencia; no ampliar privilegios ni repetirla aquí.
  const filas=await q('correo',C.entrega);if(filas.length!==1)throw fallo();
  protector=crearProtectorCorreo({clave:runtime.claves.cifrado,keyId:runtime.keyId});validarEntrega(filas[0],protector);
  return{perfiles:4,reanudacionFixtureVerificada:true,desafioId:F.desafio,outboxId:F.outbox};
 }catch(e){const error=fallo();if(['CIERRE_INCOMPLETO','CIERRE_NO_ACREDITADO'].includes(e?.codigo))error.codigo='CIERRE_NO_ACREDITADO';throw error;}
 finally{protector?.liberar();try{await pools?.cerrar();}catch{const e=fallo();e.codigo='CIERRE_NO_ACREDITADO';throw e;}}
}
module.exports={comprobarReanudacion,validarEntrega,F,C,presupuestoEsperado};
