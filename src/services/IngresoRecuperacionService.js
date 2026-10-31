const { randomUUID } = require('node:crypto');
const { isIP } = require('node:net');
const { validarCampos, normalizarEmail, ErrorSeguridad } = require('../security/seguridadUsuarios');
const { RESPUESTA_NEUTRAL } = require('./AutenticacionComercialService');

class IngresoRecuperacionService {
  constructor({ repository, protector, indicePrivado, cuentas, ahora = Date.now } = {}) {
    if (!repository?.transaccion || !protector?.sellar || !protector?.abrir || !indicePrivado || !cuentas?.procesarSolicitudRecuperacion) throw new TypeError('Faltan puertos de ingreso explícitos.');
    Object.assign(this,{ repository,protector,indicePrivado,cuentas,ahora });
  }
  async limitar(ip) {
    if (!isIP(ip || '')) throw new ErrorSeguridad(400,'SOLICITUD_INVALIDA','Solicitud no válida.');
    const clave=this.indicePrivado('ingreso-ip',ip);
    const permitida=await this.repository.transaccion(tx=>tx.admitir({proposito:'http-cuentas',ahora:this.ahora(),ip:clave,destino:clave,
      ventanaMs:900000,maxIp:40,maxDestino:40,maxGlobal:500,cooldownMs:0}));
    if(!permitida) throw new ErrorSeguridad(429,'LIMITE_SOLICITUDES','Demasiadas solicitudes.');
  }
  async solicitar(body,{ip}) {
    validarCampos(body,['email']);
    let email;try { email=normalizarEmail(body.email); } catch { return {...RESPUESTA_NEUTRAL}; }
    const id=randomUUID();
    // Mismo camino para todo correo sintácticamente válido: no buscar usuarios aquí.
    await this.repository.transaccion(tx=>tx.encolarIngreso({id,creadaEn:this.ahora(),expiraEn:this.ahora()+900000,
      sobre:this.protector.sellar({email,ip},id)}));
    return {...RESPUESTA_NEUTRAL};
  }
  async procesarUna() {
    const lease=randomUUID();let id;
    const reservado=await this.repository.transaccion(tx=>tx.reservarIngreso({ahora:this.ahora(),lease,leaseMs:120000,maxIntentos:3}));
    if(!reservado)return {estado:'sin-pendientes'};
    id=reservado.id;
    try{return await this.repository.transaccion(async tx=>{
      const ingreso=await tx.leerIngresoReservado(id,lease);
      if(!ingreso)return {estado:'resultado-incierto'};
      const cuarentena=codigo=>tx.registrarFalloIngreso({id,lease,codigo,permanente:true});
      if(ingreso.sobreInvalido)return cuarentena('SOBRE_INVALIDO');
      let payload;
      try{payload=this.protector.abrir(ingreso.sobre,ingreso.id);}
      catch(e){
        if(e.codigo==='SOBRE_CORREO_INVALIDO')return cuarentena('SOBRE_INVALIDO');
        if(e.codigo==='CLAVE_CORREO_NO_DISPONIBLE')return cuarentena('CLAVE_NO_DISPONIBLE');
        throw e;
      }
      try{
        if(!payload||typeof payload!=='object'||Object.keys(payload).sort().join(',')!=='email,ip'||!isIP(payload.ip||''))return cuarentena('PAYLOAD_INVALIDO');
        payload.email=normalizarEmail(payload.email);
      }catch{return cuarentena('PAYLOAD_INVALIDO');}
      await this.cuentas.procesarSolicitudRecuperacion(tx,payload.email,payload.ip);
      if(await tx.finalizarIngreso(ingreso.id,this.ahora(),lease)!==true) throw Error('No se pudo consumir el ingreso.');
      return {estado:'procesada'};
    });}catch(e){
      // Solo un rollback confirmado y explícitamente clasificable admite backoff.
      // Un commit/resultado incierto se propaga al supervisor y cierra el montaje.
      if(id&&e.codigo==='AUTH_TRANSACCION_REVERTIDA'&&e.reintentable===true){
        return this.repository.transaccion(tx=>tx.registrarFalloIngreso({id,lease,codigo:'TRANSITORIO'}));
      }
      throw e;
    }
  }
}
module.exports={IngresoRecuperacionService};
