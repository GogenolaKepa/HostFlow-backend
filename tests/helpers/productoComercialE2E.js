// EXCLUSIVO DE TEST: Express y AuthService reales; persistencia serializada en
// memoria y transporte de correo ficticio. Prohibido importarlo desde producción.
const {crearEntornoComercialHttp}=require('./entornoComercialHttp');
async function crearProductoE2E({origen}={}){
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origen))throw Error('Solo loopback de laboratorio.');
  process.env.HOSTFLOW_CORS_ORIGINS=origen;
  const db=require.resolve('../../src/config/database');
  require.cache[db]={id:db,filename:db,loaded:true,exports:new Proxy({}, {get(){throw Error('SQL/Azure prohibido en E2E.');}})};
  // Controladores ajenos no forman parte de esta prueba ni se cargan sus adaptadores.
  const fs=require('node:fs'),path=require('node:path');
  for(const archivo of fs.readdirSync(path.join(__dirname,'../../src/controllers'))){
    if(!archivo.endsWith('.js')||['AuthController.js','UsuarioController.js'].includes(archivo))continue;
    const id=require.resolve('../../src/controllers/'+archivo);
    require.cache[id]={id,filename:id,loaded:true,exports:new Proxy({}, {get(){return (_req,res)=>res.status(503).json({mensaje:'Módulo ajeno al ensayo aislado.'});}})};
  }
  // Solo permite navegar desde el Dashboard real a Usuarios; no acredita su negocio.
  require.cache[require.resolve('../../src/controllers/DashboardController')].exports={
    obtenerDashboard:(_req,res)=>res.json({resumen:{propiedadesActivas:0,reservasActivas:0,huespedesRegistrados:0,ocupacionMensual:0,alertasPendientes:0},proximasReservas:[],alertas:[]}),
    obtenerHistorico:(_req,res)=>res.json({historico:[]}),
  };
  const e=await crearEntornoComercialHttp({relojReal:true});
  const {prepararContactosDelLaboratorio}=require('./contactosComercialesAislados');
  const contactos=prepararContactosDelLaboratorio(e);
  delete e.repository.filas.get(2).emailVerificadoEn;delete e.repository.filas.get(2).versionContacto;
  const {ResendCorreo}=require('../../src/security/comercial/ResendCorreo');
  const {randomBytes,randomUUID}=require('node:crypto');
  const plantillas=[];
  const proveedor=new ResendCorreo({habilitado:true,origen:'https://cuentas.example.invalid',
    remitente:'acceso@example.invalid',dominioVerificado:'example.invalid',
    obtenerSecreto:async()=>randomBytes(32).toString('hex'),transportar:async(url,opciones)=>{
      if(url!=='https://api.resend.com/emails')throw Error('Destino de correo inesperado.');
      plantillas.push(JSON.parse(opciones.body));return {status:200,json:async()=>({id:randomUUID()})};
    }});
  e.entrega.proveedor={enviar:async(payload,opciones)=>{
    const r=await proveedor.enviar(payload,opciones);e.correos.push(payload);return r;
  }};
  e.conectarAutenticacionProducto();
  const express=require('express');
  const router=express.Router();let activo=true,perderRespuesta=false,confirmaciones=0;
  router.get('/capacidades',(_req,res)=>res.json({version:1,recuperacion:activo,invitaciones:activo,contactos:activo}));
  const cuentasRouter=require('../../src/routes/cuentasComercialesAisladas').crearRouterCuentasComerciales({...e,contactos});
  router.use((req,res,next)=>{
    if(req.method==='POST'&&req.path.endsWith('/confirmar')){
      confirmaciones++;
      if(perderRespuesta){
        perderRespuesta=false;const end=res.end;
        res.end=function(){res.statusCode=503;res.removeHeader('Content-Length');res.setHeader('Content-Type','application/json');return end.call(this,JSON.stringify({codigo:'CUENTAS_RESULTADO_INCIERTO'}));};
      }
    }
    next();
  });
  router.use((req,res,next)=>activo?cuentasRouter(req,res,next):res.status(503).json({codigo:'CUENTAS_INACTIVAS'}));
  const {crearApp}=require('../../src/app');
  const app=crearApp({montajeComercial:router});
  return {...e,app,plantillas,perderConfirmacion:()=>{perderRespuesta=true;},confirmaciones:()=>confirmaciones,desactivar:()=>{activo=false;}};
}
module.exports={crearProductoE2E};
