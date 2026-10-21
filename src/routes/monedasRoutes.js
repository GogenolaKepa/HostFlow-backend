const router=require('express').Router();
const servicio=require('../services/MonedasService');
const acuerdos=require('../services/AcuerdoMonetarioService');
async function ejecutar(req,res,operacion,consultaPermitida=false) {
 res.set('Cache-Control','no-store');
 try {
  if(!consultaPermitida&&Object.keys(req.query).length)return res.status(400).json({mensaje:'La consulta no admite parámetros.'});
  return res.json(await operacion());
 }catch(error){
  const status=error.codigo==='OPERACION_RESULTADO_INCIERTO'?500:error.status || (error.code?503:400);
  return res.status(status).json({codigo:error.codigo,mensaje:error.codigo?error.message:'No se pudo completar la operación de monedas. Revisá los datos o recargá la consulta.'});
 }
}
router.get('/estado',(req,res)=>ejecutar(req,res,()=>servicio.estado()));
router.get('/configuracion',(req,res)=>ejecutar(req,res,async()=>({configuracion:await servicio.configuracion()})));
router.put('/configuracion',(req,res)=>ejecutar(req,res,async()=>({configuracion:await servicio.guardar(req.usuario,req.body)})));
router.post('/consultar-bcra',(req,res)=>ejecutar(req,res,async()=>{
 if(!req.body || req.body.confirmar!==true || Object.keys(req.body).length!==1)throw Object.assign(new Error('Confirmá la consulta a BCRA.'),{status:400,codigo:'MONEDAS_CONFIRMACION'});
 try {return {cotizacion:await servicio.cotizaciones.consultar(),persistida:false};}
 catch {throw Object.assign(new Error('La fuente oficial no está disponible. No se usó una cotización de reemplazo.'),{status:503,codigo:'MONEDAS_FUENTE_NO_DISPONIBLE'});}
}));
router.get('/tarifas',(req,res)=>ejecutar(req,res,async()=>({tarifas:await servicio.tarifas()})));
router.put('/tarifas/:id',(req,res)=>ejecutar(req,res,async()=>({tarifa:await servicio.guardarTarifa(req.usuario,Number(req.params.id),req.body)})));
router.post('/propiedades',(req,res)=>ejecutar(req,res,async()=>{const propiedad=await servicio.crearPropiedad(req.usuario,req.body);res.status(201);return {propiedad};}));
router.get('/alertas',(req,res)=>ejecutar(req,res,()=>servicio.alertas()));
router.get('/reservas/:id/acuerdo',(req,res)=>ejecutar(req,res,async()=>({acuerdo:await acuerdos.obtener(Number(req.params.id))})));
router.put('/reservas/:id/acuerdo',(req,res)=>ejecutar(req,res,async()=>({acuerdo:await acuerdos.guardar(Number(req.params.id),req.usuario,req.body)})));
router.post('/reservas/:id/fijacion',(req,res)=>ejecutar(req,res,async()=>({acuerdo:await acuerdos.fijar(Number(req.params.id),req.usuario,req.body)})));
router.get('/resumen',(req,res)=>ejecutar(req,res,()=>acuerdos.resumen(req.query),true));
module.exports=router;
