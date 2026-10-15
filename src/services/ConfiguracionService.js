const { contextoEmpresa, exigirEscrituraConfiguracion } = require('../config/configuracionEmpresa');
const { ConfiguracionRepository } = require('../repositories/ConfiguracionRepository');
const { ErrorSeguridad, esUsuarioHabilitado, sesionInvalida } = require('../security/seguridadUsuarios');
const { validarEmpresa, validarOperativas, dtoEmpresa, dtoOperativas, errorConfiguracion } = require('../security/validacionConfiguracion');

class ConfiguracionService {
  constructor({ repository = new ConfiguracionRepository(), contexto = contextoEmpresa, comprobarEscritura = exigirEscrituraConfiguracion } = {}) {
    this.repository = repository; this.contexto = contexto; this.comprobarEscritura = comprobarEscritura;
  }
  estado() {
    try { this.comprobarEscritura(); return { persistencia: 'sql', soloLectura: false }; }
    catch (error) {
      if (error?.codigo === 'CONFIGURACION_SOLO_LECTURA') return { persistencia: 'sql', soloLectura: true };
      throw error;
    }
  }
  async obtener(tipo) {
    const { idEmpresa } = this.contexto();
    try {
      await this.repository.comprobarModelo();
      const row = await this.repository.leer(idEmpresa, tipo);
      return tipo === 'empresa' ? dtoEmpresa(row) : dtoOperativas(row);
    } catch(error) { throw errorConfiguracion(error); }
  }
  async guardar(actor, tipo, body) {
    const { idEmpresa } = this.contexto();
    this.comprobarEscritura();
    const { datos, revision } = tipo === 'empresa' ? validarEmpresa(body) : validarOperativas(body);
    return this.repository.transaccion(async tx => {
      const actual = await tx.usuarios.obtener(actor.idUsuario);
      if (!esUsuarioHabilitado(actual) || actual.versionSesion !== actor.versionSesion) throw sesionInvalida();
      if (actual.debeCambiarPassword) throw new ErrorSeguridad(403,'PASSWORD_CHANGE_REQUIRED','Debe cambiar su contraseña para continuar.');
      if (actual.rol !== 'Administrador') throw new ErrorSeguridad(403,'SIN_PERMISO','No tiene permiso para modificar la configuración empresarial.');
      await tx.comprobarModelo();
      const row = await tx.actualizar(idEmpresa, tipo, datos, revision, actor.idUsuario);
      return tipo === 'empresa' ? dtoEmpresa(row) : dtoOperativas(row);
    });
  }
}
module.exports = new ConfiguracionService();
module.exports.ConfiguracionService = ConfiguracionService;
