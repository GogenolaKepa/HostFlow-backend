const {randomUUID}=require('node:crypto');
const {crearToken,hashToken}=require('../security/comercial/credencialesTemporales');
const {ErrorSeguridad,esUsuarioHabilitado,comprobarPassword,normalizarEmail,validarCampos}=require('../security/seguridadUsuarios');
const invalido=()=>new ErrorSeguridad(400,'ENLACE_INVALIDO','El enlace no es válido o ya no está disponible.');
// Optativo: requiere propuesta20, sesión actual y reautenticación. No convierte
// correos históricos en contactos verificados, ni recupera Administradores.
class VerificacionContactoService{
  constructor({habilitado=false,repository,protector,indicePrivado,idEmpresa,origen,ahora=Date.now}={}){
    if(typeof repository?.transaccion!=='function'||typeof protector?.sellar!=='function'||typeof indicePrivado!=='function'||!Number.isSafeInteger(idEmpresa)||idEmpresa<1)throw TypeError('Verificación no acreditada.');
    const u=new URL(origen);if(u.protocol!=='https:'||u.origin!==origen)throw TypeError('Origen no acreditado.');
    Object.assign(this,{habilitado,repository,protector,indicePrivado,idEmpresa,origen,ahora});
  }
  async tx(fn){
    if(this.habilitado!==true)throw new ErrorSeguridad(503,'CONTACTOS_INACTIVOS','Verificación no disponible.');
    try{return await this.repository.transaccion(fn);}catch(e){if(e instanceof ErrorSeguridad)throw e;throw new ErrorSeguridad(503,'CUENTAS_RESULTADO_INCIERTO','No se pudo confirmar la operación. No la reenvíe automáticamente.');}
  }
  async titular(tx,actor){
    const u=Number.isSafeInteger(actor?.idUsuario)?await tx.usuario(actor.idUsuario):null;
    if(!esUsuarioHabilitado(u)||u.rol!=='Operador'||u.debeCambiarPassword||u.versionSesion!==actor.versionSesion||!await tx.empresaActiva(this.idEmpresa))throw new ErrorSeguridad(403,'SIN_PERMISO','La sesión no permite verificar este contacto.');
    return u;
  }
  async limite(tx,actor,ip,proposito){
    if(!require('node:net').isIP(ip||''))throw new ErrorSeguridad(400,'VALIDACION','Solicitud no válida.');
    const permitido=await tx.admitir({proposito,ahora:this.ahora(),ip:this.indicePrivado('ip',ip),destino:this.indicePrivado('contacto',String(actor.idUsuario)),ventanaMs:900000,maxIp:20,maxDestino:5,maxGlobal:100,cooldownMs:proposito==='verificar-contacto-solicitar'?60000:0});
    if(!permitido)throw new ErrorSeguridad(429,'LIMITE_SOLICITUDES','Demasiadas solicitudes. Intente más tarde.');
  }
  async solicitar(actor,body,{ip}={}){
    validarCampos(body,['passwordActual']);
    const previo=await this.tx(async tx=>{const u=await this.titular(tx,actor);await this.limite(tx,actor,ip,'verificar-contacto-solicitar');return u;});
    // Coste bcrypt fuera del lock transaccional; revalidación completa posterior.
    if(!await comprobarPassword(body.passwordActual,previo.passwordHash))throw new ErrorSeguridad(403,'SIN_PERMISO','No se pudo acreditar la cuenta.');
    return this.tx(async tx=>{
      const u=await this.titular(tx,actor);
      if(u.passwordHash!==previo.passwordHash||u.email!==previo.email)throw new ErrorSeguridad(403,'SIN_PERMISO','La cuenta cambió; volvé a iniciar sesión.');
      const ahora=this.ahora(),email=normalizarEmail(u.email),{token,hash}=crearToken('contacto');
      await tx.revocarVerificacionesContacto(u.idUsuario,ahora);
      const d={id:randomUUID(),hash,idEmpresa:this.idEmpresa,email,usuarioId:u.idUsuario,versionSesion:u.versionSesion,creadaEn:ahora,expiraEn:ahora+900000};
      await tx.insertarVerificacionContacto(d);
      const id=randomUUID();await tx.encolar({id,desafioId:d.id,expiraEn:d.expiraEn,sobre:this.protector.sellar({destinatario:email,plantilla:'contacto',enlace:`${this.origen}/cuenta/contacto#token=${token}`},id)});
      await tx.auditar({tipo:'CONTACTO_SOLICITADO',usuarioId:u.idUsuario,ahora});return {status:204};
    });
  }
  async vigente(tx,actor,token){
    const u=await this.titular(tx,actor),hash=hashToken(token,'contacto');
    const d=hash?await tx.desafio(hash,'contacto'):null,ahora=this.ahora();
    if(!d||d.usuarioId!==u.idUsuario||d.idEmpresa!==this.idEmpresa||d.versionSesion!==u.versionSesion||d.email!==normalizarEmail(u.email)||d.creadaEn>ahora||d.expiraEn<=ahora||d.consumidaEn!==null||d.revocadaEn!==null)throw invalido();
    return {u,d,ahora};
  }
  async validar(actor,body,{ip}={}){
    validarCampos(body,['token']);return this.tx(async tx=>{await this.limite(tx,actor,ip,'verificar-contacto-validar');await this.vigente(tx,actor,body.token);return {status:204};});
  }
  async confirmar(actor,body,{ip}={}){
    validarCampos(body,['token']);return this.tx(async tx=>{
      await this.limite(tx,actor,ip,'verificar-contacto-confirmar');const {u,d,ahora}=await this.vigente(tx,actor,body.token);
      if(!await tx.consumir(d.id,ahora))throw invalido();
      await tx.verificarContacto({usuarioId:u.idUsuario,email:d.email,ahora});
      await tx.auditar({tipo:'CONTACTO_VERIFICADO',usuarioId:u.idUsuario,desafioId:d.id,ahora});return {status:204};
    });
  }
}
module.exports={VerificacionContactoService};
