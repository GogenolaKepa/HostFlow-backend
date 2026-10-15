// Genera PROPUESTAS offline. Nunca abre SQL ni modifica permisos.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {MATRIZ,inventariar,filasEsperadas,grants}=require('./lib/permisosMinimos');
const root=path.resolve(__dirname,'..'),carpeta=path.join(root,'sql/proposals/permisos_minimos');
const sha256=b=>createHash('sha256').update(b).digest('hex');

function guardas(flag,codigo) {
  return `-- PROPUESTA BLOQUEADA. No ejecutar sin autorización administrativa SEPARADA.
DECLARE @${flag} bit=0;
DECLARE @InspeccionAprobada bit=0;
DECLARE @ServidorEsperado sysname=NULL;
DECLARE @PrincipalIdEsperado int=NULL;
DECLARE @SidEsperado varbinary(85)=NULL;
IF ISNULL(@${flag},0)<>1 OR ISNULL(@InspeccionAprobada,0)<>1
 THROW ${codigo},'Operacion bloqueada: requiere autorizacion especifica.',1;
IF @ServidorEsperado IS NULL OR @PrincipalIdEsperado IS NULL OR @SidEsperado IS NULL
 OR DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow'
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 THROW ${codigo+1},'Destino exacto no acreditado.',1;
IF @PrincipalIdEsperado<=4 OR NOT EXISTS(SELECT 1 FROM sys.database_principals
 WHERE principal_id=@PrincipalIdEsperado AND sid=@SidEsperado AND type IN('S','U','E','X')
 AND name COLLATE Latin1_General_100_BIN2=N'hostflow_app' AND DATALENGTH(name)=DATALENGTH(N'hostflow_app'))
 THROW ${codigo+2},'Principal y SID no acreditados: no cambiar permisos.',1;
IF USER_NAME()=N'hostflow_app' OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL'),0)<>1
 THROW ${codigo+3},'Usar una identidad administrativa existente, distinta del backend.',1;
IF @@TRANCOUNT<>0 OR (@@OPTIONS & 2)<>0
 THROW ${codigo+4},'Usar sesion dedicada en autocommit, sin transacciones previas.',1;
IF EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=@PrincipalIdEsperado)
 OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id=@PrincipalIdEsperado)
 THROW ${codigo+5},'La aplicacion posee objetos/esquemas: revisar propiedad antes de continuar.',1;
`;
}
const necesarios=()=>`DECLARE @Necesarios table(Objeto sysname NOT NULL,Permiso nvarchar(60) NOT NULL,PRIMARY KEY(Objeto,Permiso));
INSERT INTO @Necesarios(Objeto,Permiso) VALUES
 ${filasEsperadas()};
IF EXISTS(SELECT 1 FROM @Necesarios WHERE OBJECT_ID(Objeto,N'U') IS NULL)
 THROW 51690,'Faltan tablas de la matriz: no crear ni migrar desde este script.',1;
`;
const tx=(cuerpo)=>`SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
${cuerpo}
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
`;

