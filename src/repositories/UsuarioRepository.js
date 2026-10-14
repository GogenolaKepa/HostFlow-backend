const sql = require("mssql");
const RolRepository = require("./RolRepository");
const { RECURSO_BLOQUEO, ErrorSeguridad, errorPersistencia } = require("../security/seguridadUsuarios");

const COLUMNAS = `u.IdUsuario AS idUsuario, u.Nombre AS nombre, u.Email AS email,
  u.Estado AS estado, r.Nombre AS rol, r.Activo AS rolActivo,
  u.DebeCambiarPassword AS debeCambiarPassword, u.VersionSesion AS versionSesion,
  u.VersionRegistro AS versionRegistro, u.FechaCreacion AS fechaCreacion,
  u.FechaActualizacion AS fechaActualizacion`;

class UsuarioRepository {
  constructor({ getPool, request, driver = sql } = {}) {
    this.driver = driver;
    this.getPool = getPool || (() => require("../config/database").poolPromise);
    this.request = request || (async () => new this.driver.Request(await this.getPool()));
    this.roles = new RolRepository({ request: this.request, driver: this.driver });
  }

  async buscarPorEmail(email) {
    const req = await this.request();
    req.input("Email", this.driver.NVarChar(254), email);
    const { recordset } = await req.query(`SELECT ${COLUMNAS}, u.PasswordHash AS passwordHash
      FROM dbo.Usuarios u JOIN dbo.Roles r ON r.IdRol = u.IdRol
      WHERE u.EmailNormalizado = LOWER(LTRIM(RTRIM(@Email)));`);
    return recordset[0] || null;
  }

  async obtener(id, { credenciales = false } = {}) {
    const req = await this.request();
    req.input("IdUsuario", this.driver.Int, id);
    const { recordset } = await req.query(`SELECT ${COLUMNAS}${credenciales ? ", u.PasswordHash AS passwordHash" : ""}
      FROM dbo.Usuarios u JOIN dbo.Roles r ON r.IdRol = u.IdRol WHERE u.IdUsuario = @IdUsuario;`);
    return recordset[0] || null;
  }

  async listar({ busqueda = "", estado = "", pagina = 1, limite = 25 } = {}) {
    const req = await this.request();
    const patron = `%${busqueda.replace(/[~%_\[]/g, (c) => `~${c}`)}%`;
    req.input("Busqueda", this.driver.NVarChar(512), patron);
    req.input("Estado", this.driver.NVarChar(10), estado);
    req.input("Desde", this.driver.Int, (pagina - 1) * limite);
    req.input("Limite", this.driver.Int, limite);
    const filtro = `(@Estado = N'' OR u.Estado = @Estado)
      AND (u.Nombre LIKE @Busqueda ESCAPE '~' OR u.Email LIKE @Busqueda ESCAPE '~')`;
    const { recordsets } = await req.query(`
      SELECT ${COLUMNAS} FROM dbo.Usuarios u JOIN dbo.Roles r ON r.IdRol = u.IdRol
      WHERE ${filtro} ORDER BY u.IdUsuario DESC OFFSET @Desde ROWS FETCH NEXT @Limite ROWS ONLY;
      SELECT COUNT(*) AS total FROM dbo.Usuarios u WHERE ${filtro};`);
    return { usuarios: recordsets[0], total: recordsets[1][0].total, pagina, limite };
  }

  async contarAdministradoresActivos() {
    const req = await this.request();
    const { recordset } = await req.query(`SELECT COUNT(*) AS cantidad
      FROM dbo.Usuarios u JOIN dbo.Roles r ON r.IdRol = u.IdRol
      WHERE u.Estado = N'Activo' AND r.Activo = 1
        AND r.Nombre COLLATE Latin1_General_100_BIN2 = N'Administrador'
        AND DATALENGTH(r.Nombre) = DATALENGTH(N'Administrador');`);
    return recordset[0].cantidad;
  }

  async estaVacia() {
    const req = await this.request();
    const { recordset } = await req.query("SELECT TOP (1) IdUsuario FROM dbo.Usuarios WITH (UPDLOCK, HOLDLOCK);");
    return recordset.length === 0;
  }

