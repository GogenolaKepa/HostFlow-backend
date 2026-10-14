const { test } = require("node:test");
const assert = require("node:assert/strict");
const sql = require("mssql");
const { randomBytes } = require("node:crypto");
const UsuarioRepository = require("../../src/repositories/UsuarioRepository");
const UsuarioService = require("../../src/services/UsuarioService");
const { AuthService } = require("../../src/services/AuthService");
const { configuracionSQLAislada, migracionParaPruebas, verificarAislamiento } = require("./sqlAislado");

test("SQL Server real: seguridad en base local marcada y desechable", {
  skip: process.env.HOSTFLOW_SQL_TEST_ENABLED !== "1",
}, async (t) => {
  const config = configuracionSQLAislada(process.env);
  let pool, entornoValidado = false, rolesCreada = false, usuariosCreada = false;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    await verificarAislamiento(pool, config.database, true);
    entornoValidado = true;
    await pool.request().batch(`CREATE TABLE dbo.Roles (
      IdRol int IDENTITY NOT NULL PRIMARY KEY, Nombre nvarchar(50) NOT NULL UNIQUE,
      Descripcion nvarchar(200) NULL, Activo bit NOT NULL DEFAULT 1);
      INSERT INTO dbo.Roles (Nombre) VALUES (N'Administrador'), (N'Propietario'), (N'Operador');`);
    rolesCreada = true;
    await pool.request().batch(migracionParaPruebas(config.database));
    usuariosCreada = true;
    const repo = new UsuarioRepository({ getPool: () => Promise.resolve(pool) });
    const cuentas = new UsuarioService(repo); // Cost 12 real, no mocks.
    const secreto = randomBytes(32).toString("hex");
    const auth = new AuthService({ origen: "sql", repository: repo, cuentas, secret: () => secreto });
    const temporal = randomBytes(20).toString("hex");
    const bootstrap = { nombre: "Inicial aislado", email: "admin@example.invalid", password: temporal, escrituraAutorizada: true };
    await t.test("dos bootstrap concurrentes crean exactamente un Admin", async () => {
      const resultados = await Promise.allSettled([cuentas.bootstrap(bootstrap), cuentas.bootstrap(bootstrap)]);
      assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await repo.contarAdministradoresActivos(), 1);
    });
    const inicial = await repo.buscarPorEmail(bootstrap.email);
    assert.ok(inicial);
    const cambiado = await cuentas.cambiarPassword(inicial, { passwordActual: temporal,
      passwordNueva: randomBytes(20).toString("hex"), versionRegistro: inicial.versionRegistro.toString("hex") });
    const admin = cambiado;
    await t.test("indices normalizan mayusculas/espacios y mantienen unicidad en inactivos", async () => {
      const nuevo = await cuentas.crear(admin, { nombre: "Operador", email: "op@example.invalid", rol: "Operador", passwordTemporal: randomBytes(20).toString("hex") });
      await cuentas.cambiarEstado(admin, nuevo.idUsuario, { estado: "Inactivo", versionRegistro: nuevo.versionRegistro });
      await assert.rejects(cuentas.crear(admin, { nombre: "Duplicado", email: " OP@example.invalid ", rol: "Operador", passwordTemporal: randomBytes(20).toString("hex") }), (e) => e.codigo === "EMAIL_DUPLICADO");
      assert.ok(await repo.buscarPorEmail("op@example.invalid"));
    });
    await t.test("rowversion viejo no sobrescribe; password/logout revocan tokens", async () => {
      const otra = await cuentas.editarNombre(admin, { nombre: "Nuevo nombre", versionRegistro: admin.versionRegistro.toString("hex") });
      await assert.rejects(cuentas.editarNombre(admin, { nombre: "Revision vieja", versionRegistro: admin.versionRegistro.toString("hex") }), (e) => e.codigo === "REVISION_VENCIDA");
      const sesion = auth.emitirSesion(otra);
      await cuentas.logout(otra);
      const payload = require("jsonwebtoken").verify(sesion.token, secreto, { algorithms: ["HS256"] });
      assert.equal(await auth.obtenerUsuarioSesion(otra.idUsuario, payload), null);
    });
    await t.test("SQL real serializa dos desactivaciones y protege ultimo Admin", async () => {
      const actor = await repo.obtener(admin.idUsuario);
      const segundo = await cuentas.crear(actor, { nombre: "Segundo", email: "segundo@example.invalid", rol: "Administrador", passwordTemporal: temporal });
      const segundoFila = await repo.obtener(segundo.idUsuario);
      const segundoActivo = await cuentas.cambiarPassword(segundoFila, { passwordActual: temporal, passwordNueva: randomBytes(20).toString("hex"), versionRegistro: segundo.versionRegistro });
      const resultados = await Promise.allSettled([
        cuentas.cambiarEstado(actor, actor.idUsuario, { estado: "Inactivo", versionRegistro: actor.versionRegistro.toString("hex") }),
        cuentas.cambiarEstado(segundoActivo, segundoActivo.idUsuario, { estado: "Inactivo", versionRegistro: segundoActivo.versionRegistro.toString("hex") }),
      ]);
      assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await repo.contarAdministradoresActivos(), 1);
    });
    await t.test("roles existentes conservados; Propietario no asignable; FKs/CHECK presentes", async () => {
      const { recordset } = await pool.request().query("SELECT IdRol, Nombre, Activo FROM dbo.Roles ORDER BY IdRol;");
      assert.deepEqual(recordset.map((r) => r.Nombre), ["Administrador", "Propietario", "Operador"]);
      assert.ok(recordset.every((r) => r.Activo));
      assert.equal(await repo.roles.resolverActivo("Propietario"), null);
      const { recordset: constraints } = await pool.request().query("SELECT COUNT(*) AS cantidad FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Usuarios');");
      assert.equal(constraints[0].cantidad, 3);
      let codigo = null;
      try {
        const req = pool.request();
        req.input("Hash", sql.VarChar(255), await require("bcryptjs").hash(temporal, 12));
        await req.query("INSERT INTO dbo.Usuarios(Nombre,Email,PasswordHash,IdRol) VALUES(N'FK aislada',N'fk@example.invalid',@Hash,-1);");
      } catch (error) { codigo = error.number; }
      assert.equal(codigo, 547, "La FK debe rechazar un rol inexistente.");
      codigo = null;
      try {
        const req = pool.request();
        req.input("Hash", sql.VarChar(255), await require("bcryptjs").hash(temporal, 12));
        await req.query("INSERT INTO dbo.Usuarios(Nombre,Email,PasswordHash,IdRol,Estado) SELECT N'CHECK aislada',N'check@example.invalid',@Hash,IdRol,N'Otro' FROM dbo.Roles WHERE Nombre=N'Operador';");
      } catch (error) { codigo = error.number; }
      assert.equal(codigo, 547, "El CHECK debe rechazar un estado fuera del catalogo.");
    });
  } catch {
    // No imprimir errores del driver que puedan incluir parametros/credenciales.
    throw new Error("Falló la integración SQL aislada; no se imprimieron detalles sensibles.");
  } finally {
    if (pool) {
      try {
        if (entornoValidado) {
          await verificarAislamiento(pool, config.database, false);
          if (usuariosCreada) await pool.request().batch("DROP TABLE dbo.Usuarios;");
          if (rolesCreada) await pool.request().batch("DROP TABLE dbo.Roles;");
        }
      } catch { throw new Error("No se completó la limpieza del entorno SQL aislado. Revisar esa base de pruebas sin tocar HostFlow."); }
      finally { try { await pool.close(); } catch { /* No imprimir datos privados del driver. */ } }
    }
  }
});
