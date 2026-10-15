const sql = require('mssql');
const UsuarioRepository = require('./UsuarioRepository');
const { RECURSO_BLOQUEO, ErrorSeguridad } = require('../security/seguridadUsuarios');
const { errorConfiguracion, CAMPOS_EMPRESA } = require('../security/validacionConfiguracion');

const MODELO = 'hostflow-configuracion-empresa-v1';
const COLUMNAS = { nombreComercial: 'NombreComercial', razonSocial: 'RazonSocial', correoContacto: 'CorreoContacto',
  telefono: 'Telefono', pais: 'Pais', provincia: 'Provincia', ciudad: 'Ciudad', direccion: 'Direccion', informacionAdicional: 'InformacionAdicional' };

class ConfiguracionRepository {
  constructor({ getPool, request, driver = sql } = {}) {
    this.driver = driver;
    this.getPool = getPool || (() => require('../config/database').poolPromise);
    this.request = request || (async () => new this.driver.Request(await this.getPool()));
    this.usuarios = new UsuarioRepository({ getPool: this.getPool, request: this.request, driver });
  }

  async comprobarModelo() {
    const req = await this.request();
    req.input('Modelo', this.driver.NVarChar(100), MODELO);
    const { recordset } = await req.query(`SELECT COUNT(*) AS cantidad FROM sys.extended_properties
      WHERE class=1 AND minor_id=0 AND name=N'HostFlowConfiguracionModelo'
      AND major_id IN (OBJECT_ID(N'dbo.Empresas',N'U'),OBJECT_ID(N'dbo.PreferenciasOperativas',N'U'))
      AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=@Modelo
      AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(@Modelo);`);
    if (recordset?.[0]?.cantidad !== 2) throw new ErrorSeguridad(503, 'MODELO_CONFIGURACION_PENDIENTE', 'La persistencia empresarial no está preparada.');
  }

  async leer(idEmpresa, tipo) {
    const req = await this.request();
    req.input('IdEmpresa', this.driver.Int, idEmpresa);
    const consulta = tipo === 'empresa'
      ? `SELECT ${Object.entries(COLUMNAS).map(([campo,columna])=>`e.${columna} AS ${campo}`).join(',')}, e.VersionRegistro AS versionRegistro
         FROM dbo.Empresas e WHERE e.IdEmpresa=@IdEmpresa AND e.Activo=1;`
      : `SELECT CONVERT(char(5),p.HoraIngreso,108) AS horaIngreso, CONVERT(char(5),p.HoraEgreso,108) AS horaEgreso,
           p.ZonaHoraria AS zonaHoraria, p.VersionRegistro AS versionRegistro
         FROM dbo.PreferenciasOperativas p JOIN dbo.Empresas e ON e.IdEmpresa=p.IdEmpresa
         WHERE p.IdEmpresa=@IdEmpresa AND e.Activo=1;`;
    const { recordset } = await req.query(consulta);
    if (!recordset?.[0]) throw new ErrorSeguridad(503, 'EMPRESA_NO_CONFIGURADA', 'La empresa y sus preferencias todavía no están disponibles.');
    return recordset[0];
  }

  async actualizar(idEmpresa, tipo, datos, revision, actor) {
    const req = await this.request();
    req.input('IdEmpresa', this.driver.Int, idEmpresa);
    req.input('Revision', this.driver.Binary(8), Buffer.from(revision,'hex'));
    req.input('Actor', this.driver.Int, actor);
    let tabla, asignaciones, filtro;
    if (tipo === 'empresa') {
      tabla = 'dbo.Empresas'; filtro = 'AND Activo=1';
      asignaciones = Object.entries(COLUMNAS).map(([campo,columna]) => {
        req.input(campo, this.driver.NVarChar(CAMPOS_EMPRESA[campo]), datos[campo] || null);
        return `${columna}=@${campo}`;
      });
    } else {
      tabla = 'dbo.PreferenciasOperativas'; filtro = 'AND EXISTS(SELECT 1 FROM dbo.Empresas e WHERE e.IdEmpresa=@IdEmpresa AND e.Activo=1)';
      req.input('HoraIngreso', this.driver.Char(5), datos.horaIngreso);
      req.input('HoraEgreso', this.driver.Char(5), datos.horaEgreso);
      asignaciones = ['HoraIngreso=CONVERT(time(0),@HoraIngreso)','HoraEgreso=CONVERT(time(0),@HoraEgreso)'];
    }
    const result = await req.query(`UPDATE ${tabla} SET ${asignaciones.join(',')},
      FechaActualizacion=SYSUTCDATETIME(),IdUsuarioActualizacion=@Actor
      OUTPUT INSERTED.VersionRegistro AS versionRegistro
      WHERE IdEmpresa=@IdEmpresa AND VersionRegistro=@Revision ${filtro};`);
    if (result.recordset?.length !== 1) throw new ErrorSeguridad(409, 'CONFIGURACION_CONFLICTO', 'Otra sesión cambió la configuración. Recargá los datos antes de guardar.');
    return this.leer(idEmpresa, tipo);
  }

  async transaccion(operacion) {
    let transaction;
    let iniciada = false;
    try {
      transaction = new this.driver.Transaction(await this.getPool());
      await transaction.begin(this.driver.ISOLATION_LEVEL.READ_COMMITTED); iniciada = true;
      const request = async () => new this.driver.Request(transaction);
      const req = await request();
      req.input('Recurso', this.driver.NVarChar(255), RECURSO_BLOQUEO);
      const { recordset } = await req.query(`DECLARE @Resultado int;
        EXEC @Resultado=sys.sp_getapplock @Resource=@Recurso,@LockMode='Exclusive',
          @LockOwner='Transaction',@LockTimeout=10000,@DbPrincipal='public';
        SELECT @Resultado AS resultado;`);
      if (![0,1].includes(recordset?.[0]?.resultado)) throw new ErrorSeguridad(409, 'OPERACION_CONCURRENTE', 'Otra operación está en curso. Reintentá.');
      const resultado = await operacion(new ConfiguracionRepository({ getPool: this.getPool, request, driver: this.driver }));
      await transaction.commit(); iniciada = false;
      return resultado;
    } catch (error) {
      if (iniciada) { try { await transaction.rollback(); } catch { /* No registrar parámetros ni errores del driver. */ } }
      throw errorConfiguracion(error);
    }
  }
}

module.exports = { ConfiguracionRepository, MODELO };
