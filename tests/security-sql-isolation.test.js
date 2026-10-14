const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const sql = require("./integration/sqlAislado");
const { comprobarSQLLocal } = require("../scripts/comprobarSQLLocal");
const { prepararOperacion, prepararSQLLocal } = require("../scripts/prepararSQLLocal");

const env = Object.freeze({ HOSTFLOW_SQL_TEST_AUTH: "windows", HOSTFLOW_SQL_TEST_SERVER: "localhost",
  HOSTFLOW_SQL_TEST_DATABASE: sql.BASE, HOSTFLOW_SQL_TEST_ENABLED: "1", HOSTFLOW_SQL_TEST_WRITE_APPROVED: "YES_LOCAL_DISPOSABLE" });
const metadatos = (base = sql.BASE) => ({ base, equipo: sql.EQUIPO, servidor: sql.EQUIPO, instancia: null,
  edicion: "Enterprise Evaluation Edition (64-bit)", version: "17.0.1000.7", motor: 3, soloWindows: 1,
  transporte: "Shared memory", autenticacion: "NTLM", collation: sql.COLLATION, marca: sql.MARCA, objetosInesperados: 0 });

test("Windows local no lee .env ni exige passwords; master solo lectura no habilita escrituras", () => {
  const lectura = sql.configuracionSQLAislada({ HOSTFLOW_SQL_TEST_AUTH: "windows", HOSTFLOW_SQL_TEST_SERVER: "localhost" }, { lectura: true });
  assert.equal(lectura.database, "master"); assert.equal(lectura.user, undefined); assert.equal(lectura.password, undefined);
  assert.equal(lectura.options.trustedConnection, true);
  const cfg = {}; lectura.beforeConnect(cfg);
  assert.ok(cfg.conn_str.includes("lpc:localhost"));
  assert.equal(sql.configuracionSQLAislada(env).database, sql.BASE);
  for (const cambio of [{ HOSTFLOW_SQL_TEST_AUTH: "sql" }, { HOSTFLOW_SQL_TEST_DATABASE: "HostFlow_Test_Otra" },
    { HOSTFLOW_SQL_TEST_USER: "incompatible" }, { HOSTFLOW_SQL_TEST_SERVER: "127.0.0.1" }]) {
    assert.throws(() => sql.configuracionSQLAislada({ ...env, ...cambio }));
  }
});

test("identidad fisica valida equipo/instancia/motor/transporte/auth/collation/marca y objetos", () => {
  sql.validarConexion(metadatos(), sql.BASE);
  for (const cambio of [{ base: "HostFlow" }, { equipo: "Otro" }, { servidor: "Otro" }, { instancia: "OTRA" },
    { motor: 5 }, { motor: 8 }, { motor: 2 }, { soloWindows: 0 }, { transporte: "TCP" }, { autenticacion: "SQL" },
    { collation: "Modern_Spanish_CI_AS" }, { edicion: "Otra" }, { version: "16.0" }, { marca: null }, { objetosInesperados: 1 }]) {
    assert.throws(() => sql.validarConexion({ ...metadatos(), ...cambio }, sql.BASE));
  }
});

