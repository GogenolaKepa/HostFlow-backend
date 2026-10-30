const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ErrorSeguridad } = require("../src/security/seguridadUsuarios");
const { AutenticacionComercialSql } = require("../src/repositories/AutenticacionComercialSql");

// Driver de grabación: no interpreta SQL ni demuestra semántica del motor.
function entorno(opciones = {}) {
  const consultas = [], eventos = [];
  const responder = opciones.responder || (() => ({ recordset: [], rowsAffected: [1] }));
  class Transaction {
    async begin(nivel) { eventos.push(["begin", nivel]); }
    async commit() { eventos.push(["commit"]); if (opciones.falloCommit) throw Error("secreto simulado"); }
    async rollback() { eventos.push(["rollback"]); if (opciones.falloRollback) throw Error("rollback falló"); }
  }
  class Request {
    constructor(tx) { this.tx = tx; this.params = {}; }
    input(nombre, tipo, valor) { this.params[nombre] = arguments.length === 2 ? tipo : valor; return this; }
    async query(sql) {
      consultas.push({ sql, params: this.params, tx: this.tx });
      if (sql.includes("SELECT DB_NAME")) return { recordset: [{ base: "HostFlow", servidor: "hostflow", modelo: opciones.modelo || "authcom-v1" }] };
      if (sql.includes("sp_getapplock")) return { recordset: [{ resultado: opciones.lock ?? 0 }] };
      return responder(sql, this.params);
    }
  }
  const driver = { Transaction, Request, DateTime2: n => n, ISOLATION_LEVEL: { SERIALIZABLE: "serializable" } };
  const config = { pool: {}, driver, baseEsperada: "HostFlow", servidorEsperado: "hostflow", idEmpresa: 1, habilitado: true };
  return { repo: new AutenticacionComercialSql(config), config, consultas, eventos };
}
test("inactivo por defecto, dependencias explícitas y cero conexión implícita", async () => {
  assert.throws(() => new AutenticacionComercialSql());
  const e = entorno();
  const repo = new AutenticacionComercialSql({ ...e.config, habilitado: false });
  await assert.rejects(repo.transaccion(() => assert.fail()), { codigo: "AUTH_COMERCIAL_INACTIVA" });
  assert.equal(e.eventos.length, 0);
  assert.ok(!Object.keys(require.cache).some(p => /[\\/]config[\\/]database.js$|[\\/]dotenv[\\/]/.test(p)));
});
test("destino/modelo y applock deben acreditarse antes del callback", async () => {
  for (const opciones of [{ modelo: "otro" }, { lock: -1 }]) {
    const e = entorno(opciones);
    await assert.rejects(e.repo.transaccion(() => assert.fail()), { codigo: "CUENTAS_RESULTADO_INCIERTO" });
    assert.equal(e.eventos.at(-1)[0], "rollback");
  }
});
test("misma transacción serializable, lock compartido con gestión de cuentas y commit único", async () => {
  const e = entorno();
  assert.equal(await e.repo.transaccion(async tx => { await tx.empresaActiva(1); await tx.rolActivo("Operador"); return 7; }), 7);
  assert.deepEqual(e.eventos, [["begin", "serializable"], ["commit"]]);
  assert.ok(e.consultas.every(c => c.tx === e.consultas[0].tx));
  assert.equal(e.consultas[1].params.recurso, "HostFlow:Seguridad:AdministradoresActivos");
});
test("errores de dominio preservados tras rollback; commit/rollback incierto sanitizados sin repetir", async () => {
  const e = entorno();
  await assert.rejects(e.repo.transaccion(() => { throw new ErrorSeguridad(403, "SIN_PERMISO", "No permitido"); }), { codigo: "SIN_PERMISO" });
  for (const opciones of [{ falloCommit: true }, { falloRollback: true }]) {
    const f = entorno(opciones); let veces = 0;
    await assert.rejects(f.repo.transaccion(() => { veces++; if (!opciones.falloCommit) throw Error("interno privado"); }), error => error.codigo === "CUENTAS_RESULTADO_INCIERTO" && !error.message.includes("privado"));
    assert.equal(veces, 1);
  }
});
test("consumo condicionado, parámetros ligados y CAS de password sin alterar rol/estado", async () => {
  const e = entorno();
  await e.repo.transaccion(async tx => {
    assert.equal(await tx.consumir("id-ficticio", Date.now()), true);
    assert.equal(await tx.restablecerPassword({ usuarioId: 12, passwordHash: "hash-ficticio-no-real", versionSesion: 4, nuevaVersionSesion: 5 }), true);
  });
  const consumo = e.consultas[2];
  assert.match(consumo.sql, /ConsumidaEn IS NULL AND RevocadaEn IS NULL/);
  assert.match(consumo.sql, /ExpiraEn>SYSUTCDATETIME/);
  assert.ok(!consumo.sql.includes("id-ficticio"));
  assert.doesNotMatch(e.consultas[3].sql.split("WHERE")[0], /IdRol\s*=|Estado\s*=/);
  const f = entorno({ responder: () => ({ rowsAffected: [0] }) });
  await f.repo.transaccion(async tx => assert.equal(await tx.consumir("id", Date.now()), false));
});
test("desafío almacena hash binario y documento cerrado sin token ni campos arbitrarios", async () => {
  const e = entorno(); const ahora = Date.now();
  await e.repo.transaccion(tx => tx.insertarDesafio({ id: "id", hash: "a".repeat(64), proposito: "recuperacion", idEmpresa: 1,
    email: "ficticio@example.invalid", usuarioId: 12, versionSesion: 1, creadaEn: ahora, expiraEn: ahora + 900000, token: "NO_PERSISTIR" }));
  const q = e.consultas.at(-1);
  assert.equal(q.params.hash.length, 32); assert.ok(Buffer.isBuffer(q.params.hash));
  assert.ok(!JSON.stringify(q.params).includes("NO_PERSISTIR"));
  assert.deepEqual(JSON.parse(q.params.doc), { versionSesion: 1 });
});
test("cuotas evalúan las tres claves antes de escribir y comparten almacenamiento", async () => {
  const e = entorno();
  await e.repo.transaccion(async tx => assert.equal(await tx.admitir({ proposito: "invitar", ahora: Date.now(), ip: "a".repeat(64), destino: "b".repeat(64), ventanaMs: 900000, maxIp: 20, maxDestino: 3, maxGlobal: 100, cooldownMs: 60000 }), true));
  assert.equal(e.consultas.filter(c => /INSERT authcom.Cuotas/.test(c.sql)).length, 3);
  const f = entorno({ responder: () => ({ recordset: [{ Inicio: new Date(), Ultima: new Date(), Cuenta: 100 }] }) });
  await f.repo.transaccion(async tx => assert.equal(await tx.admitir({ proposito: "invitar", ahora: Date.now(), ip: "a", destino: "b", ventanaMs: 900000, maxIp: 20 }), false));
  assert.ok(!f.consultas.some(c => /INSERT authcom.Cuotas|UPDATE authcom.Cuotas/.test(c.sql)));
});
test("revalidación de contacto se une al email actual; no atribuye verificación legacy", async () => {
  const e = entorno({ responder: () => ({ recordset: [{ idUsuario: 12, verificado: null }] }) });
  await e.repo.transaccion(async tx => assert.equal((await tx.usuario(12)).emailVerificadoEn, null));
  assert.match(e.consultas.at(-1).sql, /c.RevocadoEn IS NULL/);
  assert.match(e.consultas.at(-1).sql, /c.Email=LOWER/);
});
test("outbox cifra por contrato, no persiste campos extra; lease y finalización comparados en SQL", async () => {
  const e = entorno();
  await e.repo.transaccion(async tx => {
    await tx.encolar({ id: "id", desafioId: null, expiraEn: Date.now() + 1000, sobre: { keyId: "k", iv: "i", tag: "t", contenido: "c", token: "NO_PERSISTIR" } });
    await tx.reservarEntrega({ lease: "lease", leaseMs: 120000, maxIntentos: 3 });
    assert.equal(await tx.finalizarEntrega({ id: "id", lease: "lease", exito: true, reintentoMs: 60000, maxIntentos: 3 }), true);
  });
  assert.ok(!JSON.stringify(e.consultas[2].params).includes("NO_PERSISTIR"));
  const sql = e.consultas.map(c => c.sql).join("\n");
  assert.match(sql, /Lease=@lease AND LeaseHasta>SYSUTCDATETIME/);
  assert.match(sql, /Intentos=Intentos\+1/);
  assert.match(sql, /THEN NULL ELSE Sobre END/);
});
test("inventario completo del puerto Fase 1 y scripts aditivos bloqueados sin DCL", async () => {
  const e = entorno();
  await e.repo.transaccion(tx => {
    for (const nombre of ["empresaActiva", "usuario", "buscarUsuario", "rolActivo", "admitir", "invitacionPendiente", "insertarDesafio", "desafio", "consumir", "revocarRecuperaciones", "revocarInvitacion", "restablecerPassword", "crearInvitado", "encolar", "auditar", "reservarEntrega", "finalizarEntrega"]) assert.equal(typeof tx[nombre], "function", nombre);
  });
  const sql = fs.readFileSync(path.join(__dirname, "../sql/proposals/autenticacion_comercial/01_modelo_bloqueado.sql"), "utf8");
  assert.match(sql, /@Aplicar bit=0/); assert.match(sql, /@InventarioRevisado bit=0/);
  assert.equal((sql.match(/CREATE TABLE authcom\./g) || []).length, 5);
  assert.doesNotMatch(sql, /\b(?:ALTER TABLE dbo|DROP TABLE|GRANT\s+\w+\s+ON|INSERT dbo\.Usuarios)\b/i);
});