  async crear({ nombre, email, passwordHash, idRol, actor = null }) {
    const req = await this.request();
    req.input("Nombre", this.driver.NVarChar(120), nombre);
    req.input("Email", this.driver.NVarChar(254), email);
    req.input("Hash", this.driver.VarChar(255), passwordHash);
    req.input("IdRol", this.driver.Int, idRol);
    req.input("Actor", this.driver.Int, actor);
    const { recordset } = await req.query(`
      INSERT INTO dbo.Usuarios (Nombre, Email, PasswordHash, IdRol, IdUsuarioCreacion, IdUsuarioActualizacion)
      OUTPUT INSERTED.IdUsuario AS idUsuario
      VALUES (@Nombre, @Email, @Hash, @IdRol, @Actor, @Actor);`);
    return this.obtener(recordset[0].idUsuario);
  }

  async actualizar(id, revision, cambios, actor, revocar = false) {
    // La lista de columnas esta cerrada en el repositorio; ningun nombre llega del cliente.
    const tipos = { nombre: ["Nombre", this.driver.NVarChar(120)], email: ["Email", this.driver.NVarChar(254)],
      idRol: ["IdRol", this.driver.Int], estado: ["Estado", this.driver.NVarChar(10)],
      passwordHash: ["PasswordHash", this.driver.VarChar(255)], debeCambiarPassword: ["DebeCambiarPassword", this.driver.Bit] };
    const req = await this.request();
    req.input("IdUsuario", this.driver.Int, id);
    req.input("Revision", this.driver.Binary(8), Buffer.from(revision, "hex"));
    req.input("Actor", this.driver.Int, actor);
    const asignaciones = [];
    for (const [campo, valor] of Object.entries(cambios)) {
      if (!Object.hasOwn(tipos, campo)) throw new Error("Campo interno no admitido.");
      const [columna, tipo] = tipos[campo];
      req.input(campo, tipo, valor);
      asignaciones.push(`${columna} = @${campo}`);
    }
    if (revocar) asignaciones.push("VersionSesion = VersionSesion + 1");
    if (Object.hasOwn(cambios, "passwordHash")) asignaciones.push("FechaCambioPassword = SYSUTCDATETIME()");
    asignaciones.push("FechaActualizacion = SYSUTCDATETIME()", "IdUsuarioActualizacion = @Actor");
    const resultado = await req.query(`UPDATE dbo.Usuarios SET ${asignaciones.join(", ")}
      WHERE IdUsuario = @IdUsuario AND VersionRegistro = @Revision;`);
    if (resultado.rowsAffected[0] !== 1) {
      throw new ErrorSeguridad(409, "REVISION_VENCIDA", "La cuenta cambió. Recargue los datos.");
    }
    return this.obtener(id);
  }

  async transaccionSeguridad(operacion) {
    let transaction;
    let iniciada = false;
    try {
      transaction = new this.driver.Transaction(await this.getPool());
      await transaction.begin(this.driver.ISOLATION_LEVEL.READ_COMMITTED);
      iniciada = true;
      const request = () => Promise.resolve(new this.driver.Request(transaction));
      const lock = await request();
      lock.input("Recurso", this.driver.NVarChar(255), RECURSO_BLOQUEO);
      const { recordset } = await lock.query(`DECLARE @Resultado int;
        EXEC @Resultado = sys.sp_getapplock @Resource = @Recurso, @LockMode = 'Exclusive',
          @LockOwner = 'Transaction', @LockTimeout = 10000, @DbPrincipal = 'public';
        SELECT @Resultado AS resultado;`);
      if (![0, 1].includes(recordset?.[0]?.resultado)) throw new ErrorSeguridad(409, "OPERACION_CONCURRENTE", "No se obtuvo el bloqueo. Reintente.");
      const scoped = new UsuarioRepository({ getPool: this.getPool, request, driver: this.driver });
      const resultado = await operacion(scoped);
      await transaction.commit();
      iniciada = false;
      return resultado;
    } catch (error) {
      if (iniciada) {
        try { await transaction.rollback(); } catch { /* No exponer errores del driver. */ }
      }
      throw errorPersistencia(error);
    }
  }
}

module.exports = UsuarioRepository;
