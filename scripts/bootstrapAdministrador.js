const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { Writable } = require("node:stream");
const sql = require("mssql");
const UsuarioRepository = require("../src/repositories/UsuarioRepository");
const UsuarioService = require("../src/services/UsuarioService");
const { ErrorSeguridad, normalizarEmail, texto, validarPassword, comprobarPassword,
  esUsuarioHabilitado } = require("../src/security/seguridadUsuarios");

const USO = "Uso: node scripts/bootstrapAdministrador.js --check|--verify|--apply --database HostFlow [--write-authorized]\nSin opciones: ayuda, sin conexión. --apply escribe solo con autorización previa explícita.";

function opciones(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) return null;
  const permitidas = ["--check", "--verify", "--apply", "--database", "--write-authorized"];
  if (args.some((arg, i) => !permitidas.includes(arg) && !(i > 0 && args[i - 1] === "--database"))) throw new Error("Opciones no admitidas.");
  if (args.filter((arg) => ["--check", "--verify", "--apply"].includes(arg)).length !== 1 ||
      args.filter((arg) => arg === "--database").length !== 1 ||
      args[args.indexOf("--database") + 1] !== "HostFlow" ||
      args.filter((arg) => arg === "--write-authorized").length > 1) throw new Error("Indicar un modo y el destino HostFlow.");
  const modo = args.find((arg) => ["--check", "--verify", "--apply"].includes(arg));
  if (modo === "--apply" && !args.includes("--write-authorized")) throw new Error("Falta autorización explícita de escritura.");
  if (modo !== "--apply" && args.includes("--write-authorized")) throw new Error("No mezclar comprobación y escritura.");
  return { modo, database: "HostFlow" };
}

function terminalOculta(input, output) {
  let oculto = false;
  const sink = new Writable({ write(chunk, _encoding, done) { if (!oculto) output.write(chunk); done(); } });
  sink.isTTY = true;
  sink.columns = output.columns || 80;
  const rl = readline.createInterface({ input, output: sink, terminal: true, historySize: 0 });
  return {
    preguntar: (pregunta, secreto = false) => new Promise((resolve, reject) => {
      oculto = false;
      const alCerrar = () => reject(new Error("Entrada cancelada."));
      rl.once("close", alCerrar);
      rl.question(pregunta, (respuesta) => {
        rl.removeListener("close", alCerrar);
        // Mantener oculto hasta la siguiente pregunta: un pegado con varias
        // lineas no debe hacer eco del resto de la contraseña.
        if (secreto) output.write("\n");
        resolve(respuesta);
      });
      oculto = secreto;
    }),
    cerrar: () => rl.close(),
  };
}

function cargarConfiguracion() {
  // Solo al ejecutar un modo explícito; importar este modulo no lee .env ni conecta.
  const archivo = path.resolve(__dirname, "../.env");
  const existente = fs.existsSync(archivo) ? require("dotenv").parse(fs.readFileSync(archivo)) : {};
  return { ...existente, ...process.env };
}

