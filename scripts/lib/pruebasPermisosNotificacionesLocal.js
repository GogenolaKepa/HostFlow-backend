// Solo genera batches literales cerrados; no driver, conexion ni ejecutor SQL.
module.exports=function({guardas,acreditar,esquema:s,usuario:u,tablas}){
 const positivas=[
  ['SELECT preferencias',`IF (SELECT COUNT(*) FROM [${s}].PreferenciasNotificacionUsuario)<>0 THROW 52020,'Preferencias iniciales inesperadas.',1;`],
  ['INSERT preferencia',`INSERT [${s}].PreferenciasNotificacionUsuario(IdUsuario,Tipo,Habilitada) VALUES(1,N'RESERVA_NUEVA',1); IF @@ROWCOUNT<>1 THROW 52021,'INSERT no afecto una fila.',1;`],
  ['UPDATE Habilitada',`UPDATE [${s}].PreferenciasNotificacionUsuario SET Habilitada=0 WHERE IdUsuario=1 AND Tipo=N'RESERVA_NUEVA'; IF @@ROWCOUNT<>1 THROW 52022,'UPDATE Habilitada no afecto una fila.',1;`],
  ['UPDATE FechaActualizacion',`UPDATE [${s}].PreferenciasNotificacionUsuario SET FechaActualizacion=SYSUTCDATETIME() WHERE IdUsuario=1 AND Tipo=N'RESERVA_NUEVA'; IF @@ROWCOUNT<>1 THROW 52023,'UPDATE fecha no afecto una fila.',1;`],
  ['UPDATE combinado y OUTPUT rowversion',`DECLARE @Rev binary(8); DECLARE @Nueva TABLE(Revision binary(8)); SELECT @Rev=VersionRegistro FROM [${s}].PreferenciasNotificacionUsuario WHERE IdUsuario=1 AND Tipo=N'RESERVA_NUEVA'; UPDATE [${s}].PreferenciasNotificacionUsuario SET Habilitada=1,FechaActualizacion=SYSUTCDATETIME() OUTPUT INSERTED.VersionRegistro INTO @Nueva WHERE IdUsuario=1 AND Tipo=N'RESERVA_NUEVA' AND VersionRegistro=@Rev; IF (SELECT COUNT(*) FROM @Nueva)<>1 THROW 52024,'UPDATE parametrizable con OUTPUT no autorizado.',1;`],
  ['SELECT evento',`IF (SELECT COUNT(*) FROM [${s}].Notificaciones)<>1 THROW 52025,'Evento ficticio ausente.',1;`],
  ['SELECT destinatario',`IF (SELECT COUNT(*) FROM [${s}].NotificacionDestinatarios)<>1 THROW 52026,'Entrega ficticia ausente.',1;`],
  ['UPDATE lectura con JOIN/revision',`DECLARE @Rev binary(8); SELECT @Rev=VersionRegistro FROM [${s}].NotificacionDestinatarios WHERE IdUsuario=1; UPDATE d SET FechaLectura=SYSUTCDATETIME() FROM [${s}].NotificacionDestinatarios d JOIN [${s}].Notificaciones n ON n.IdNotificacion=d.IdNotificacion WHERE d.IdUsuario=1 AND n.IdEmpresa=1 AND d.FechaLectura IS NULL AND d.VersionRegistro=@Rev; IF @@ROWCOUNT<>1 THROW 52027,'UPDATE de lectura no afecto una fila.',1;`],
 ];
 const negativas=[
  ['UPDATE IdUsuario preferencia',`UPDATE [${s}].PreferenciasNotificacionUsuario SET IdUsuario=2 WHERE IdUsuario=1;`],
  ['UPDATE Tipo preferencia',`UPDATE [${s}].PreferenciasNotificacionUsuario SET Tipo=N'RESERVA_CANCELADA' WHERE IdUsuario=1;`],
  ['UPDATE mixto permitido y prohibido',`UPDATE [${s}].PreferenciasNotificacionUsuario SET Habilitada=0,IdUsuario=2 WHERE IdUsuario=1;`],
  ['UPDATE FechaRecepcion',`UPDATE [${s}].NotificacionDestinatarios SET FechaRecepcion='2026-01-01' WHERE IdUsuario=1;`],
  ['UPDATE IdUsuario destinatario',`UPDATE [${s}].NotificacionDestinatarios SET IdUsuario=2 WHERE IdUsuario=1;`],
  ['UPDATE IdNotificacion destinatario',`UPDATE [${s}].NotificacionDestinatarios SET IdNotificacion=IdNotificacion WHERE IdUsuario=1;`],
  ['INSERT evento',`INSERT [${s}].Notificaciones(IdEmpresa,Tipo,ClaveEvento,ReferenciaTipo,Prioridad,FechaEvento) VALUES(1,N'RESERVA_NUEVA','prohibido','sistema',N'Alta',SYSUTCDATETIME());`],
  ['INSERT destinatario',`INSERT [${s}].NotificacionDestinatarios(IdNotificacion,IdUsuario) SELECT IdNotificacion,2 FROM [${s}].Notificaciones;`],
  ['UPDATE evento',`UPDATE [${s}].Notificaciones SET Prioridad=N'Media';`],
  ['SELECT politicas',`SELECT COUNT(*) FROM [${s}].PoliticasNotificacionEmpresa;`],
  ['INSERT politica',`INSERT [${s}].PoliticasNotificacionEmpresa(IdEmpresa,Tipo,Habilitada,Obligatoria,IdUsuarioActualizacion) VALUES(1,N'RESERVA_CANCELADA',1,0,1);`],
  ['UPDATE politica',`UPDATE [${s}].PoliticasNotificacionEmpresa SET Habilitada=0;`],
  ...tablas.map(t=>[`DELETE ${t}`,`DELETE FROM [${s}].[${t}];`]),
 ];
 const ejecutar=sql=>`EXEC(N'${sql.replaceAll("'","''")}');`;
 const dboObjetos=tablas.map(t=>`OBJECT_ID(N'dbo.${t}')`).join(',');
 const vacias=()=>tablas.map(t=>`EXISTS(SELECT 1 FROM [${s}].[${t}])`).join(' OR ');
 return `-- NO EJECUTADO. Solo tras autorizacion de pruebas DML locales con impersonacion.
-- No contiene DCL. No repite DDL, GRANT ni las 25 pruebas del esquema.
DECLARE @ProbarPermisos bit=0;
IF ISNULL(@ProbarPermisos,0)<>1 THROW 52007,'Prueba local no autorizada.',1;
${guardas}
${acreditar}
-- Las tablas dbo originales deben seguir en el estado del fixture conocido.
IF (SELECT COUNT(*) FROM dbo.Usuarios)<>2 OR EXISTS(SELECT 1 FROM dbo.Usuarios WHERE IdUsuario NOT IN(1,2))
 OR (SELECT COUNT(*) FROM dbo.Empresas)<>2 OR EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa NOT IN(1,2))
 OR ${tablas.slice(2).map(t=>`EXISTS(SELECT 1 FROM dbo.[${t}])`).join(' OR ')}
 THROW 52008,'Fixture original diferente: no adoptar ni limpiar.',1;
DECLARE @IdentEvento numeric(38,0)=IDENT_CURRENT(N'dbo.Notificaciones'),
 @IdentEntrega numeric(38,0)=IDENT_CURRENT(N'dbo.NotificacionDestinatarios');
DECLARE @Marcas TABLE(Clase int,Objeto int,Menor int,Nombre sysname,Valor nvarchar(4000));
INSERT @Marcas SELECT class,major_id,minor_id,name,CONVERT(nvarchar(4000),value)
 FROM sys.extended_properties WHERE class=0 OR (class=1 AND major_id IN(${dboObjetos}));
DECLARE @Columnas TABLE(Objeto nvarchar(260),Columna sysname,Actualizar bit,Leer bit);
INSERT @Columnas SELECT QUOTENAME(SCHEMA_NAME(t.schema_id))+N'.'+QUOTENAME(t.name),c.name,
 CASE WHEN SCHEMA_NAME(t.schema_id)=N'${s}' AND ((t.name=N'PreferenciasNotificacionUsuario' AND c.name IN(N'Habilitada',N'FechaActualizacion'))
 OR (t.name=N'NotificacionDestinatarios' AND c.name=N'FechaLectura')) THEN 1 ELSE 0 END,
 CASE WHEN SCHEMA_NAME(t.schema_id)=N'${s}' AND t.name IN(N'PreferenciasNotificacionUsuario',N'Notificaciones',N'NotificacionDestinatarios') THEN 1 ELSE 0 END
 FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id WHERE t.is_ms_shipped=0;
DECLARE @Original sysname=USER_NAME(),@Positivas int=0,@Negativas int=0,@Denegada bit;
SET XACT_ABORT OFF; SET ANSI_WARNINGS ON;
BEGIN TRY
 BEGIN TRANSACTION;
 -- Solo clones: todos los datos se crean dentro de esta transaccion reversible.
 INSERT [${s}].Usuarios(IdUsuario) VALUES(1),(2);
 INSERT [${s}].Empresas(IdEmpresa) VALUES(1),(2);
 INSERT [${s}].Notificaciones(IdEmpresa,Tipo,ClaveEvento,ReferenciaTipo,Prioridad,FechaEvento)
 VALUES(1,N'RESERVA_NUEVA','permiso-evento','sistema',N'Informativa',SYSUTCDATETIME());
 INSERT [${s}].NotificacionDestinatarios(IdNotificacion,IdUsuario,FechaRecepcion)
 SELECT IdNotificacion,1,DATEADD(day,-1,SYSUTCDATETIME()) FROM [${s}].Notificaciones;
 INSERT [${s}].PoliticasNotificacionEmpresa(IdEmpresa,Tipo,Habilitada,Obligatoria,IdUsuarioActualizacion)
 VALUES(1,N'RESERVA_NUEVA',1,0,1);
 EXECUTE AS USER=N'${u}';
 IF USER_NAME() COLLATE Latin1_General_100_BIN2<>N'${u}' THROW 52009,'Identidad restringida no activa.',1;
 IF ISNULL(IS_MEMBER(N'db_owner'),0)<>0 OR ISNULL(IS_MEMBER(N'db_datareader'),0)<>0 OR ISNULL(IS_MEMBER(N'db_datawriter'),0)<>0
  OR EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N'DATABASE') WHERE permission_name NOT IN
   (N'CONNECT',N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION',N'VIEW ANY COLUMN MASTER KEY DEFINITION'))
  THROW 52010,'Permisos administrativos o roles inesperados.',1;
 -- Universo de columnas capturado COMO ADMIN antes de impersonar: no depende
 -- de la visibilidad reducida de sys.columns de la identidad ficticia.
 IF EXISTS(SELECT 1 FROM @Columnas WHERE
  ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'UPDATE',Columna,N'COLUMN'),0)<>Actualizar
  OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'SELECT',Columna,N'COLUMN'),0)<>Leer)
  THROW 52011,'Permisos efectivos por columna diferentes del perfil.',1;
 IF EXISTS(SELECT 1 FROM (VALUES ${['dbo',s].flatMap(es=>tablas.map(t=>`(N'${es}.${t}',${es===s&&t==='PreferenciasNotificacionUsuario'?1:0})`)).join(',')}) p(Objeto,Insertar)
  WHERE ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'INSERT'),0)<>Insertar
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'DELETE'),0)<>0
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'CONTROL'),0)<>0
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'ALTER'),0)<>0
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'REFERENCES'),0)<>0
   OR ISNULL(HAS_PERMS_BY_NAME(Objeto,N'OBJECT',N'TAKE OWNERSHIP'),0)<>0)
  THROW 52012,'Exceso de permisos efectivos de objeto.',1;
${positivas.map(([n,sql])=>` -- POSITIVA: ${n}\n ${ejecutar(sql)}\n SET @Positivas=@Positivas+1;`).join('\n')}
${negativas.map(([n,sql])=>` -- NEGATIVA: ${n}
 SET @Denegada=0;
 BEGIN TRY
  ${ejecutar(sql)}
 END TRY
 BEGIN CATCH
  -- Solo errores de permisos. Un 547/2627/273/8102 NO acredita denegacion.
  IF ERROR_NUMBER() NOT IN(229,230) THROW;
  SET @Denegada=1;
 END CATCH;
 IF @Denegada<>1 THROW 52013,'Operacion prohibida ejecutada: prueba fallida.',1;
 SET @Negativas=@Negativas+1;
`).join('\n')}
 REVERT;
 IF USER_NAME()<>@Original THROW 52014,'No se restauro identidad administrativa.',1;
 ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
 IF USER_NAME() COLLATE Latin1_General_100_BIN2=N'${u}' REVERT;
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
IF ${vacias()} THROW 52015,'Persistieron datos de prueba: detenerse sin limpiar.',1;
IF (SELECT COUNT(*) FROM dbo.Usuarios)<>2 OR EXISTS(SELECT 1 FROM dbo.Usuarios WHERE IdUsuario NOT IN(1,2))
 OR (SELECT COUNT(*) FROM dbo.Empresas)<>2 OR EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa NOT IN(1,2))
 OR ${tablas.slice(2).map(t=>`EXISTS(SELECT 1 FROM dbo.[${t}])`).join(' OR ')}
 THROW 52018,'Filas originales distintas: revisar interferencia externa.',1;
IF ISNULL(IDENT_CURRENT(N'dbo.Notificaciones'),-1)<>ISNULL(@IdentEvento,-1)
 OR ISNULL(IDENT_CURRENT(N'dbo.NotificacionDestinatarios'),-1)<>ISNULL(@IdentEntrega,-1)
 THROW 52016,'Identity original cambio: revisar interferencia externa.',1;
IF EXISTS(SELECT Clase,Objeto,Menor,Nombre,Valor FROM @Marcas EXCEPT
 SELECT class,major_id,minor_id,name,CONVERT(nvarchar(4000),value) FROM sys.extended_properties WHERE class=0 OR (class=1 AND major_id IN(${dboObjetos})))
 OR EXISTS(SELECT class,major_id,minor_id,name,CONVERT(nvarchar(4000),value) FROM sys.extended_properties WHERE class=0 OR (class=1 AND major_id IN(${dboObjetos}))
 EXCEPT SELECT Clase,Objeto,Menor,Nombre,Valor FROM @Marcas)
 THROW 52017,'Marcas originales distintas: detenerse sin corregirlas.',1;
SELECT @Positivas AS PositivasAprobadas,8 AS PositivasEsperadas,@Negativas AS NegativasAprobadas,18 AS NegativasEsperadas,
 N'Rollback completo; dbo sin DML. Revisar perfil y resultados antes de autorizar Azure.' AS Resultado;
-- El @@DBTS global y los identity de los CLONES pueden avanzar. No cambia el
-- contenido, identity ni marcas de las seis tablas dbo preexistentes.
-- No elimina esquema, usuario ni tablas: limpieza futura requiere otra autorizacion.
`;
};