test("cada Request de pool y transaccion adjunta guardas antes del comando en la misma llamada", async () => {
  const llamadas = [];
  class Request {
    constructor(parent) { this.parent = parent; }
    query(text) { llamadas.push({ parent: this.parent, text }); return Promise.resolve({}); }
    batch(text) { llamadas.push({ parent: this.parent, text }); return Promise.resolve({}); }
  }
  const production = require("mssql"); const original = production.Request;
  const contexto = { runId: randomUUID() }, permisos = { ...env };
  const protegido = sql.driverProtegido({ Request }, contexto, permisos);
  const pool = { conexion: 1 }, transaction = { conexion: 2 };
  await new protegido.Request(pool).query("UPDATE dbo.Usuarios SET VersionSesion=VersionSesion+1;");
  await new protegido.Request(transaction).batch("INSERT INTO dbo.Roles(Nombre) VALUES(N'Operador');");
  assert.equal(llamadas.length, 2); assert.equal(llamadas[1].parent, transaction);
  for (const { text } of llamadas) {
    const operacion = text.includes("UPDATE dbo.Usuarios") ? "UPDATE dbo.Usuarios" : "INSERT INTO dbo.Roles";
    assert.ok(text.indexOf("THROW 51400") < text.indexOf(operacion));
    for (const guard of ["MachineName", "InstanceName", "EngineEdition", "net_transport", "auth_scheme", "HostFlowTestIsolation", "HostFlowTestRun", "Collation", "sys.objects", "ARITHABORT ON"]) assert.ok(text.includes(guard));
  }
  for (const command of ["USE HostFlow; DELETE FROM dbo.Usuarios;", "DROP DATABASE HostFlow;",
    "UPDATE [HostFlow].[dbo].[Usuarios] SET VersionSesion=1;", "EXEC('DELETE FROM dbo.Usuarios');",
    "SELECT N'--'; USE HostFlow;", "DELETE FROM [HostFlow]..[Usuarios];",
    "DELETE FROM \"HostFlow\".\"dbo\".\"Usuarios\";", "DECLARE @SQL nvarchar(max); EXEC @SQL;"]) {
    assert.throws(() => new protegido.Request(pool).query(command));
  }
  delete permisos.HOSTFLOW_SQL_TEST_WRITE_APPROVED;
  assert.throws(() => new protegido.Request(pool).query("DELETE FROM dbo.Usuarios;"));
  assert.equal(llamadas.length, 2);
  assert.throws(() => new protegido.Request(pool).execute("procedimiento"));
  assert.throws(() => new protegido.Request(pool).bulk({}));
  assert.throws(() => new protegido.PreparedStatement(pool));
  assert.equal(require("mssql").Request, original);
});

test("fixture marca pertenencia dentro de la transaccion y antes de commit; original permanece bloqueado", () => {
  const runId = randomUUID();
  for (const code of [sql.fixtureRoles(runId), sql.migracionParaPruebas(sql.BASE, runId)]) {
    assert.ok(code.indexOf("BEGIN TRANSACTION") < code.indexOf("HostFlowTestRun"));
    assert.ok(code.indexOf("HostFlowTestRun") < code.indexOf("COMMIT TRANSACTION"));
    assert.match(code, /ROLLBACK TRANSACTION/);
  }
  assert.throws(() => sql.guardasSQL({ runId: "'; DROP DATABASE HostFlow;--" }));
  class Request { batch(text) { return text; } }
  const driver = sql.driverProtegido({ Request }, { runId }, env);
  assert.doesNotThrow(() => new driver.Request().batch(sql.fixtureRoles(runId)));
  assert.doesNotThrow(() => new driver.Request().batch(sql.migracionParaPruebas(sql.BASE, runId)));
});

// Ledger en memoria, sin driver nativo ni conexion. Simula respuestas perdidas,
// DDL revertido y residuos. No certifica comportamiento del motor SQL real.
function ledger({ fallo, inicial = [] } = {}) {
  const contexto = { runId: randomUUID(), vacia: true }, llamadas = [];
  let tablas = inicial;
  const own = (tabla, id) => ({ esquema: "dbo", tabla, id, propietario: contexto.runId });
  const pool = { request: () => ({
    query: async (text) => {
      llamadas.push(text);
      if (text === sql.METADATOS_CONEXION) return { recordset: [metadatos()] };
      return { recordset: tablas };
    },
    batch: async (text) => {
      llamadas.push(text);
      if (text.includes("CREATE TABLE dbo.Roles")) {
        if (fallo === "RolesRollback") throw new Error("Driver privado");
        tablas = [own("Roles", 1)];
        if (fallo === "RolesCommitPerdido") throw new Error("Respuesta perdida");
      } else if (text.includes("CREATE TABLE dbo.Usuarios")) {
        if (["MigracionRollback", "IndiceRollback", "RestriccionRollback"].includes(fallo)) throw new Error("DDL revertido");
        tablas = [...tablas, own("Usuarios", 2)];
        if (fallo === "UsuarioSinMarca") tablas[1].propietario = null;
        if (["UsuariosCommitPerdido", "UsuarioSinMarca"].includes(fallo)) throw new Error("Respuesta perdida");
      } else if (text.includes("DROP TABLE")) {
        if (fallo === "LimpiezaRollback") throw new Error("Limpieza revertida");
        tablas = [];
      }
    },
  }) };
  return { pool, contexto, llamadas, tablas: () => tablas };
}

