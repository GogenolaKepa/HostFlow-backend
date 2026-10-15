const servicio = require('../services/ConfiguracionService');
const AuthService = require('../services/AuthService');
const { ErrorSeguridad } = require('../security/seguridadUsuarios');
const { errorConfiguracion } = require('../security/validacionConfiguracion');

async function ejecutar(req,res,operacion) {
  res.set('Cache-Control','no-store');
  try {
    // No existe configuración empresarial mock ni selección de destino cliente.
    AuthService.exigirSQL();
    if (Object.keys(req.query).length) throw new ErrorSeguridad(400,'CAMPO_NO_PERMITIDO','La consulta no admite parámetros.');
    return res.json(await operacion());
  } catch(error) {
    const seguro = error?.codigo === 'GESTION_SQL_PENDIENTE'
      ? new ErrorSeguridad(503,'CONFIGURACION_SQL_REQUERIDA','La configuración empresarial requiere autenticación SQL y persistencia activada.')
      : errorConfiguracion(error);
    return res.status(seguro.status).json({ mensaje: seguro.message, codigo: seguro.codigo });
  }
}
module.exports = {
  empresa: (req,res) => ejecutar(req,res,async()=>({empresa:await servicio.obtener('empresa'),estado:servicio.estado()})),
  operativas: (req,res) => ejecutar(req,res,async()=>({preferencias:await servicio.obtener('operativas'),estado:servicio.estado()})),
  guardarEmpresa: (req,res) => ejecutar(req,res,async()=>({empresa:await servicio.guardar(req.usuario,'empresa',req.body)})),
  guardarOperativas: (req,res) => ejecutar(req,res,async()=>({preferencias:await servicio.guardar(req.usuario,'operativas',req.body)})),
  predeterminados: (req,res) => ejecutar(req,res,async()=>{
    const {horaIngreso,horaEgreso,zonaHoraria}=await servicio.obtener('operativas');
    return {predeterminados:{horaIngreso,horaEgreso,zonaHoraria}};
  }),
};
