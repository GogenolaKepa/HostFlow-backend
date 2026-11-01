const {ErrorSeguridad}=require('../security/seguridadUsuarios');
// Decora el mismo puerto serializable/applock existente. No crea otro pool.
class ContactosVerificadosSql{
  constructor({repository,habilitado=false}={}){
    if(typeof repository?.transaccion!=='function')throw TypeError('Puerto obligatorio.');
    Object.assign(this,{repository,habilitado});
  }
  async transaccion(fn){
    if(this.habilitado!==true)throw new ErrorSeguridad(503,'CONTACTOS_INACTIVOS','Verificación no disponible.');
    return this.repository.transaccion(async tx=>{
      const r=await tx.q("SELECT CONVERT(nvarchar(80),value) AS modelo FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthContacto';");
      if(r.recordset[0]?.modelo!=='authcom-contacto-v1')throw new ErrorSeguridad(503,'CONTACTOS_INACTIVOS','Modelo de verificación no acreditado.');
      const port=Object.create(tx);
      port.revocarVerificacionesContacto=(usuario,ahora)=>tx.q("UPDATE authcom.Desafios SET RevocadaEn=@ahora WHERE IdEmpresa=@empresa AND IdUsuario=@usuario AND Proposito='contacto' AND RevocadaEn IS NULL AND ConsumidaEn IS NULL;",{empresa:tx.idEmpresa,usuario,ahora:new Date(ahora)});
      port.insertarVerificacionContacto=d=>{
        if(d.idEmpresa!==tx.idEmpresa||!/^[a-f0-9]{64}$/.test(d.hash))throw Error('Contexto no acreditado.');
        return tx.q(`INSERT authcom.Desafios(Id,Hash,Proposito,IdEmpresa,Email,IdUsuario,Documento,CreadaEn,ExpiraEn,Pendiente)
          VALUES(@id,@hash,'contacto',@empresa,@email,@usuario,@doc,@creada,@expira,0);`,
        {id:d.id,hash:Buffer.from(d.hash,'hex'),empresa:d.idEmpresa,email:d.email,usuario:d.usuarioId,doc:JSON.stringify({versionSesion:d.versionSesion}),creada:new Date(d.creadaEn),expira:new Date(d.expiraEn)});
      };
      port.verificarContacto=async({usuarioId,email,ahora})=>{
        const previo=await tx.q('SELECT VersionContacto FROM authcom.Contactos WITH(UPDLOCK,HOLDLOCK) WHERE IdUsuario=@id;',{id:usuarioId});
        const version=previo.recordset[0]?.VersionContacto;
        if(version!==undefined&&(!Number.isSafeInteger(version)||version<1||version>=2147483647))throw Error('Versión no disponible.');
        await tx.q(version===undefined?'INSERT authcom.Contactos(IdUsuario,Email,VersionContacto,VerificadoEn) VALUES(@id,@email,1,@ahora);':
          'UPDATE authcom.Contactos SET Email=@email,VersionContacto=VersionContacto+1,VerificadoEn=@ahora,RevocadoEn=NULL WHERE IdUsuario=@id;',
        {id:usuarioId,email,ahora:new Date(ahora)});
        // Contacto renovado invalida recuperaciones ligadas a la versión anterior.
        await tx.revocarRecuperaciones(usuarioId,ahora);
      };
      return fn(port);
    });
  }
}
module.exports={ContactosVerificadosSql};
