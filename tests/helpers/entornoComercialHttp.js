// LABORATORIO: fixtures en memoria; jamás importar desde app/server operativos.
const express=require('express');
const {randomBytes,randomUUID}=require('node:crypto');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const {AuthService}=require('../../src/services/AuthService');
const {AutenticacionComercialService}=require('../../src/services/AutenticacionComercialService');
const {IngresoRecuperacionService}=require('../../src/services/IngresoRecuperacionService');
const {EntregaCorreoSeguridad}=require('../../src/security/comercial/EntregaCorreoSeguridad');
const {crearProtectorCorreo,crearIndicePrivado}=require('../../src/security/comercial/credencialesTemporales');
const {crearRouterCuentasComerciales}=require('../../src/routes/cuentasComercialesAisladas');
const {CuentasComercialesAisladas}=require('./cuentasComercialesAisladas');
async function crearEntornoComercialHttp({relojReal=false}={}){
  class Almacen extends CuentasComercialesAisladas {
    constructor(){super();this.ingresos=new Map();this.ingresoFallos=new Map();}
    async transaccion(fn){return super.transaccion(async tx=>{const previo=structuredClone({ingresos:this.ingresos,ingresoFallos:this.ingresoFallos});try{return await fn(tx);}catch(e){Object.assign(this,previo);throw e;}});}
    async encolarIngreso(v){this.ingresos.set(v.id,{...structuredClone(v),estado:'pendiente'});}
    async reservarIngreso({ahora,lease}){for(const i of this.ingresos.values()){
      const f=this.ingresoFallos.get(i.id);if(i.estado!=='pendiente'||f?.estado==='cuarentena'||i.leaseHasta>ahora)continue;
      if(i.intentos>=3||i.intentos>0&&i.expiraEn<=ahora){this.ingresoFallos.set(i.id,{intentos:i.intentos,estado:'cuarentena',codigo:'TRANSITORIO',proxima:ahora});continue;}
      if(f?.proxima>ahora)continue;if(i.expiraEn<=ahora){i.estado='descartada';i.sobre=null;continue;}
      i.intentos=(i.intentos||0)+1;i.lease=lease;i.leaseHasta=ahora+120000;return {id:i.id};}return null;}
    async leerIngresoReservado(id,lease){const i=this.ingresos.get(id);return i?.estado==='pendiente'&&i.lease===lease&&i.leaseHasta>ahora()&&i.expiraEn>ahora()?structuredClone(i):null;}
    async registrarFalloIngreso({id,lease,codigo,permanente=false}){const i=this.ingresos.get(id);if(i?.estado!=='pendiente'||i.lease!==lease||i.leaseHasta<=ahora())return {estado:'resultado-incierto'};const intentos=i.intentos,cuarentena=permanente||intentos>=3;this.ingresoFallos.set(id,{intentos,codigo,estado:cuarentena?'cuarentena':'reintento',proxima:ahora()+(intentos===1?60000:300000)});i.lease=null;i.leaseHasta=null;return {estado:cuarentena?'cuarentena':'reintento-programado',intentos};}
    async finalizarIngreso(id,_ahora,lease){const i=this.ingresos.get(id);if(!i||i.estado!=='pendiente'||i.lease!==lease||i.leaseHasta<=ahora()||i.expiraEn<=ahora())return false;i.estado='procesada';i.sobre=null;i.lease=null;i.leaseHasta=null;return true;}
    async invitacionesPorEmpresa(id,_ahora,pagina=1){return [...this.desafios.values()].filter(d=>d.idEmpresa===id&&d.proposito==='invitacion').reverse().slice((pagina-1)*50,(pagina-1)*50+51).map(d=>structuredClone(d));}
  }
  const repository=new Almacen(),secret=randomBytes(32).toString('hex');let tiempo=Date.now(),desfase=0;
  const ahora=()=>relojReal?Date.now()+desfase:tiempo;
  const admin=await repository.agregar({id:1}),operador=await repository.agregar({id:2,rol:'Operador'});
  Object.assign(repository.filas.get(2),{emailVerificadoEn:new Date(tiempo-60000).toISOString(),versionContacto:1});
  const protector=crearProtectorCorreo({clave:randomBytes(32),keyId:'lab-'+randomUUID()});
  const cuentas=new AutenticacionComercialService({repository,protector,indicePrivado:crearIndicePrivado(randomBytes(32)),idEmpresa:1,origen:'https://cuentas.example.invalid',ahora,hashPassword:p=>bcrypt.hash(p,4)});
  const ingreso=new IngresoRecuperacionService({repository,protector,indicePrivado:crearIndicePrivado(randomBytes(32)),cuentas,ahora});
  const correos=[];let falloCorreo=false;
  const entrega=new EntregaCorreoSeguridad({repository,protector,ahora,proveedor:{enviar:async m=>{if(falloCorreo)throw Error('fallo ficticio');correos.push(m);}}});
  const auth=new AuthService({origen:'sql',repository,secret:()=>secret});
  let sesionAdmin=await auth.login(admin.usuario.email,admin.password),sesionOperador=await auth.login(operador.usuario.email,operador.password);
  async function autenticar(req,res,next){try{const token=req.get('Authorization')?.replace(/^Bearer /,'');const p=jwt.verify(token,secret,{algorithms:['HS256']});const u=await auth.obtenerUsuarioSesion(p.idUsuario,p);if(!u)return res.status(401).json({mensaje:'Sesión inválida'});req.usuario=u;next();}catch{return res.status(401).json({mensaje:'Sesión inválida'});}}
  const app=express();app.disable('x-powered-by');app.set('trust proxy',false);
  const router=crearRouterCuentasComerciales({cuentas,ingreso,autenticar});
  app.use('/api/cuentas-comerciales',router);
  return {app,router,repository,cuentas,ingreso,entrega,auth,correos,admin,operador,autenticar,
    // Solo para el E2E del producto: JWT efímero compartido con el middleware REAL.
    conectarAutenticacionProducto(){
      process.env.JWT_SECRET=secret;
      const singleton=require('../../src/services/AuthService');
      Object.assign(singleton,{origen:auth.origen,repository,cuentas:auth.cuentas});
      for(const metodo of ['login','obtenerUsuarioSesion','perfil'])singleton[metodo]=auth[metodo].bind(auth);
    },
    tokenAdmin:()=>sesionAdmin.token,tokenOperador:()=>sesionOperador.token,
    avanzar:ms=>{if(relojReal)desfase+=ms;else tiempo+=ms;},fallarCorreo:v=>{falloCorreo=v;},
    async procesar(){await ingreso.procesarUna();for(let n=0;n<5;n++){const r=await entrega.procesarUna();if(r.estado==='sin-pendientes')break;}},
    tokenCorreo:()=>new URLSearchParams(new URL(correos.at(-1).enlace).hash.slice(1)).get('token'),
  };
}
module.exports={crearEntornoComercialHttp};
