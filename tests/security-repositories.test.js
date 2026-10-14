const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomBytes } = require("node:crypto");
const UsuarioRepository = require("../src/repositories/UsuarioRepository");

function driverLocal({ lock = 0, falloQuery = false, falloCommit = false } = {}) {
  const llamadas = [];
  class Transaction {
    async begin(nivel) { llamadas.push({ tipo: "begin", nivel }); }
    async commit() { llamadas.push({ tipo: "commit" }); if (falloCommit) throw new Error("Fallo privado"); }
    async rollback() { llamadas.push({ tipo: "rollback" }); }
  }
  class Request {
    constructor(transaction) { this.transaction = transaction; this.valores = new Map(); }
    input(nombre, tipo, valor) { this.valores.set(nombre, { tipo, valor }); return this; }
    async query(query) {
      llamadas.push({ tipo: "query", query, valores: this.valores, transaction: this.transaction });
      if (query.includes("sp_getapplock")) return { recordset: [{ resultado: lock }] };
      if (falloQuery) throw Object.assign(new Error("Fallo SQL privado"), { number: 2627 });
      if (query.includes("INSERT INTO")) return { recordset: [{ idUsuario: 1 }] };
      if (query.includes("UPDATE dbo.Usuarios")) return { rowsAffected: [1] };
      if (query.includes("SELECT IdRol")) return { recordset: [{ idRol: 73, nombre: "Operador" }] };
      if (query.includes("OFFSET")) return { recordsets: [[], [{ total: 0 }]] };
      return { recordset: [{ idUsuario: 1, nombre: "Prueba", rol: "Administrador", estado: "Activo", versionRegistro: Buffer.alloc(8) }] };
    }
  }
  const driver = { Transaction, Request, ISOLATION_LEVEL: { READ_COMMITTED: 2 } };
  const repo = new UsuarioRepository({ driver, getPool: async () => ({}), request: async () => new Request() });
  return { llamadas, repo };
}

test("repositorio parametriza entradas y comparte transaccion/bloqueo antes del INSERT", async () => {
  const { repo, llamadas } = driverLocal();
  const entrada = "Nombre'; DROP TABLE dbo.Roles; --";
  await repo.transaccionSeguridad(async (tx) => {
    const rol = await tx.roles.resolverActivo("Operador");
    assert.equal(rol.idRol, 73);
    await tx.crear({ nombre: entrada, email: "prueba@example.invalid", passwordHash: randomBytes(30).toString("hex"), idRol: rol.idRol, actor: 1 });
  });
  assert.equal(llamadas[0].tipo, "begin");
  assert.equal(llamadas[1].query.includes("sp_getapplock"), true);
  const queries = llamadas.filter((c) => c.tipo === "query");
  assert.ok(queries.every((c) => c.transaction === queries[0].transaction));
  assert.ok(queries.every((c) => !c.query.includes(entrada)));
  const insert = queries.find((c) => c.query.includes("INSERT INTO"));
  assert.equal(insert.valores.get("Nombre").valor, entrada);
  assert.equal(insert.valores.get("IdRol").valor, 73);
  assert.equal(llamadas.at(-1).tipo, "commit");
});

test("bloqueo negativo hace rollback sin ejecutar la operacion", async () => {
  const { repo, llamadas } = driverLocal({ lock: -1 });
  let ejecutada = false;
  await assert.rejects(repo.transaccionSeguridad(async () => { ejecutada = true; }), (e) => e.status === 409);
  assert.equal(ejecutada, false);
  assert.equal(llamadas.at(-1).tipo, "rollback");
});

test("resultado de bloqueo ausente/no numerico tampoco permite escrituras", async () => {
  for (const lock of [null, "0", NaN, 2]) {
    const { repo } = driverLocal({ lock }); let ejecutada = false;
    await assert.rejects(repo.transaccionSeguridad(async () => { ejecutada = true; }), (e) => e.status === 409);
    assert.equal(ejecutada, false);
  }
});

test("error o commit fallido revierten y no filtran mensajes SQL", async () => {
  for (const opciones of [{ falloQuery: true }, { falloCommit: true }]) {
    const { repo, llamadas } = driverLocal(opciones);
    await assert.rejects(repo.transaccionSeguridad(async (tx) => tx.obtener(1)), (e) =>
      [409, 503].includes(e.status) && !e.message.includes("privado"));
    assert.equal(llamadas.at(-1).tipo, "rollback");
  }
});

test("edicion compara rowversion como binary8, revoca atomicamente y admite solo columnas cerradas", async () => {
  const { repo, llamadas } = driverLocal();
  await repo.transaccionSeguridad((tx) => tx.actualizar(1, "0123456789abcdef", { estado: "Inactivo" }, 2, true));
  const update = llamadas.find((c) => c.query?.includes("UPDATE dbo.Usuarios"));
  assert.equal(update.valores.get("Revision").valor.length, 8);
  assert.equal(update.query.includes("VersionSesion = VersionSesion + 1"), true);
  assert.match(update.query, /VersionRegistro = @Revision/);
  await assert.rejects(repo.actualizar(1, "0123456789abcdef", { "IdRol = 1; --": 1 }, 2));
});

test("listado no selecciona hash y parametriza/preserva busquedas con comodines", async () => {
  const { repo, llamadas } = driverLocal();
  await repo.listar({ busqueda: "x%_['", estado: "Inactivo", pagina: 2, limite: 25 });
  const query = llamadas.at(-1);
  assert.equal(query.query.includes("PasswordHash"), false);
  assert.equal(query.valores.get("Desde").valor, 25);
  assert.equal(query.valores.get("Busqueda").valor, "%x~%~_~['%");
});