async function ejecutar({ args = process.argv.slice(2), env, input = process.stdin,
  output = process.stdout, conectar, promptFactory = terminalOculta,
  repositoryFactory = (pool) => new UsuarioRepository({ getPool: () => Promise.resolve(pool) }),
  serviceFactory = (repo) => new UsuarioService(repo) } = {}) {
  const config = opciones(args);
  if (!config) { output.write(`${USO}\n`); return; }
  if (config.modo !== "--check" && (!input.isTTY || !output.isTTY)) throw new Error("Se necesita terminal interactiva para la contraseña.");
  env ||= cargarConfiguracion();
  if (env.DB_DATABASE !== config.database) throw new Error("El destino configurado debe coincidir con HostFlow.");
  if (!env.DB_SERVER || !env.DB_USER || !env.DB_PASSWORD) throw new Error("Falta configuración privada de conexión.");
  let pool, prompt;
  try {
    const dbConfig = { server: env.DB_SERVER, user: env.DB_USER, password: env.DB_PASSWORD,
      database: config.database, port: Number(env.DB_PORT) || 1433,
      options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
      pool: { max: 1, min: 0 }, connectionTimeout: 30000, requestTimeout: 30000 };
    pool = await (conectar ? conectar(dbConfig) : new sql.ConnectionPool(dbConfig).connect());
    const { recordset } = await pool.request().query(`SELECT DB_NAME() AS base,
      HAS_PERMS_BY_NAME(N'dbo.Roles', N'OBJECT', N'SELECT') AS roles,
      HAS_PERMS_BY_NAME(N'dbo.Usuarios', N'OBJECT', N'SELECT') AS lectura,
      HAS_PERMS_BY_NAME(N'dbo.Usuarios', N'OBJECT', N'INSERT') AS alta,
      HAS_PERMS_BY_NAME(N'sys.sp_getapplock', N'OBJECT', N'EXECUTE') AS bloqueo;`);
    const permisos = recordset[0];
    if (permisos.base !== "HostFlow" || permisos.roles !== 1 || permisos.lectura !== 1) throw new Error("Destino o permisos de lectura incorrectos.");
    const repo = repositoryFactory(pool);
    if (config.modo === "--check") {
      const roles = await repo.roles.listarAsignables();
      output.write(`Base HostFlow verificada. Roles asignables activos: ${roles.length}/2. INSERT Usuarios: ${permisos.alta === 1 ? "sí" : "no"}. Bloqueo: ${permisos.bloqueo === 1 ? "sí" : "no"}. Sin escrituras.\n`);
      return;
    }
    prompt = promptFactory(input, output);
    if (config.modo === "--verify") {
      const email = normalizarEmail(await prompt.preguntar("Correo del Administrador: "));
      const password = await prompt.preguntar("Contraseña (oculta): ", true);
      const usuario = await repo.buscarPorEmail(email);
      if (!esUsuarioHabilitado(usuario) || usuario.rol !== "Administrador" || !await comprobarPassword(password, usuario.passwordHash)) {
        throw new Error("No se pudo verificar el Administrador.");
      }
      output.write(`Administrador verificado. IdUsuario: ${usuario.idUsuario}. Cambio obligatorio: ${usuario.debeCambiarPassword ? "sí" : "no"}. Sin escrituras ni JWT.\n`);
      return;
    }
    if (permisos.alta !== 1 || permisos.bloqueo !== 1) throw new Error("Faltan permisos para el alta inicial; no se modificarán.");
    const confirmacion = await prompt.preguntar("Solo con aprobación previa: escriba CREAR ADMINISTRADOR EN HostFlow: ");
    if (confirmacion !== "CREAR ADMINISTRADOR EN HostFlow") throw new Error("Alta cancelada.");
    const nombre = texto(await prompt.preguntar("Nombre: "), "El nombre", 120);
    const email = normalizarEmail(await prompt.preguntar("Correo: "));
    const password = validarPassword(await prompt.preguntar("Contraseña temporal (oculta): ", true));
    if (password !== await prompt.preguntar("Repetir contraseña (oculta): ", true)) throw new Error("Las contraseñas no coinciden.");
    const resultado = await serviceFactory(repo).bootstrap({ nombre, email, password, escrituraAutorizada: true });
    output.write(`Primer Administrador creado. IdUsuario: ${resultado.idUsuario}. Cambio de contraseña obligatorio.\n`);
  } finally {
    prompt?.cerrar();
    if (pool) await pool.close();
  }
}

if (require.main === module) {
  ejecutar().catch((error) => {
    // Los errores brutos del driver pueden contener conexion/parametros.
    process.stderr.write(error instanceof ErrorSeguridad ? `${error.message}\n` : "No se completó la operación. Revise opciones, destino, permisos o entrada local.\n");
    process.exitCode = 1;
  });
}
module.exports = { ejecutar, opciones, terminalOculta };
