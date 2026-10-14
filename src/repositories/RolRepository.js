const sql = require("mssql");
const { ROLES_ASIGNABLES } = require("../security/seguridadUsuarios");

class RolRepository {
  constructor({ request } = {}) {
    this.request = request || (async () => (await require("../config/database").poolPromise).request());
  }

  async listarAsignables() {
    const req = await this.request();
    req.input("Administrador", sql.NVarChar(50), ROLES_ASIGNABLES[0]);
    req.input("Operador", sql.NVarChar(50), ROLES_ASIGNABLES[1]);
    const { recordset } = await req.query(`
      SELECT Nombre AS nombre FROM dbo.Roles
      WHERE Activo = 1 AND Nombre COLLATE Latin1_General_100_BIN2 IN (@Administrador, @Operador)
        AND (DATALENGTH(Nombre) = DATALENGTH(@Administrador) OR DATALENGTH(Nombre) = DATALENGTH(@Operador))
      ORDER BY Nombre;`);
    return recordset.filter((r) => ROLES_ASIGNABLES.includes(r.nombre));
  }

  async resolverActivo(nombre) {
    if (!ROLES_ASIGNABLES.includes(nombre)) return null;
    const req = await this.request();
    req.input("NombreRol", sql.NVarChar(50), nombre);
    const { recordset } = await req.query(`
      SELECT IdRol AS idRol, Nombre AS nombre FROM dbo.Roles WITH (HOLDLOCK)
      WHERE Nombre COLLATE Latin1_General_100_BIN2 = @NombreRol
        AND DATALENGTH(Nombre) = DATALENGTH(@NombreRol) AND Activo = 1;`);
    return recordset[0] || null;
  }
}

module.exports = RolRepository;