for (const fallo of ["RolesRollback", "RolesCommitPerdido", "MigracionRollback", "IndiceRollback", "RestriccionRollback", "UsuariosCommitPerdido"]) {
  test(`ciclo aislado recupera ${fallo} usando pertenencia, sin flags de migracion exitosa`, async () => {
    const l = ledger({ fallo }); let casos = false;
    await assert.rejects(sql.ejecutarConFixtures(l.pool, l.contexto, () => { casos = true; }));
    assert.equal(casos, false); assert.deepEqual(l.tablas(), []);
    const drops = l.llamadas.filter(q => q.includes("DROP TABLE"));
    if (fallo === "RolesRollback") assert.equal(drops.length, 0);
    else { assert.equal(drops.length, 1); assert.ok(drops[0].includes(l.contexto.runId)); }
  });
}

test("fallo de caso concurrente tambien limpia; orden Usuarios luego Roles y limpieza transaccional", async () => {
  const l = ledger();
  await assert.rejects(sql.ejecutarConFixtures(l.pool, l.contexto, () => { throw new Error("Fallo concurrente"); }));
  const cleanup = l.llamadas.find(q => q.includes("DROP TABLE"));
  assert.ok(cleanup.indexOf("DROP TABLE dbo.Usuarios") < cleanup.indexOf("DROP TABLE dbo.Roles"));
  assert.match(cleanup, /BEGIN TRANSACTION[\s\S]*HostFlowTestRun[\s\S]*DROP TABLE[\s\S]*ROLLBACK TRANSACTION/);
  assert.deepEqual(l.tablas(), []);
});

test("residuo sin pertenencia y tabla preexistente no disparan DROP", async () => {
  for (const l of [ledger({ fallo: "UsuarioSinMarca" }), ledger({ inicial: [{ esquema: "dbo", tabla: "Roles", id: 1, propietario: randomUUID() }] })]) {
    await assert.rejects(sql.ejecutarConFixtures(l.pool, l.contexto, () => {}));
    assert.equal(l.llamadas.some(q => q.includes("DROP TABLE")), false);
    assert.ok(l.tablas().length);
  }
});

test("limpieza fallida deja residuos identificados y reejecucion con otro run aborta sin eliminarlos", async () => {
  const l = ledger({ fallo: "LimpiezaRollback" });
  await assert.rejects(sql.ejecutarConFixtures(l.pool, l.contexto, () => {}), /Inspección manual/);
  const otra = ledger({ inicial: l.tablas() });
  await assert.rejects(sql.ejecutarConFixtures(otra.pool, otra.contexto, () => {}));
  assert.equal(otra.llamadas.some(q => q.includes("DROP TABLE")), false);
});

