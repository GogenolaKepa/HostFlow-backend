const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {laboratorioSqlcmd}=require('./sqlComercialCli');
const {EventosCorreoSql}=require('../../src/repositories/EventosCorreoSql');
test('SQL19: eventos durables, duplicados, supresión monotónica, rollback y perfil restringido',{
  skip:process.env.HOSTFLOW_AUTHCOM_EVENTOS_SQL_TEST!=='1',timeout:90000,
},async()=>laboratorioSqlcmd(async({ejecutar,propuesta,runId})=>{
  const s=runId.replaceAll('-','').slice(0,10),owner='hf_owner_'+s,legacy='hf_legacy_'+s,receptor='hf_eventos_'+s;
  const marcar=n=>`EXEC sys.sp_addextendedproperty @name=N'HostFlowTestRun',@value=N'${runId}',@level0type=N'USER',@level0name=N'${n}';`;
  const outboxId=randomUUID(),proveedorId=randomUUID(),destino=Buffer.alloc(32,3);
  const compilar=({q,p})=>{
    const literal=v=>"N'"+String(v).replaceAll("'","''")+"'";
    const tipo=v=>Buffer.isBuffer(v)?'varbinary(32)':v instanceof Date?'datetime2(3)':typeof v==='number'?'int':'nvarchar(max)';
    const valor=v=>Buffer.isBuffer(v)?'0x'+v.toString('hex'):v instanceof Date?literal(v.toISOString().replace('Z','')):typeof v==='number'?String(v):literal(v);
    return `EXEC sys.sp_executesql ${literal(q)},${literal(Object.entries(p).map(([n,v])=>'@'+n+' '+tipo(v)).join(','))},${Object.entries(p).map(([n,v])=>'@'+n+'='+valor(v)).join(',')};`;
  };
  const aplicar=async(tipo,evento,fecha)=>{
    const consultas=[],r=new EventosCorreoSql({habilitado:true,repository:{transaccion:fn=>fn({q:async(q,p)=>{
      consultas.push({q,p});return {recordset:q.includes('extended_properties')?[{modelo:'authcom-eventos-v1'}]:q.startsWith('SELECT OutboxId,Destino FROM')?[{OutboxId:outboxId,Destino:destino}]:[],rowsAffected:[1]};
    }})}});
    await r.registrarEventoCorreo({eventoId:evento,proveedorId,tipo,ocurridoEn:fecha.toISOString(),huella:'a'.repeat(64)});
    return consultas.filter(c=>/^UPDATE authcom.Correo|^INSERT authcom.CorreoBloqueos/.test(c.q)).map(compilar).join('\n');
  };
  try{
    await ejecutar(`BEGIN TRANSACTION;CREATE USER [${owner}] WITHOUT LOGIN;${marcar(owner)}CREATE USER [${legacy}] WITHOUT LOGIN;${marcar(legacy)}CREATE USER [${receptor}] WITHOUT LOGIN;${marcar(receptor)}
      ALTER AUTHORIZATION ON SCHEMA::authcom TO [${owner}];DENY SELECT,INSERT,UPDATE,DELETE,EXECUTE,ALTER,REFERENCES,TAKE OWNERSHIP ON SCHEMA::authcom TO [${legacy}];COMMIT;`);
    const fuente=fs.readFileSync(path.join(__dirname,'../../sql/proposals/autenticacion_comercial/19_eventos_correo_bloqueados.sql'),'utf8');
    await assert.rejects(ejecutar(fuente),e=>e.codigosSQL.includes(51970));
    await assert.rejects(ejecutar(fuente.replace('@Aplicar bit=0','@Aplicar bit=NULL')),e=>e.codigosSQL.includes(51970));
    const instalar=propuesta('19_eventos_correo_bloqueados.sql').replaceAll('hostflow_authcom_owner',owner).replaceAll('hostflow_app',legacy).replace("SERVERPROPERTY('EngineEdition'))<>5","SERVERPROPERTY('EngineEdition'))<>3");
    await ejecutar(instalar);await assert.rejects(ejecutar(instalar),e=>e.codigosSQL.includes(51973));
    await ejecutar(`GRANT SELECT,UPDATE ON OBJECT::authcom.CorreoMensajes TO [${receptor}];GRANT SELECT,INSERT,UPDATE ON OBJECT::authcom.CorreoEventos TO [${receptor}];GRANT SELECT,INSERT ON OBJECT::authcom.CorreoBloqueos TO [${receptor}];
      INSERT authcom.Outbox(Id,ExpiraEn,Sobre,Estado,Proxima) VALUES('${outboxId}',DATEADD(hour,1,SYSUTCDATETIME()),N'{}','pendiente',SYSUTCDATETIME());
      INSERT authcom.CorreoMensajes(OutboxId,ProveedorId,Destino) VALUES('${outboxId}','${proveedorId}',0x${destino.toString('hex')});
      INSERT authcom.CorreoEventos(EventoId,ProveedorId,Huella,Tipo,OcurridoEn) VALUES
      ('msg_bounce','${proveedorId}',HASHBYTES('SHA2_256','bounce'),'email.bounced',SYSUTCDATETIME()),
      ('msg_entregado','${proveedorId}',HASHBYTES('SHA2_256','entregado'),'email.delivered',SYSUTCDATETIME()),
      ('msg_rollback','${proveedorId}',HASHBYTES('SHA2_256','rollback'),'email.complained',SYSUTCDATETIME());`);
    const bounce=await aplicar('email.bounced','msg_bounce',new Date()),delivered=await aplicar('email.delivered','msg_entregado',new Date(Date.now()+1000)),queja=await aplicar('email.complained','msg_rollback',new Date());
    await ejecutar(`EXECUTE AS USER=N'${receptor}';SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;BEGIN TRANSACTION;${bounce}${delivered}COMMIT;REVERT;
      IF NOT EXISTS(SELECT 1 FROM authcom.CorreoMensajes WHERE OutboxId='${outboxId}' AND Estado='email.bounced' AND Prioridad=50)
       OR (SELECT COUNT(*) FROM authcom.CorreoBloqueos)<>1 OR (SELECT COUNT(*) FROM authcom.CorreoEventos WHERE AplicadoEn IS NOT NULL)<>2 THROW 51974,'Efectos no monotónicos/durables.',1;`);
    await assert.rejects(ejecutar(`EXECUTE AS USER=N'${receptor}';INSERT authcom.CorreoEventos(EventoId,ProveedorId,Huella,Tipo,OcurridoEn) VALUES('msg_bounce','${proveedorId}',HASHBYTES('SHA2_256','otro'),'email.failed',SYSUTCDATETIME());`),e=>e.codigosSQL.includes(2627));
    await ejecutar(`EXECUTE AS USER=N'${receptor}';BEGIN TRANSACTION;${queja}ROLLBACK;REVERT;
      IF NOT EXISTS(SELECT 1 FROM authcom.CorreoMensajes WHERE OutboxId='${outboxId}' AND Estado='email.bounced') OR EXISTS(SELECT 1 FROM authcom.CorreoEventos WHERE EventoId='msg_rollback' AND AplicadoEn IS NOT NULL) THROW 51974,'Rollback incompleto.',1;`);
    await assert.rejects(ejecutar(`EXECUTE AS USER=N'${receptor}';UPDATE dbo.Usuarios SET Estado=N'Inactivo' WHERE IdUsuario=-1;`),e=>e.codigosSQL.includes(229));
  }finally{
    await ejecutar(`IF USER_NAME()<>N'dbo' REVERT;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name IN(N'${owner}',N'${legacy}',N'${receptor}') AND principal_id NOT IN(SELECT major_id FROM sys.extended_properties WHERE class=4 AND name=N'HostFlowTestRun' AND CONVERT(nvarchar(100),value)=N'${runId}')) THROW 51940,'Principal ajeno.',1;
      BEGIN TRANSACTION;ALTER AUTHORIZATION ON SCHEMA::authcom TO dbo;DROP USER [${receptor}];DROP USER [${legacy}];DROP USER [${owner}];COMMIT;`);
  }
}));
