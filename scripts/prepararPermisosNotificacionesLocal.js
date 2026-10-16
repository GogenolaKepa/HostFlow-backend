// OFFLINE. Solo fs/path/crypto y matriz pura: no drivers, .env ni ejecucion SQL.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'sql/proposals/notificaciones_permisos_local');
const esquema='HF_Notificaciones_PermisosV2',usuario='HF_Notificaciones_PruebaV2';
const marca='hostflow-notifications-permissions-v1';
const tablas=['Usuarios','Empresas','Notificaciones','NotificacionDestinatarios','PreferenciasNotificacionUsuario','PoliticasNotificacionEmpresa'];
const nuevas=[
 ['PreferenciasNotificacionUsuario','','SELECT'],['PreferenciasNotificacionUsuario','','INSERT'],
 ['PreferenciasNotificacionUsuario','Habilitada','UPDATE'],['PreferenciasNotificacionUsuario','FechaActualizacion','UPDATE'],
 ['Notificaciones','','SELECT'],['NotificacionDestinatarios','','SELECT'],['NotificacionDestinatarios','FechaLectura','UPDATE'],
].map(([tabla,columna,permiso])=>({esquema:'dbo',tabla,columna,permiso}));
const sha=s=>createHash('sha256').update(s).digest('hex');
const literal=s=>`N'${s.replaceAll("'","''")}'`;
function generar(){
 const origenDDL=fs.readFileSync(path.join(root,'sql/proposals/notificaciones/01_modelo_bloqueado.sql'),'utf8');
 const primer=origenDDL.indexOf(' CREATE TABLE dbo.Notificaciones ('),ultimo=origenDDL.indexOf(' COMMIT TRANSACTION;');
 if(primer<0||ultimo<primer)throw Error('DDL no reconocido: revisar manualmente.');
 const cuerpo=origenDDL.slice(primer,ultimo),clonado=cuerpo.replaceAll('dbo.',`${esquema}.`).replaceAll("@level0name=N'dbo'",`@level0name=N'${esquema}'`);
 const originalGuardas=fs.readFileSync(path.join(root,'sql/proposals/notificaciones_local/guardas_locales.sql'),'utf8');
 const corte=originalGuardas.indexOf('IF EXISTS(SELECT 1 FROM sys.tables');
 if(corte<0)throw Error('Guardas no reconocidas.');
 const guardas=originalGuardas.slice(0,corte)+`
-- Los seis objetos dbo existentes solo se inspeccionan, nunca reciben DML.
IF (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0 AND SCHEMA_NAME(schema_id)=N'dbo')<>6
 OR EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0 AND
 (SCHEMA_NAME(schema_id) NOT IN(N'dbo',N'${esquema}') OR name NOT IN(${tablas.map(literal).join(',')})))
 OR EXISTS(SELECT 1 FROM sys.synonyms)
 OR EXISTS(SELECT 1 FROM sys.objects WHERE is_ms_shipped=0 AND type IN('V','P','PC','FN','IF','TF','FS','FT','TR','TA','SQ'))
 THROW 52000,'Inventario local ajeno al fixture: detenerse sin limpiar.',1;
IF (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0 AND name=N'HostFlowFixture'
 AND major_id IN(OBJECT_ID(N'dbo.Usuarios'),OBJECT_ID(N'dbo.Empresas'))
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'notifications-v2-parent'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'notifications-v2-parent'))<>2
 OR (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0 AND name=N'HostFlowNotificacionesModelo'
 AND major_id IN(${tablas.slice(2).map(t=>`OBJECT_ID(N'dbo.${t}')`).join(',')})
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-notificaciones-v2'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'hostflow-notificaciones-v2'))<>4
 THROW 52001,'Marcas originales de aislamiento/modelo no acreditadas.',1;
`;
 const marcar=(tipo,nombre)=>`EXEC sys.sp_addextendedproperty @name=N'HostFlowPermisosPrueba',@value=N'${marca}',@level0type=N'${tipo}',@level0name=N'${nombre}';`;
 const grants=nuevas.map(r=>`GRANT ${r.permiso} ON OBJECT::[${esquema}].[${r.tabla}]${r.columna?` ([${r.columna}])`:''} TO [${usuario}];`).join('\n');
 const preparacion=`-- NO EJECUTADO. Requiere autorizacion local de ESQUEMA, USER SIN LOGIN y siete GRANT.
-- No crea una base, no toca dbo, no concede derechos a hostflow_app.
DECLARE @PrepararPerfil bit=0;
IF ISNULL(@PrepararPerfil,0)<>1 THROW 52002,'Preparacion local no autorizada.',1;
${guardas}
IF SCHEMA_ID(N'${esquema}') IS NOT NULL OR DATABASE_PRINCIPAL_ID(N'${usuario}') IS NOT NULL
 THROW 52003,'Esquema/identidad preexistentes: no adoptar ni reemplazar.',1;
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 EXEC(N'CREATE SCHEMA [${esquema}] AUTHORIZATION [dbo];');
 CREATE USER [${usuario}] WITHOUT LOGIN WITH DEFAULT_SCHEMA=[${esquema}];
 CREATE TABLE [${esquema}].Usuarios(IdUsuario int NOT NULL PRIMARY KEY);
 CREATE TABLE [${esquema}].Empresas(IdEmpresa int NOT NULL PRIMARY KEY);
${clonado}
 ${marcar('SCHEMA',esquema)}
 ${marcar('USER',usuario)}
${grants}
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
SELECT N'Perfil ficticio sin login preparado; seis tablas propias vacias. No ejecutar nuevamente.' AS Resultado;
`;
 const esperadas=nuevas.map(r=>`(N'${r.tabla}',N'${r.columna}',N'${r.permiso}')`).join(',\n');
 const acreditar=`
DECLARE @Principal int=DATABASE_PRINCIPAL_ID(N'${usuario}');
IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE principal_id=@Principal AND type='S' AND authentication_type=0)
 OR (SELECT COUNT(*) FROM sys.extended_properties WHERE class IN(3,4) AND minor_id=0 AND name=N'HostFlowPermisosPrueba'
 AND ((class=3 AND major_id=SCHEMA_ID(N'${esquema}')) OR (class=4 AND major_id=@Principal))
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'${marca}'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'${marca}'))<>2
 OR NOT EXISTS(SELECT 1 FROM sys.schemas WHERE schema_id=SCHEMA_ID(N'${esquema}') AND principal_id=DATABASE_PRINCIPAL_ID(N'dbo'))
 OR EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=@Principal)
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=@Principal)
 OR EXISTS(SELECT 1 FROM sys.database_role_members WHERE member_principal_id IN(@Principal,DATABASE_PRINCIPAL_ID(N'public')))
 OR (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0 AND schema_id=SCHEMA_ID(N'${esquema}'))<>6
 THROW 52004,'Perfil ficticio, propiedad o marcas no acreditados.',1;
-- No aceptar herencia inesperada por public (incluida impersonacion de usuarios).
-- Se toleran solo los derechos public normales de metadatos de base/sistema.
IF EXISTS(SELECT 1 FROM sys.database_permissions WHERE grantee_principal_id=DATABASE_PRINCIPAL_ID(N'public') AND state IN('G','W')
 AND (state='W' OR (class=0 AND permission_name NOT IN(N'CONNECT',N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION',N'VIEW ANY COLUMN MASTER KEY DEFINITION'))
 OR (class=1 AND ISNULL(OBJECT_SCHEMA_NAME(major_id),N'') NOT IN(N'sys',N'INFORMATION_SCHEMA')) OR class NOT IN(0,1)))
 THROW 52019,'Herencia public inesperada: revisar sin modificar permisos.',1;
DECLARE @Diferencias int;
;WITH Esperadas(Tabla,Columna,Permiso) AS (SELECT * FROM (VALUES ${esperadas}) v(Tabla,Columna,Permiso)),
 Actuales AS (SELECT p.*,OBJECT_SCHEMA_NAME(p.major_id) AS Esquema,OBJECT_NAME(p.major_id) AS Tabla,
 CASE WHEN p.minor_id=0 THEN N'' ELSE COL_NAME(p.major_id,p.minor_id) END AS Columna
 FROM sys.database_permissions p WHERE grantee_principal_id=@Principal
 AND NOT (p.class=0 AND p.major_id=0 AND p.minor_id=0
  AND p.permission_name COLLATE Latin1_General_100_BIN2=N'CONNECT' AND p.state='G'))
SELECT @Diferencias=COUNT(*) FROM Esperadas e FULL JOIN Actuales a ON a.class=1
 AND a.Esquema COLLATE Latin1_General_100_BIN2=N'${esquema}'
 AND a.Tabla COLLATE Latin1_General_100_BIN2=e.Tabla COLLATE Latin1_General_100_BIN2
 AND a.Columna COLLATE Latin1_General_100_BIN2=e.Columna COLLATE Latin1_General_100_BIN2
 AND a.permission_name COLLATE Latin1_General_100_BIN2=e.Permiso COLLATE Latin1_General_100_BIN2
WHERE e.Tabla IS NULL OR a.class IS NULL OR a.state<>'G';
IF @Diferencias<>0 THROW 52005,'Se requieren exactamente siete concesiones G sin delegacion.',1;
IF ${tablas.map(t=>`EXISTS(SELECT 1 FROM [${esquema}].[${t}])`).join(' OR ')}
 THROW 52006,'Tablas de prueba no vacias: nunca limpiar ni sobrescribir.',1;
`;
 const pruebas=generarPruebas(guardas,acreditar);
 const {MATRIZ}=require('./lib/permisosMinimos');
 const historicas=MATRIZ.flatMap(r=>r.operaciones.map(permiso=>({esquema:r.esquema,tabla:r.tabla,columna:'',permiso})));
 const perfil={estado:'Correcciones preparadas OFFLINE; no se repitio SQL ni DCL por el agente',historicasConfirmadasPorUsuario:48,nuevasConfirmadasPorUsuario:7,
  estadoAzureDeclarado:'DDL v2 verificado, 55/55 derechos directos confirmados, CONNECT adicional conocido, db_datareader/db_datawriter conservados. No repetir DDL ni GRANT.',
  permisoAdicionalConocido:{clase:0,major_id:0,minor_id:0,permiso:'CONNECT',estado:'G'},
  pruebaPermisosLocalDeclarada:{positivas:8,negativas:18,rollback:true,origen:'Confirmado por el usuario; copia SSMS corregida, sin nueva ejecucion por el agente'},
  pruebaEsquemaLocalDeclarada:'25/25 por el usuario, no repetidas',historicas,nuevas,entradasTotales:historicas.length+nuevas.length,
  fuentes:{ddlV2:sha(origenDDL),cuerpoDDLOriginal:sha(cuerpo),cuerpoDDLClonado:sha(clonado),grantsAzureSoloTexto:sha(fs.readFileSync(path.join(root,'sql/proposals/notificaciones/02_permisos_propuestos_solo_lectura.sql')))},
  aislamiento:{base:'HostFlow_Test_Notificaciones_V2',esquema,usuario,sinLogin:true,credenciales:false,roles:[],noEsPerfilCompletoRuntime:'Solo siete derechos nuevos sobre copias; no concede 48 historicos en esta base.'}};
 return {preparacion,pruebas,perfil,guardas,cuerpo,clonado};
}
function generarPruebas(guardas,acreditar){
 // Se define abajo; solo devuelve texto, nunca lo ejecuta.
 return require('./lib/pruebasPermisosNotificacionesLocal')({guardas,acreditar,esquema,usuario,tablas});
}
if(require.main===module){
 if(process.argv.length!==3||process.argv[2]!=='--preparar')throw Error('Uso OFFLINE: node scripts/prepararPermisosNotificacionesLocal.js --preparar');
 const r=generar();fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'01_preparar_perfil_bloqueado.sql'),r.preparacion);
 fs.writeFileSync(path.join(dir,'02_probar_permisos_bloqueado.sql'),r.pruebas);
 fs.writeFileSync(path.join(dir,'perfil-permisos-v2.json'),JSON.stringify(r.perfil,null,2)+'\n');
 console.log('Propuestas locales bloqueadas generadas. No se ejecuto SQL.');
}
module.exports={generar};