test("comprobador independiente ejecuta solo SELECT de metadatos y rechaza argumentos ambiguos", async () => {
  const queries = []; let conectadas = 0, cerradas = 0;
  class ConnectionPool {
    constructor(config) { assert.equal(config.database, "master"); }
    async connect() { conectadas++; }
    async close() { cerradas++; }
    request() { return { query: async text => { queries.push(text); return { recordset: [text===sql.METADATOS_CONEXION ? metadatos("master") : { existeBasePruebas: 0 }] }; } }; }
  }
  await assert.rejects(comprobarSQLLocal({ driver: { ConnectionPool }, args: ["--apply"] }));
  assert.equal(conectadas, 0);
  const result = await comprobarSQLLocal({ driver: { ConnectionPool }, args: ["--read-only"] });
  assert.equal(result.existeBasePruebas, 0); assert.equal(cerradas, 1);
  assert.ok(queries.every(q => /^SELECT\b/.test(q) && !/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|EXEC)\b/i.test(q.replace(/'(?:[^']|'')*'/g,"''"))));
});

test("aprovisionamiento local exige flags y destino fijo antes de conectar; inspeccion no autoriza escritura", async () => {
  for (const args of [[], ["--create"], ["--mark"], ["--cleanup", "--write-authorized"],
    ["--inspect", "--write-authorized"], ["--create", "--write-authorized", "--database", "HostFlow"],
    ["--create", "--mark", "--write-authorized"]]) assert.throws(() => prepararOperacion(args));
  let conectadas = 0;
  class ConnectionPool { constructor() { conectadas++; } }
  await assert.rejects(prepararSQLLocal({ args: ["--create"], driver: { ConnectionPool } }));
  assert.equal(conectadas, 0);
  for (const modo of ["--create", "--mark", "--cleanup"]) {
    const args = [modo, "--write-authorized", ...(modo==="--cleanup" ? ["--run-id", randomUUID()] : [])];
    const op = prepararOperacion(args);
    assert.equal(op.base, modo==="--create" ? "master" : sql.BASE);
    assert.match(op.command, /DECLARE @EscrituraAutorizada bit = 1;/);
    const codigo = op.command.replace(/\/\*[\s\S]*?\*\//g,"");
    assert.ok(codigo.indexOf("SERVERPROPERTY('MachineName')") < codigo.search(/\b(CREATE DATABASE|EXEC sys.sp_addextendedproperty|DROP TABLE)\b/));
    assert.doesNotMatch(op.command, /\b(GRANT|ALTER DATABASE|DROP DATABASE)\b/);
  }
  assert.equal(prepararOperacion(["--inspect"]).escritura, false);
});

test("SQL de propuesta local mantiene bloqueos y lectura no contiene DDL/DML/procedimientos", () => {
  const fs = require("node:fs"), path = require("node:path");
  for (const file of ["00_marcar_base_aislada.sql", "01_crear_base_local.sql", "03_limpieza_manual_revisable.sql"]) {
    const text = fs.readFileSync(path.join(__dirname,"integration",file),"utf8");
    assert.match(text,/DECLARE @EscrituraAutorizada bit = 0;/);
    for (const guard of ["MachineName", "ServerName", "InstanceName", "EngineEdition", "Shared memory", "IsIntegratedSecurityOnly"]) assert.ok(text.includes(guard));
  }
  const readonly = prepararOperacion(["--inspect"]).command.replace(/\/\*[\s\S]*?\*\//g,"").replace(/'(?:[^']|'')*'/g,"''");
  assert.doesNotMatch(readonly,/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|EXEC)\b/i);
});

test("crear base usa Request del pool sin Transaction y exige autocommit antes de CREATE", async () => {
  let batches = 0;
  class ConnectionPool {
    constructor(config) { assert.equal(config.database, "master"); }
    async connect() {}
    async close() {}
    request() { return {
      query: async () => ({ recordset: [metadatos("master")] }),
      batch: async command => {
        batches++;
        const codigo = command.replace(/\/\*[\s\S]*?\*\//g, "");
        assert.doesNotMatch(codigo, /\bBEGIN\s+TRAN(?:SACTION)?\b/i);
        for (const guarda of ["@@TRANCOUNT<>0", "(@@OPTIONS & 2)<>0", "DB_ID(N'HostFlow_Test_Seguridad') IS NOT NULL"]) {
          assert.ok(codigo.indexOf(guarda) >= 0 && codigo.indexOf(guarda) < codigo.indexOf("CREATE DATABASE"));
        }
        assert.equal((codigo.match(/\bCREATE DATABASE\b/g) || []).length, 1);
        assert.doesNotMatch(codigo, /\b(ALTER|DROP|INSERT|UPDATE|DELETE|MERGE|EXEC)\b/i);
        return {};
      },
    }; }
  }
  class Transaction { constructor() { throw new Error("Crear base no admite una transaccion explicita."); } }
  await prepararSQLLocal({ args: ["--create", "--write-authorized"], driver: { ConnectionPool, Transaction } });
  assert.equal(batches, 1);
});

test("inspeccion informa solo metadatos acreditados y rechaza un destino distinto en el batch", async () => {
  let destino = metadatos(sql.BASE);
  class ConnectionPool {
    async connect() {}
    async close() {}
    request() { return {
      query: async () => ({ recordset: [metadatos(sql.BASE)] }),
      batch: async () => ({ recordsets: [[{...destino, passwordHash:"NO_PUBLICAR"}],[],[]] }),
    }; }
  }
  const result = await prepararSQLLocal({ args:["--inspect"],driver:{ConnectionPool} });
  assert.equal(result.collation,sql.COLLATION);
  assert.equal(result.marca,sql.MARCA);
  assert.equal(result.objetosInesperados,0);
  assert.equal(Object.hasOwn(result,"passwordHash"),false);
  destino={...destino,base:"HostFlow"};
  await assert.rejects(prepararSQLLocal({ args:["--inspect"],driver:{ConnectionPool} }));
});