function preparar() {
  const auditoria=inventariar(root);
  // Este catálogo solo construye expresiones de rutas; no importa app ni SQL.
  const rutas=require('../src/config/politicasRutas').politicas.map(({metodo,path,permiso})=>({metodo,path,permiso}));
  rutas.push(...[
    ['POST','/auth/login','Público con limitación de intentos'],['GET','/auth/me','JWT'],
    ['PATCH','/auth/me','cuenta.modificar'],['POST','/auth/cambiar-password','cuenta.password'],['POST','/auth/logout','JWT'],
  ].map(([metodo,path,permiso])=>({metodo,path,permiso})));
  const efectosGET={
    '/reservas':'UPDATE Reservas; INSERT ReservaEventos si se finaliza alguna reserva vencida.',
    '/reservas/:id':'UPDATE Reservas; INSERT ReservaEventos si se finaliza alguna reserva vencida (puede afectar otras reservas, no solo el ID).',
    '/limpiezas':'SELECT fuentes; INSERT/UPDATE TareasLimpieza durante sincronización.',
    '/limpiezas/resumen':'SELECT fuentes; INSERT/UPDATE TareasLimpieza durante sincronización.',
    '/alertas':'SELECT fuentes; INSERT/UPDATE Alertas, incluida resolución automática.',
    '/alertas/resumen':'SELECT fuentes; INSERT/UPDATE Alertas durante sincronización.',
    '/recomendaciones':'Consulta LimpiezaService.obtenerLimpiezas: INSERT/UPDATE TareasLimpieza; el resto consulta SQL/IA.',
  };
  const archivos={};
  archivos['00_inspeccion_administrativa_solo_lectura.sql']=`-- SOLO METADATOS. Preparado, NO ejecutado. Requiere autorización de lectura.
-- No consultar filas, contraseñas ni hashes. La sesión debe tener VIEW DEFINITION.
SELECT DB_NAME() AS Base,SERVERPROPERTY('ServerName') AS Servidor,
 SERVERPROPERTY('EngineEdition') AS Motor,USER_NAME() AS Sesion,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS Visibilidad;
SELECT principal_id,name,type_desc,sid,authentication_type_desc FROM sys.database_principals
 WHERE name=N'hostflow_app';
;WITH P AS (
 SELECT principal_id,0 AS Nivel FROM sys.database_principals WHERE name=N'hostflow_app'
 UNION ALL SELECT rm.role_principal_id,P.Nivel+1 FROM P JOIN sys.database_role_members rm ON rm.member_principal_id=P.principal_id
)
SELECT P.Nivel,d.principal_id,d.name,d.type_desc FROM P JOIN sys.database_principals d ON d.principal_id=P.principal_id
OPTION(MAXRECURSION 32);
;WITH P AS (
 SELECT principal_id FROM sys.database_principals WHERE name IN(N'hostflow_app',N'public')
 UNION ALL SELECT rm.role_principal_id FROM P JOIN sys.database_role_members rm ON rm.member_principal_id=P.principal_id
)
SELECT dp.name AS Beneficiario,p.class_desc,p.major_id,p.minor_id,p.permission_name,p.state_desc,
 CASE WHEN p.class=1 THEN OBJECT_SCHEMA_NAME(p.major_id) END AS Esquema,
 CASE WHEN p.class=1 THEN OBJECT_NAME(p.major_id) END AS Objeto
FROM sys.database_permissions p JOIN sys.database_principals dp ON dp.principal_id=p.grantee_principal_id
WHERE p.grantee_principal_id IN(SELECT principal_id FROM P) OPTION(MAXRECURSION 32);
-- Los permisos propios de roles fijos NO están todos en sys.database_permissions.
SELECT s.name AS Esquema,t.name AS Tabla,t.principal_id AS PropietarioExplicito,
 s.principal_id AS PropietarioEsquema,t.is_memory_optimized,t.temporal_type_desc
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.is_ms_shipped=0;
SELECT s.name AS Esquema,t.name AS Tabla,c.name AS Columna,ty.name AS Tipo,c.max_length,c.is_nullable,c.is_computed
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id;
SELECT tr.name,OBJECT_SCHEMA_NAME(tr.parent_id) AS Esquema,OBJECT_NAME(tr.parent_id) AS Tabla,
 tr.is_disabled,tr.is_instead_of_trigger,sm.execute_as_principal_id,
 CASE WHEN sm.definition IS NULL THEN 0 ELSE 1 END AS DefinicionVisible
FROM sys.triggers tr LEFT JOIN sys.sql_modules sm ON sm.object_id=tr.object_id WHERE tr.is_ms_shipped=0;
SELECT OBJECT_SCHEMA_NAME(referencing_id) AS EsquemaOrigen,OBJECT_NAME(referencing_id) AS ObjetoOrigen,
 referenced_server_name,referenced_database_name,referenced_schema_name,referenced_entity_name,is_ambiguous
FROM sys.sql_expression_dependencies;
SELECT s.name AS Esquema,sy.name AS Sinonimo,sy.base_object_name FROM sys.synonyms sy JOIN sys.schemas s ON s.schema_id=sy.schema_id;
SELECT p.name,p.is_enabled,OBJECT_SCHEMA_NAME(pr.target_object_id) AS Esquema,
 OBJECT_NAME(pr.target_object_id) AS Tabla,pr.predicate_type_desc,pr.operation_desc
FROM sys.security_policies p JOIN sys.security_predicates pr ON pr.object_id=p.object_id;
SELECT OBJECT_SCHEMA_NAME(parent_object_id) AS Esquema,OBJECT_NAME(parent_object_id) AS Tabla,
 name,is_disabled,is_not_trusted,delete_referential_action_desc,update_referential_action_desc
FROM sys.foreign_keys;
SELECT OBJECT_SCHEMA_NAME(object_id) AS Esquema,OBJECT_NAME(object_id) AS Tabla,name AS Columna,is_masked
FROM sys.masked_columns WHERE is_masked=1;
`;
  archivos['01_conceder_minimos_bloqueado.sql']=guardas('Conceder',51600)+necesarios()+
    `-- Primero conceder los 48 permisos específicos. No retira roles ni cambia datos.
-- No se concede EXECUTE general ni DDL/REFERENCES a la aplicación.
`+tx(grants())+
    `SELECT n.Objeto,n.Permiso,p.state_desc FROM @Necesarios n LEFT JOIN sys.database_permissions p
 ON p.class=1 AND p.major_id=OBJECT_ID(n.Objeto) AND p.minor_id=0
 AND p.grantee_principal_id=@PrincipalIdEsperado AND p.permission_name COLLATE Latin1_General_100_BIN2=n.Permiso COLLATE Latin1_General_100_BIN2;
`;
  archivos['02_verificar_concesiones_solo_lectura.sql']=`-- Ejecutar administrativamente solo después de autorizar la inspección.
-- Valida GRANT por objeto; NO prueba derechos finales mientras sigan roles amplios.
DECLARE @PrincipalId int=DATABASE_PRINCIPAL_ID(N'hostflow_app');
${necesarios()}
SELECT n.Objeto,n.Permiso,p.state_desc,
 CASE WHEN p.state='G' THEN 1 ELSE 0 END AS ConcesionDirectaSinDelegacion
FROM @Necesarios n LEFT JOIN sys.database_permissions p ON p.class=1 AND p.major_id=OBJECT_ID(n.Objeto)
 AND p.minor_id=0 AND p.permission_name COLLATE Latin1_General_100_BIN2=n.Permiso COLLATE Latin1_General_100_BIN2 AND p.grantee_principal_id=@PrincipalId;
SELECT rp.name AS Rol,mp.name AS Miembro FROM sys.database_role_members rm
JOIN sys.database_principals rp ON rp.principal_id=rm.role_principal_id
JOIN sys.database_principals mp ON mp.principal_id=rm.member_principal_id WHERE mp.principal_id=@PrincipalId;
SELECT p.class_desc,p.major_id,p.minor_id,p.permission_name,p.state_desc FROM sys.database_permissions p
WHERE p.grantee_principal_id IN(@PrincipalId,DATABASE_PRINCIPAL_ID(N'public'))
 AND (p.state='D' OR p.class IN(0,3) OR p.state='W');
`;
  archivos['03_retirar_roles_bloqueado.sql']=guardas('RetirarRoles',51610)+`
DECLARE @PruebasLocalesAprobadas bit=0;
DECLARE @VentanaMantenimientoAutorizada bit=0;
IF ISNULL(@PruebasLocalesAprobadas,0)<>1 OR ISNULL(@VentanaMantenimientoAutorizada,0)<>1
 THROW 51616,'Falta aprobar pruebas locales y ventana de mantenimiento.',1;
${necesarios()}
IF EXISTS(SELECT 1 FROM @Necesarios n WHERE NOT EXISTS(SELECT 1 FROM sys.database_permissions p
 WHERE p.class=1 AND p.major_id=OBJECT_ID(n.Objeto) AND p.minor_id=0 AND p.permission_name COLLATE Latin1_General_100_BIN2=n.Permiso COLLATE Latin1_General_100_BIN2
 AND p.grantee_principal_id=@PrincipalIdEsperado AND p.state='G'))
 THROW 51617,'Faltan GRANT directos sin delegacion. No retirar roles.',1;
IF (SELECT COUNT(*) FROM sys.database_role_members WHERE member_principal_id=@PrincipalIdEsperado)<>2
 OR (SELECT COUNT(*) FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id=rm.role_principal_id
 WHERE rm.member_principal_id=@PrincipalIdEsperado AND r.name IN(N'db_datareader',N'db_datawriter'))<>2
 THROW 51618,'Membresias distintas de las dos confirmadas: inspeccionar, no modificar.',1;
IF EXISTS(SELECT 1 FROM sys.database_permissions p
 WHERE p.grantee_principal_id IN(@PrincipalIdEsperado,DATABASE_PRINCIPAL_ID(N'public')) AND p.state='D'
 AND (p.class IN(0,3) OR (p.class=1 AND p.major_id IN(SELECT OBJECT_ID(Objeto) FROM @Necesarios))))
 THROW 51619,'DENY relevante existente, incluso de columna: requiere revision manual.',1;
-- Capturar el universo visible como ADMIN antes de impersonar: la visibilidad
-- reducida del backend no debe ocultar tablas sobre las que conserva privilegios.
DECLARE @Universo table(Objeto nvarchar(517),Permiso nvarchar(60),Esperado int,Actual int NULL);
INSERT INTO @Universo(Objeto,Permiso,Esperado)
 SELECT QUOTENAME(s.name)+N'.'+QUOTENAME(t.name),o.Permiso,
 CASE WHEN EXISTS(SELECT 1 FROM @Necesarios n WHERE OBJECT_ID(n.Objeto)=t.object_id AND n.Permiso=o.Permiso) THEN 1 ELSE 0 END
 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
 CROSS JOIN(VALUES(N'SELECT'),(N'INSERT'),(N'UPDATE'),(N'DELETE'),(N'ALTER'),(N'CONTROL'),(N'REFERENCES'),(N'TAKE OWNERSHIP'))o(Permiso)
 WHERE t.is_ms_shipped=0;
DECLARE @Excesos table(Clase nvarchar(30),Permiso nvarchar(60),Actual int NULL);
INSERT INTO @Excesos(Clase,Permiso) SELECT N'DATABASE',p FROM(VALUES
 (N'CONTROL'),(N'ALTER'),(N'CREATE TABLE'),(N'CREATE VIEW'),(N'CREATE PROCEDURE'),(N'CREATE FUNCTION'),
 (N'CREATE SCHEMA'),(N'CREATE ROLE'),(N'ALTER ANY ROLE'),(N'ALTER ANY USER'),(N'ALTER ANY SCHEMA'),(N'IMPERSONATE ANY USER'),
 (N'VIEW DEFINITION'),(N'TAKE OWNERSHIP'),(N'SELECT'),(N'INSERT'),(N'UPDATE'),(N'DELETE'),(N'EXECUTE'),(N'REFERENCES'))v(p);
INSERT INTO @Excesos(Clase,Permiso) SELECT N'SCHEMA',p FROM(VALUES
 (N'CONTROL'),(N'ALTER'),(N'VIEW DEFINITION'),(N'SELECT'),(N'INSERT'),(N'UPDATE'),(N'DELETE'),(N'EXECUTE'),(N'REFERENCES'))v(p);
DECLARE @Suplantando bit=0,@Conexion int,@Bloqueo int;
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 ALTER ROLE [db_datareader] DROP MEMBER [hostflow_app];
 ALTER ROLE [db_datawriter] DROP MEMBER [hostflow_app];
 EXECUTE AS USER=N'hostflow_app';
 SET @Suplantando=1;
 UPDATE @Universo SET Actual=HAS_PERMS_BY_NAME(Objeto,'OBJECT',Permiso);
 UPDATE @Excesos SET Actual=CASE WHEN Clase=N'DATABASE' THEN HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE',Permiso)
 ELSE HAS_PERMS_BY_NAME(N'dbo','SCHEMA',Permiso) END;
 SELECT @Conexion=HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONNECT'),
 @Bloqueo=HAS_PERMS_BY_NAME(N'sys.sp_getapplock','OBJECT','EXECUTE');
 REVERT;
 SET @Suplantando=0;
 IF EXISTS(SELECT 1 FROM @Universo WHERE Actual IS NULL OR Actual<>Esperado)
 OR EXISTS(SELECT 1 FROM @Excesos WHERE Actual IS NULL OR Actual<>0)
 OR ISNULL(@Conexion,0)<>1 OR ISNULL(@Bloqueo,0)<>1
  THROW 51620,'Perfil efectivo no coincide: rollback de retiro de roles; inspeccionar.',1;
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF @Suplantando=1 REVERT;
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
SELECT N'Retiro confirmado. Verificar nueva conexion real del backend antes de reabrir trafico.' AS Resultado;
`;
  archivos['04_recuperacion_roles_bloqueada.sql']=guardas('RecuperarRoles',51630)+`
DECLARE @SnapshotPrevioConfirmado bit=0;
IF ISNULL(@SnapshotPrevioConfirmado,0)<>1 THROW 51636,'Requiere snapshot de ambas membresias previas y autorizacion de recuperacion.',1;
-- Recuperación EXCEPCIONAL: reintroduce el exceso original. No es estado final.
-- Conserva GRANT específicos; no ejecuta REVOKE ni toca datos.
`+tx(` IF NOT EXISTS(SELECT 1 FROM sys.database_role_members WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'db_datareader') AND member_principal_id=@PrincipalIdEsperado)
  ALTER ROLE [db_datareader] ADD MEMBER [hostflow_app];
 IF NOT EXISTS(SELECT 1 FROM sys.database_role_members WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'db_datawriter') AND member_principal_id=@PrincipalIdEsperado)
  ALTER ROLE [db_datawriter] ADD MEMBER [hostflow_app];`);
  archivos['05_verificacion_conexion_backend_solo_lectura.sql']=`-- Solo diagnóstico de permisos, usando una conexión NUEVA de la aplicación.
-- No cuenta filas ni ejecuta endpoints, DDL, DML, GRANT o procedimientos.
-- No basta ejecutar esto como administrador. No muestra contraseñas ni hashes.
SELECT DB_NAME() AS Base,SERVERPROPERTY('ServerName') AS Servidor,SERVERPROPERTY('EngineEdition') AS Motor,
 USER_NAME() AS Principal,IS_ROLEMEMBER(N'db_datareader') AS DataReader,IS_ROLEMEMBER(N'db_datawriter') AS DataWriter,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONNECT') AS Conectar,
 HAS_PERMS_BY_NAME(N'sys.sp_getapplock','OBJECT','EXECUTE') AS EjecutarAppLock;
SELECT v.Objeto,v.Permiso,HAS_PERMS_BY_NAME(v.Objeto,'OBJECT',v.Permiso) AS Efectivo
FROM(VALUES ${filasEsperadas()})v(Objeto,Permiso);
SELECT HAS_PERMS_BY_NAME(N'dbo.Roles','OBJECT','UPDATE') AS NoDebeModificarRoles,
 HAS_PERMS_BY_NAME(N'dbo.Usuarios','OBJECT','DELETE') AS NoDebeBorrarUsuarios,
 HAS_PERMS_BY_NAME(N'dbo.Reservas','OBJECT','DELETE') AS NoDebeBorrarReservas,
 HAS_PERMS_BY_NAME(N'dbo.Empresas','OBJECT','INSERT') AS NoDebeCrearEmpresa,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS NoDebeCrearTablas,
 HAS_PERMS_BY_NAME(N'dbo','SCHEMA','ALTER') AS NoDebeAlterarDbo;
`;
  fs.mkdirSync(carpeta,{recursive:true});
  for(const [nombre,contenido]of Object.entries(archivos))fs.writeFileSync(path.join(carpeta,nombre),contenido);
  const modelo={version:1,estado:'Propuesta OFFLINE, ningún cambio de permisos ejecutado',principalPropuesto:'hostflow_app',
    configuracionAzure:'C y D completadas por el usuario; IdEmpresa=1. Función NO activada por el agente.',
    alcance:'Una organización por instalación. Permisos SQL del proceso, distintos de roles de usuarios de HostFlow.',matriz:MATRIZ,
    auditoria,rutas:rutas.map(r=>({...r,escriturasGET:r.metodo==='GET'?(efectosGET[r.path]||'No se detecta DML persistente en el handler/servicio de consulta.'):null})),
    pruebasSQLReales:'Pendientes: prohibido ejecutar GRANT/ALTER ROLE en esta tanda, incluso en local.',
    scripts:Object.keys(archivos).map(nombre=>({archivo:`sql/proposals/permisos_minimos/${nombre}`,sha256:sha256(fs.readFileSync(path.join(carpeta,nombre)))}))};
  fs.writeFileSync(path.join(carpeta,'modelo-permisos.json'),JSON.stringify(modelo,null,2)+'\n');
  let documento=`# Matriz SQL mínima del backend HostFlow

Generada offline desde código: ${auditoria.fuentes.length} archivos src con huellas, ${auditoria.llamadasSQL.length} llamadas SQL y ${auditoria.referencias.length} evidencias por tabla/operación. Incluye ${rutas.length} rutas (99 políticas de negocio y 5 de autenticación). No son resultados de Azure ni una prueba del motor SQL. El extractor estático no reemplaza la revisión humana de alias, ramas dinámicas, triggers, herencias y SQL real.

El principal de proceso hostflow_app necesita la UNIÓN de operaciones de Administrador y Operador. Los permisos JWT/acción y las proyecciones económicas siguen aplicándose en Express. No se conceden estos permisos SQL a cada cuenta final ni se convierte Operador en administrador de SQL.

## Matriz por objeto

S=SELECT, I=INSERT, U=UPDATE, D=DELETE. Un guion significa NO conceder. Todas las tablas son dbo. El objetivo es 48 permisos DML específicos sobre 19 tablas.

| Tabla | S | I | U | D | Justificación |
| --- | --- | --- | --- | --- | --- |
`;
  for(const r of MATRIZ)documento+=`| ${r.tabla} | ${['SELECT','INSERT','UPDATE','DELETE'].map(o=>r.operaciones.includes(o)?'Sí':'—').join(' | ')} | ${r.motivo} |\n`;
  documento+='\n## Evidencia por objeto y operación\n\nLas líneas se refieren al código local auditado. El JSON adjunto contiene las 308 referencias y las huellas completas.\n';
  for(const r of MATRIZ) {
    documento+=`\n### dbo.${r.tabla}\n\n`;
    for(const op of r.operaciones) {
      const e=auditoria.referencias.find(e=>e.tabla===r.tabla && e.operacion===op);
      documento+=`- ${op}: [${e.archivo}:${e.linea}](../${e.archivo}#L${e.linea}), método ${e.metodo}.${e.nota?' '+e.nota:''}\n`;
    }
  }
  documento+='\n## Consultas por repositorio\n\n| Repositorio | Operaciones sobre tablas |\n| --- | --- |\n';
  for(const archivo of [...new Set(auditoria.referencias.map(e=>e.archivo))].sort()) {
    const tablas=[...new Set(auditoria.referencias.filter(e=>e.archivo===archivo).map(e=>e.tabla))].sort();
    documento+=`| ${archivo} | ${tablas.map(t=>t+': '+[...new Set(auditoria.referencias.filter(e=>e.archivo===archivo && e.tabla===t).map(e=>e.operacion))].join('/')).join('; ')} |\n`;
  }
  documento+='\n## Rutas auditadas\n\nPrefijo /api. Todas las peticiones protegidas con JWT SQL consultan además Usuarios/Roles. HEAD hereda GET y sus efectos. OPTIONS se resuelve antes de autenticación, sin SQL. GET / de salud y recursos estáticos no son módulos SQL. No ejecutar estos endpoints contra Azure para validar permisos.\n\n| Método | Ruta | Permiso API | DML en GET |\n| --- | --- | --- | --- |\n';
  for(const r of modelo.rutas)documento+=`| ${r.metodo} | /api${r.path} | ${r.permiso} | ${r.escriturasGET||'Consultar matriz y escenarios del módulo; no clasificar por verbo solamente.'} |\n`;
  documento+='\nEl procedimiento de transición, riesgos y preparación de pruebas está en [auditoria-permisos-sql.md](auditoria-permisos-sql.md). Scripts y manifiesto: sql/proposals/permisos_minimos/. No se ejecutaron concesiones ni retiros de roles.\n';
  fs.writeFileSync(path.join(root,'docs/matriz-permisos-backend.md'),documento);
  console.log(JSON.stringify({resultado:'Propuestas preparadas offline',tablas:MATRIZ.length,permisos:MATRIZ.reduce((n,r)=>n+r.operaciones.length,0),referencias:auditoria.referencias.length,fuentes:auditoria.fuentes.length,consultasSQL:0}));
  return modelo;
}
if(require.main===module) {
  if(process.argv.length===3 && process.argv[2]==='--preparar')preparar();
  else {console.log('Preparación OFFLINE: node scripts/prepararPermisosMinimos.js --preparar. No conecta ni ejecuta SQL.');process.exitCode=process.argv.length>2?1:0;}
}
module.exports={preparar,guardas};
