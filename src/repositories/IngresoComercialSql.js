const {ErrorSeguridad}=require('../security/seguridadUsuarios');

// Decorador de puerto transaccional; sin conexión propia y cerrado por defecto.
class IngresoComercialSql {
  constructor({repository,habilitado=false}={}) {
    if(typeof repository?.transaccion!=='function')throw new TypeError('Repositorio SQL explícito obligatorio.');
    Object.assign(this,{repository,habilitado});
  }
  async transaccion(fn) {
    if(this.habilitado!==true)throw new ErrorSeguridad(503,'INGRESO_COMERCIAL_INACTIVO','Ingreso comercial inactivo.');
    return this.repository.transaccion(async tx=>{
      const marca=await tx.q("SELECT CONVERT(nvarchar(80),value) AS modelo FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthIngreso';");
      if(marca.recordset[0]?.modelo!=='authcom-ingreso-v1')throw Error('Esquema de ingreso no validado.');
      const resiliencia=await tx.q("SELECT CONVERT(nvarchar(80),value) AS modelo FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthResiliencia';");
      if(resiliencia.recordset[0]?.modelo!=='authcom-resiliencia-v1')throw Error('Resiliencia SQL no validada.');
      const scope=Object.create(tx);
      scope.encolarIngreso=v=>{
        const {keyId,iv,tag,contenido}=v.sobre;
        return tx.q(`INSERT authcom.Ingresos(Id,CreadaEn,ExpiraEn,Sobre,Estado)
          VALUES(@id,@creada,@expira,@sobre,'pendiente');`,{id:v.id,creada:new Date(v.creadaEn),expira:new Date(v.expiraEn),sobre:JSON.stringify({keyId,iv,tag,contenido})});
      };
      scope.reservarIngreso=async({lease,leaseMs=120000,maxIntentos=3}={})=>{
        if(typeof lease!=='string'||!/^[a-f0-9-]{36}$/i.test(lease)||leaseMs!==120000||maxIntentos!==3)throw Error('Lease de ingreso inválido.');
        await tx.q("UPDATE TOP(500) authcom.Ingresos SET Sobre=NULL,Estado='descartada' WHERE Estado='pendiente' AND Intentos=0 AND ExpiraEn<=SYSUTCDATETIME() AND NOT EXISTS(SELECT 1 FROM authcom.IngresoFallos f WHERE f.Id=Ingresos.Id AND f.Estado='cuarentena');");
        await tx.q(`INSERT authcom.IngresoFallos(Id,Intentos,Proxima,Estado,Codigo,ActualizadaEn)
          SELECT i.Id,i.Intentos,SYSUTCDATETIME(),'cuarentena','TRANSITORIO',SYSUTCDATETIME() FROM authcom.Ingresos i WITH (UPDLOCK,HOLDLOCK)
          WHERE i.Estado='pendiente' AND (i.Intentos>=3 OR i.Intentos>0 AND i.ExpiraEn<=SYSUTCDATETIME()) AND (i.LeaseHasta IS NULL OR i.LeaseHasta<=SYSUTCDATETIME())
           AND NOT EXISTS(SELECT 1 FROM authcom.IngresoFallos f WITH (UPDLOCK,HOLDLOCK) WHERE f.Id=i.Id);
          UPDATE f SET Estado='cuarentena',Intentos=i.Intentos,ActualizadaEn=SYSUTCDATETIME() FROM authcom.IngresoFallos f JOIN authcom.Ingresos i ON i.Id=f.Id
          WHERE i.Estado='pendiente' AND (i.Intentos>=3 OR i.Intentos>0 AND i.ExpiraEn<=SYSUTCDATETIME()) AND (i.LeaseHasta IS NULL OR i.LeaseHasta<=SYSUTCDATETIME());`);
        const r=await tx.q(`;WITH siguiente AS (SELECT TOP(1) i.* FROM authcom.Ingresos i WITH (UPDLOCK,HOLDLOCK)
          WHERE i.Estado='pendiente' AND i.ExpiraEn>SYSUTCDATETIME() AND i.Intentos<3 AND (i.LeaseHasta IS NULL OR i.LeaseHasta<=SYSUTCDATETIME())
           AND NOT EXISTS(SELECT 1 FROM authcom.IngresoFallos f WITH (HOLDLOCK) WHERE f.Id=i.Id AND (f.Estado='cuarentena' OR f.Proxima>SYSUTCDATETIME())) ORDER BY i.CreadaEn,i.Id)
          UPDATE siguiente SET Intentos=Intentos+1,Lease=@lease,LeaseHasta=DATEADD(second,120,SYSUTCDATETIME()) OUTPUT inserted.Id AS id;`,{lease});
        return r.recordset[0]||null;
      };
      scope.leerIngresoReservado=async(id,lease)=>{
        const r=await tx.q("SELECT Sobre FROM authcom.Ingresos WITH (UPDLOCK,HOLDLOCK) WHERE Id=@id AND Lease=@lease AND Estado='pendiente' AND LeaseHasta>SYSUTCDATETIME() AND ExpiraEn>SYSUTCDATETIME();",{id,lease});
        if(!r.recordset.length)return null;
        try{return {id,sobre:JSON.parse(r.recordset[0].Sobre)};}catch{return {id,sobreInvalido:true};}
      };
      scope.registrarFalloIngreso=async({id,lease,codigo,permanente=false})=>{
        if(!['SOBRE_INVALIDO','PAYLOAD_INVALIDO','TRANSITORIO','CLAVE_NO_DISPONIBLE'].includes(codigo))throw Error('Código de fallo incompatible.');
        const pendiente=await tx.q("SELECT Id,Intentos FROM authcom.Ingresos WITH (UPDLOCK,HOLDLOCK) WHERE Id=@id AND Lease=@lease AND Estado='pendiente' AND LeaseHasta>SYSUTCDATETIME();",{id,lease});
        if(!pendiente.recordset.length)return {estado:'resultado-incierto'};
        const previo=await tx.q('SELECT Intentos FROM authcom.IngresoFallos WITH (UPDLOCK,HOLDLOCK) WHERE Id=@id;',{id});
        const intentos=pendiente.recordset[0].Intentos,cuarentena=permanente||intentos>=3;
        const valores={id,intentos,codigo,estado:cuarentena?'cuarentena':'reintento',segundos:intentos===1?60:300};
        await tx.q(previo.recordset.length
          ?'UPDATE authcom.IngresoFallos SET Intentos=@intentos,Estado=@estado,Codigo=@codigo,Proxima=DATEADD(second,@segundos,SYSUTCDATETIME()),ActualizadaEn=SYSUTCDATETIME() WHERE Id=@id;'
          :'INSERT authcom.IngresoFallos(Id,Intentos,Estado,Codigo,Proxima,ActualizadaEn) VALUES(@id,@intentos,@estado,@codigo,DATEADD(second,@segundos,SYSUTCDATETIME()),SYSUTCDATETIME());',valores);
        await tx.q('UPDATE authcom.Ingresos SET Lease=NULL,LeaseHasta=NULL WHERE Id=@id AND Lease=@lease;',{id,lease});
        return {estado:cuarentena?'cuarentena':'reintento-programado',intentos};
      };
      scope.finalizarIngreso=async(id,_ahora,lease)=>{const r=await tx.q("UPDATE authcom.Ingresos SET Estado='procesada',Sobre=NULL,ProcesadaEn=SYSUTCDATETIME(),Lease=NULL,LeaseHasta=NULL WHERE Id=@id AND Lease=@lease AND LeaseHasta>SYSUTCDATETIME() AND Estado='pendiente' AND ExpiraEn>SYSUTCDATETIME();",{id,lease});return r.rowsAffected[0]===1;};
      scope.invitacionesPorEmpresa=async(idEmpresa,_ahora,pagina=1)=>{
        if(idEmpresa!==tx.idEmpresa)throw Error('Contexto incompatible.');
        const r=await tx.q(`SELECT Id AS id,Email AS email,Documento AS doc,ExpiraEn AS expira,
          ConsumidaEn AS consumida,RevocadaEn AS revocada FROM authcom.Desafios WITH (HOLDLOCK)
          WHERE IdEmpresa=@empresa AND Proposito='invitacion' ORDER BY CreadaEn DESC,Id
          OFFSET @desde ROWS FETCH NEXT 51 ROWS ONLY;`,{empresa:idEmpresa,desde:(pagina-1)*50});
        return r.recordset.map(d=>({id:d.id,email:d.email,nombre:JSON.parse(d.doc).nombre,
          expiraEn:new Date(d.expira).getTime(),consumidaEn:d.consumida===null?null:new Date(d.consumida).getTime(),revocadaEn:d.revocada===null?null:new Date(d.revocada).getTime()}));
      };
      return fn(scope);
    });
  }
}
module.exports={IngresoComercialSql};
