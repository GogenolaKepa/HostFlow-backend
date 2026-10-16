// Genera texto de pruebas de motor para revision humana. No conecta ni ejecuta SQL.
const {TIPOS_PREFERENCIA,PRIORIDADES_PERSONALES}=require('../../src/config/notificaciones');
const insertar=(prioridad="N'Alta'",clave="'fixture-negativo'",empresa='1',tipo="N'RESERVA_NUEVA'",referencia="'sistema'",id='NULL')=>
 `INSERT dbo.Notificaciones(IdEmpresa,Tipo,ClaveEvento,ReferenciaTipo,ReferenciaId,Prioridad,FechaEvento) VALUES(${empresa},${tipo},${clave},${referencia},${id},${prioridad},'2026-01-01T00:00:00.000');`;
function casos(){
  const positivos=PRIORIDADES_PERSONALES.map((p,i)=>insertar(`N'${p}'`,`'fixture-${i}'`)).join('\n');
  const opciones=TIPOS_PREFERENCIA.map(tipo=>`INSERT dbo.PreferenciasNotificacionUsuario(IdUsuario,Tipo,Habilitada) VALUES(1,N'${tipo}',1);
INSERT dbo.PoliticasNotificacionEmpresa(IdEmpresa,Tipo,Habilitada,Obligatoria,RetencionDias,IdUsuarioActualizacion) VALUES(1,N'${tipo}',1,0,30,1);`).join('\n');
  const negativos=[
    ['prioridad 10 truncada',insertar("N'Informativ'"),'547'],
    ['prioridad minuscula',insertar("N'informativa'"),'547'],
    ['prioridad espacios',insertar("N'Informativa '"),'547'],
    ['prioridad longitud 16 no catalogada',insertar("REPLICATE(N'X',16)"),'547'],
    ['prioridad longitud 17',insertar("REPLICATE(N'X',17)"),'2628,8152'],
    ['prioridad nula',insertar('NULL'),'515'],
    ['tipo longitud 40 no catalogado',insertar(undefined,undefined,undefined,"REPLICATE(N'X',40)"),'547'],
    ['tipo longitud 41',insertar(undefined,undefined,undefined,"REPLICATE(N'X',41)"),'2628,8152'],
    ['clave longitud 201',insertar(undefined,"REPLICATE('X',201)"),'2628,8152'],
    ['clave vacia',insertar(undefined,"''"),'547'],
    ['referencia no canonica',insertar(undefined,undefined,undefined,undefined,"'sistema '"),'547'],
    ['referencia inconsistente',insertar(undefined,undefined,undefined,undefined,"'reserva'",'NULL'),'547'],
    ['FK empresa inexistente',insertar(undefined,undefined,'999'),'547'],
    ['evento duplicado',insertar()+insertar(),'2627,2601'],
    ['FK destinatario inexistente','INSERT dbo.NotificacionDestinatarios(IdNotificacion,IdUsuario) VALUES(@Evento,999);','547'],
    ['FK evento inexistente','INSERT dbo.NotificacionDestinatarios(IdNotificacion,IdUsuario) VALUES(-1,1);','547'],
    ['destinatario duplicado','INSERT dbo.NotificacionDestinatarios(IdNotificacion,IdUsuario) VALUES(@Evento,1),(@Evento,1);','2627,2601'],
    ['lectura anterior','INSERT dbo.NotificacionDestinatarios(IdNotificacion,IdUsuario,FechaRecepcion,FechaLectura) VALUES(@Evento,1,\'2026-01-02\',\'2026-01-01\');','547'],
    ['FK preferencia inexistente',"INSERT dbo.PreferenciasNotificacionUsuario(IdUsuario,Tipo,Habilitada) VALUES(999,N'RESERVA_NUEVA',1);",'547'],
    ['preferencia duplicada',"INSERT dbo.PreferenciasNotificacionUsuario(IdUsuario,Tipo,Habilitada) VALUES(1,N'RESERVA_NUEVA',1),(1,N'RESERVA_NUEVA',0);",'2627,2601'],
    ['politica obligatoria deshabilitada',"INSERT dbo.PoliticasNotificacionEmpresa(IdEmpresa,Tipo,Habilitada,Obligatoria,IdUsuarioActualizacion) VALUES(1,N'RESERVA_NUEVA',0,1,1);",'547'],
    ['retencion fuera de rango',"INSERT dbo.PoliticasNotificacionEmpresa(IdEmpresa,Tipo,Habilitada,Obligatoria,RetencionDias,IdUsuarioActualizacion) VALUES(1,N'RESERVA_NUEVA',1,0,3651,1);",'547'],
    ['FK editor politica inexistente',"INSERT dbo.PoliticasNotificacionEmpresa(IdEmpresa,Tipo,Habilitada,Obligatoria,IdUsuarioActualizacion) VALUES(1,N'RESERVA_NUEVA',1,0,999);",'547'],
    ['politica duplicada',"INSERT dbo.PoliticasNotificacionEmpresa(IdEmpresa,Tipo,Habilitada,Obligatoria,IdUsuarioActualizacion) VALUES(1,N'RESERVA_NUEVA',1,0,1),(1,N'RESERVA_NUEVA',1,0,1);",'2627,2601'],
  ];
  return `-- Pruebas LOCALES preparadas, no ejecutadas. Todo DML se revierte.
-- Las secuencias identity y rowversion PUEDEN avanzar incluso con ROLLBACK.
IF (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0)<>6
 OR (SELECT COUNT(*) FROM sys.extended_properties WHERE class=1 AND minor_id=0
 AND major_id IN(OBJECT_ID(N'dbo.Notificaciones'),OBJECT_ID(N'dbo.NotificacionDestinatarios'),OBJECT_ID(N'dbo.PreferenciasNotificacionUsuario'),OBJECT_ID(N'dbo.PoliticasNotificacionEmpresa'))
 AND name=N'HostFlowNotificacionesModelo' AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'hostflow-notificaciones-v2'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'hostflow-notificaciones-v2'))<>4
 THROW 51950,'Seis tablas y cuatro marcas v2 requeridas.',1;
IF EXISTS(SELECT 1 FROM dbo.Notificaciones) OR EXISTS(SELECT 1 FROM dbo.NotificacionDestinatarios)
 OR EXISTS(SELECT 1 FROM dbo.PreferenciasNotificacionUsuario) OR EXISTS(SELECT 1 FROM dbo.PoliticasNotificacionEmpresa)
 OR (SELECT COUNT(*) FROM dbo.Usuarios)<>2 OR (SELECT COUNT(*) FROM dbo.Empresas)<>2
 OR EXISTS(SELECT 1 FROM dbo.Usuarios WHERE IdUsuario NOT IN(1,2)) OR EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa NOT IN(1,2))
 THROW 51951,'Datos preexistentes ajenos al fixture: no limpiar ni continuar.',1;
SET XACT_ABORT OFF; SET ANSI_WARNINGS ON;
DECLARE @Evento bigint,@Revision binary(8),@Rechazado bit,@Aprobadas int=0;
BEGIN TRY
 BEGIN TRANSACTION;
 ${positivos}
 ${opciones}
 SELECT TOP(1) @Evento=IdNotificacion FROM dbo.Notificaciones ORDER BY IdNotificacion;
 INSERT dbo.NotificacionDestinatarios(IdNotificacion,IdUsuario,FechaRecepcion) VALUES(@Evento,1,'2026-01-01'),(@Evento,2,'2026-01-01');
 SELECT @Revision=VersionRegistro FROM dbo.NotificacionDestinatarios WHERE IdNotificacion=@Evento AND IdUsuario=1;
 UPDATE dbo.NotificacionDestinatarios SET FechaLectura='2026-01-02' WHERE IdNotificacion=@Evento AND IdUsuario=1 AND VersionRegistro=@Revision;
 IF @@ROWCOUNT<>1 THROW 51952,'UPDATE con revision vigente debe afectar una fila.',1;
 UPDATE dbo.NotificacionDestinatarios SET FechaLectura='2026-01-03' WHERE IdNotificacion=@Evento AND IdUsuario=1 AND VersionRegistro=@Revision;
 IF @@ROWCOUNT<>0 THROW 51953,'Revision anterior no rechazo actualizacion.',1;
 IF (SELECT COUNT(*) FROM dbo.Notificaciones)<>4 OR (SELECT COUNT(*) FROM dbo.PreferenciasNotificacionUsuario)<>8
 OR (SELECT COUNT(*) FROM dbo.PoliticasNotificacionEmpresa)<>8 THROW 51954,'Contrato positivo incompleto.',1;
 ROLLBACK TRANSACTION;
 SET @Aprobadas=@Aprobadas+1;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
${negativos.map(([nombre,sql,errores])=>`
-- Caso negativo: ${nombre}.
SET @Rechazado=0;
BEGIN TRY
 BEGIN TRANSACTION;
 ${insertar(undefined,"'fixture-base'")}
 SET @Evento=CONVERT(bigint,SCOPE_IDENTITY());
 ${sql}
 ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 IF ERROR_NUMBER() NOT IN(${errores}) THROW;
 SET @Rechazado=1;
END CATCH;
IF @Rechazado<>1 THROW 51955,'Un caso negativo fue aceptado por el motor.',1;
SET @Aprobadas=@Aprobadas+1;
`).join('\n')}
IF EXISTS(SELECT 1 FROM dbo.Notificaciones) OR EXISTS(SELECT 1 FROM dbo.NotificacionDestinatarios)
 OR EXISTS(SELECT 1 FROM dbo.PreferenciasNotificacionUsuario) OR EXISTS(SELECT 1 FROM dbo.PoliticasNotificacionEmpresa)
 THROW 51956,'Quedaron filas: detenerse, no ejecutar limpieza automatica.',1;
SELECT @Aprobadas AS GruposAprobados,25 AS GruposEsperados,
 N'No demuestra productores, concurrencia entre conexiones, RLS ni permisos efectivos.' AS Limite;
`;
}
module.exports={casos};
