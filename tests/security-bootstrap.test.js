const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomBytes } = require("node:crypto");
const { PassThrough, Writable } = require("node:stream");
const { ejecutar, opciones, terminalOculta } = require("../scripts/bootstrapAdministrador");
const UsuarioService = require("../src/services/UsuarioService");
const { UsuariosAislados } = require("./helpers/usuariosAislados");

test("comando sin opciones/help no lee configuracion ni conecta", async () => {
  let conexiones = 0;
  for (const args of [[], ["--help"]]) {
    await ejecutar({ args, env: {}, output: { write() {} }, conectar: () => { conexiones++; throw new Error("Prohibido"); } });
  }
  assert.equal(conexiones, 0);
});

test("escritura sin flag, password por argumento, destinos y modos ambiguos se rechazan", () => {
  for (const args of [["--apply", "--database", "HostFlow"], ["--apply", "--database", "otra", "--write-authorized"],
    ["--apply", "--database", "HostFlow", "--write-authorized", "--password", "valor"],
    ["--check", "--verify", "--database", "HostFlow"], ["--check", "--database", "HostFlow", "--write-authorized"]]) {
    assert.throws(() => opciones(args));
  }
  assert.deepEqual(opciones(["--verify", "--database", "HostFlow"]), { modo: "--verify", database: "HostFlow" });
});

test("sin terminal interactiva o destino configurado distinto no conecta", async () => {
  let conexiones = 0;
  const conectar = () => { conexiones++; throw new Error("Prohibido"); };
  await assert.rejects(ejecutar({ args: ["--verify", "--database", "HostFlow"], input: { isTTY: false }, output: { isTTY: false }, env: {}, conectar }));
  await assert.rejects(ejecutar({ args: ["--check", "--database", "HostFlow"], env: { DB_DATABASE: "otra" }, conectar }));
  assert.equal(conexiones, 0);
});

test("prompt oculto no imprime la password ni mantiene historial readline", async () => {
  const password = randomBytes(20).toString("hex");
  const input = new PassThrough(); input.isTTY = true;
  let salida = "";
  const output = new Writable({ write(chunk, _encoding, done) { salida += chunk; done(); } });
  output.isTTY = true;
  const prompt = terminalOculta(input, output);
  const respuesta = prompt.preguntar("Contraseña oculta: ", true);
  setImmediate(() => input.write(`${password}\n`));
  assert.equal(await respuesta, password);
  prompt.cerrar();
  assert.equal(salida.includes(password), false);
});

test("comando apply con conexion doble crea una sola cuenta y nunca imprime credenciales", async () => {
  const repo = new UsuariosAislados();
  const password = randomBytes(20).toString("hex");
  const dbPassword = randomBytes(20).toString("hex");
  let salida = "", cierres = 0;
  const input = { isTTY: true }, output = { isTTY: true, write(text) { salida += text; } };
  const valores = ["CREAR ADMINISTRADOR EN HostFlow", "Inicial", "admin@example.invalid", password, password];
  await ejecutar({
    args: ["--apply", "--write-authorized", "--database", "HostFlow"], input, output,
    env: { DB_DATABASE: "HostFlow", DB_SERVER: "servidor.invalid", DB_USER: "fixture", DB_PASSWORD: dbPassword },
    conectar: async () => ({ request: () => ({ query: async () => ({ recordset: [{ base: "HostFlow", roles: 1, lectura: 1, alta: 1, bloqueo: 1 }] }) }), close: async () => { cierres++; } }),
    promptFactory: () => ({ preguntar: async () => valores.shift(), cerrar() {} }),
    repositoryFactory: () => repo, serviceFactory: (r) => new UsuarioService(r, { cost: 4 }),
  });
  assert.equal(repo.filas.size, 1);
  assert.equal(cierres, 1);
  assert.equal(salida.includes(password), false);
  assert.equal(salida.includes(dbPassword), false);
  assert.equal(salida.includes(repo.filas.get(1).passwordHash), false);
});

test("verificacion de primer Admin es solo lectura y no emite JWT", async () => {
  const repo = new UsuariosAislados();
  const admin = await repo.agregar({ id: 1, obligatorio: true });
  let salida = "";
  const valores = [admin.usuario.email, admin.password];
  await ejecutar({ args: ["--verify", "--database", "HostFlow"], input: { isTTY: true }, output: { isTTY: true, write(text) { salida += text; } },
    env: { DB_DATABASE: "HostFlow", DB_SERVER: "servidor.invalid", DB_USER: "fixture", DB_PASSWORD: randomBytes(20).toString("hex") },
    conectar: async () => ({ request: () => ({ query: async () => ({ recordset: [{ base: "HostFlow", roles: 1, lectura: 1 }] }) }), close: async () => {} }),
    promptFactory: () => ({ preguntar: async () => valores.shift(), cerrar() {} }), repositoryFactory: () => repo,
  });
  assert.equal(repo.escrituras, 0);
  assert.equal(salida.includes(admin.password), false);
  assert.equal(salida.includes("Sin escrituras ni JWT"), true);
});