test("proyección SQL: documento no reemplaza ID/estado/empresa relacionales", async () => {
  const ahora = new Date();
  const e = entorno({ responder: () => ({ recordset: [{ Documento: JSON.stringify({ id: "falso", idEmpresa: 999, consumidaEn: null, versionSesion: 4 }),
    Id: "real", Proposito: "recuperacion", IdEmpresa: 1, Email: "ficticio@example.invalid", IdUsuario: 12,
    CreadaEn: ahora, ExpiraEn: new Date(ahora.getTime() + 1000), ConsumidaEn: ahora, RevocadaEn: null }] }) });
  await e.repo.transaccion(async tx => {
    const d = await tx.desafio("a".repeat(64), "recuperacion");
    assert.equal(d.id, "real"); assert.equal(d.idEmpresa, 1);
    assert.equal(d.consumidaEn, ahora.getTime()); assert.equal(d.versionSesion, 4);
  });
});
test("alta por invitación usa Operador resuelto y contacto en la misma transacción; fallo revierte", async () => {
  const e = entorno({ responder: sql => {
    if (sql.includes("INSERT dbo.Usuarios")) return { recordset: [{ id: 123 }] };
    if (sql.includes("INSERT authcom.Contactos")) throw Error("fallo ficticio");
    return { recordset: [] };
  } });
  await assert.rejects(e.repo.transaccion(tx => tx.crearInvitado({ nombre: "Ficticio", email: "alta@example.invalid", passwordHash: "ficticio", rol: "Operador", actorId: 12, emailVerificadoEn: new Date().toISOString() })), { codigo: "CUENTAS_RESULTADO_INCIERTO" });
  assert.equal(e.eventos.at(-1)[0], "rollback");
  assert.ok(!e.eventos.some(e => e[0] === "commit"));
  assert.equal(e.consultas[2].tx, e.consultas[3].tx);
  assert.match(e.consultas[2].sql, /N'Operador' AND Activo=1/);
  assert.equal(e.consultas[3].params.id, 123);
});
test("lease perdido informa false; revocar queda ligado a propósito/empresa y nunca DELETE", async () => {
  const e = entorno({ responder: () => ({ recordset: [], rowsAffected: [0] }) });
  await e.repo.transaccion(async tx => {
    assert.equal(await tx.finalizarEntrega({ id: "id", lease: "viejo", exito: true, reintentoMs: 60000, maxIntentos: 3 }), false);
    await tx.revocarInvitacion("id", 1, Date.now());
    await tx.revocarRecuperaciones(12, Date.now());
  });
  assert.match(e.consultas[3].sql, /Proposito='invitacion'/);
  assert.equal(e.consultas[3].params.empresa, 1);
  assert.ok(e.consultas.every(c => !/\bDELETE\b/i.test(c.sql)));
});
