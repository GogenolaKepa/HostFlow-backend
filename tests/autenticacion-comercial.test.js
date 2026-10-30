const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomBytes } = require("node:crypto");
const bcrypt = require("bcryptjs");
const fs = require("node:fs");
const path = require("node:path");
const { crearToken, hashToken, crearProtectorCorreo, crearIndicePrivado } = require("../src/security/comercial/credencialesTemporales");
const { AutenticacionComercialService, RESPUESTA_NEUTRAL } = require("../src/services/AutenticacionComercialService");
const { EntregaCorreoSeguridad } = require("../src/security/comercial/EntregaCorreoSeguridad");
const { CuentasComercialesAisladas } = require("./helpers/cuentasComercialesAisladas");

const contexto = { ip: "127.0.0.1" };
const password = () => randomBytes(20).toString("hex");
const codigo = esperado => e => e.codigo === esperado;
async function entorno(opciones = {}) {
  const repo = new CuentasComercialesAisladas();
  let ahora = Date.parse("2026-10-30T15:00:00Z");
  const admin = await repo.agregar({ id: 101 });
  const operador = await repo.agregar({ id: 102, rol: "Operador" });
  Object.assign(repo.filas.get(102), { emailVerificadoEn: "2026-10-29T12:00:00.000Z", versionContacto: 1 });
  const protector = crearProtectorCorreo({ clave: randomBytes(32), keyId: "test-efimero" });
  const config = { repository: repo, protector, indicePrivado: crearIndicePrivado(randomBytes(32)),
    idEmpresa: 1, origen: "https://cuentas.example.invalid", ahora: () => ahora,
    hashPassword: p => bcrypt.hash(p, 4), ...opciones };
  const servicio = new AutenticacionComercialService(config);
  const mensajes = [];
  const proveedor = { enviar: async payload => { mensajes.push(payload); } };
  const worker = new EntregaCorreoSeguridad({ repository: repo, protector, proveedor, ahora: () => ahora });
  const avanzar = ms => { ahora += ms; };
  async function enlace(proposito = "recuperacion") {
    if (proposito === "recuperacion") await servicio.solicitarRecuperacion({ email: operador.usuario.email }, contexto);
    else await servicio.invitar(admin.usuario, { email: "alta@example.invalid", nombre: "Persona ficticia" }, contexto);
    assert.equal((await worker.procesarUna()).estado, "entregada");
    const mail = mensajes.at(-1);
    assert.equal(mail.plantilla, proposito);
    const token = new URLSearchParams(new URL(mail.enlace).hash.slice(1)).get("token");
    return { token, passwordNueva: password() };
  }
  return { repo, admin, operador, config, servicio, mensajes, proveedor, protector, worker, avanzar, enlace };
}

test("tokens CSPRNG canónicos, hashes separados por propósito y sin alias de base64", () => {
  const tokens = new Set();
  for (let n = 0; n < 64; n++) {
    const { token, hash } = crearToken("recuperacion");
    assert.match(token, /^[\w-]{43}$/);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hashToken(token, "recuperacion"), hash);
    assert.notEqual(hashToken(token, "invitacion"), hash);
    tokens.add(token);
  }
  assert.equal(tokens.size, 64);
  for (const token of [null, "", "a".repeat(42), "!".repeat(43), "_".repeat(43)]) assert.equal(hashToken(token, "recuperacion"), null);
  assert.throws(() => crearToken("login"));
});

test("outbox cifrada autenticada, ligada a ID; sin configuración implícita o enlaces por Host", () => {
  assert.throws(() => new AutenticacionComercialService());
  assert.throws(() => new EntregaCorreoSeguridad());
  assert.throws(() => crearProtectorCorreo({ clave: Buffer.alloc(4), keyId: "x" }));
  const protector = crearProtectorCorreo({ clave: randomBytes(32), keyId: "solo-test" });
  const payload = { enlace: crearToken("recuperacion").token };
  const a = protector.sellar(payload, "entrega-1"), b = protector.sellar(payload, "entrega-1");
  assert.notEqual(a.contenido, b.contenido);
  assert.ok(!JSON.stringify(a).includes(payload.enlace));
  assert.deepEqual(protector.abrir(a, "entrega-1"), payload);
  assert.throws(() => protector.abrir(a, "entrega-2"));
  assert.throws(() => protector.abrir({ ...a, keyId: "otra" }, "entrega-1"));
  assert.throws(() => protector.abrir({ ...a, tag: randomBytes(16).toString("base64url") }, "entrega-1"));
});

test("configuración HTTPS y TTL cerradas, no admite callbacks/redirecciones de cliente", async () => {
  const { config } = await entorno();
  for (const origen of ["http://example.invalid", "https://u:p@example.invalid", "https://example.invalid/ruta", "https://example.invalid/?x=1", "https://example.invalid/#x"]) {
    assert.throws(() => new AutenticacionComercialService({ ...config, origen }));
  }
  for (const recuperacionMs of [0, -1, Infinity, "900000", 3600_001]) assert.throws(() => new AutenticacionComercialService({ ...config, recuperacionMs }));
});

test("recuperación neutral para existente, desconocido, inactivo, no verificado y Administrador", async () => {
  const { servicio, repo, operador, admin } = await entorno();
  const resultados = [];
  resultados.push(await servicio.solicitarRecuperacion({ email: operador.usuario.email }, contexto));
  resultados.push(await servicio.solicitarRecuperacion({ email: "ausente@example.invalid" }, contexto));
  resultados.push(await servicio.solicitarRecuperacion({ email: admin.usuario.email }, contexto));
  for (const cambios of [{ estado: "Inactivo" }, { estado: "Activo", emailVerificadoEn: null }]) {
    Object.assign(repo.filas.get(102), cambios);
    resultados.push(await servicio.solicitarRecuperacion({ email: operador.usuario.email }, contexto));
  }
  resultados.push(await servicio.solicitarRecuperacion({ email: "no-es-correo" }, contexto));
  for (const r of resultados) assert.deepEqual(r, RESPUESTA_NEUTRAL);
  assert.equal(repo.desafios.size, 1);
  assert.equal(repo.entregas.size, 1);
});

test("normalización, sin token en desafío/respuesta/auditoría; sin email/IP claros en índices", async () => {
  const e = await entorno();
  const r = await e.servicio.solicitarRecuperacion({ email: ` ${e.operador.usuario.email.toUpperCase()} ` }, contexto);
  const entrega = [...e.repo.entregas.values()][0];
  const payload = e.protector.abrir(entrega.sobre, entrega.id);
  const token = new URLSearchParams(new URL(payload.enlace).hash.slice(1)).get("token");
  assert.equal(payload.destinatario, e.operador.usuario.email);
  assert.equal(new URL(payload.enlace).origin, "https://cuentas.example.invalid");
  assert.equal(new URL(payload.enlace).search, "");
  for (const v of [r, [...e.repo.desafios.values()], [...e.repo.entregas.values()], e.repo.auditoria, [...e.repo.limites]]) {
    assert.ok(!JSON.stringify(v).includes(token));
  }
  assert.ok(!JSON.stringify([...e.repo.limites]).includes(e.operador.usuario.email));
  assert.ok(!JSON.stringify([...e.repo.limites]).includes(contexto.ip));
});

test("recuperación válida cambia solo contraseña/cambio obligatorio, revoca JWT y no inicia sesión", async () => {
  const e = await entorno();
  const { AuthService } = require("../src/services/AuthService");
  const secret = randomBytes(32).toString("hex");
  const auth = new AuthService({ origen: "sql", repository: e.repo, secret: () => secret });
  const anterior = structuredClone(e.repo.filas.get(102));
  const sesion = await auth.login(e.operador.usuario.email, e.operador.password);
  const body = await e.enlace();
  assert.deepEqual(await e.servicio.confirmarRecuperacion(body, contexto), { status: 204 });
  const actual = e.repo.filas.get(102);
  assert.equal(actual.versionSesion, anterior.versionSesion + 1);
  for (const campo of ["idUsuario", "email", "nombre", "rol", "estado", "emailVerificadoEn", "versionContacto"]) assert.equal(actual[campo], anterior[campo]);
  assert.equal(await bcrypt.compare(body.passwordNueva, actual.passwordHash), true);
  assert.equal(await auth.obtenerUsuarioSesion(102, { origen: "sql", versionSesion: 1 }), null);
  await assert.rejects(auth.login(actual.email, e.operador.password), codigo("CREDENCIALES_INVALIDAS"));
  assert.ok((await auth.login(actual.email, body.passwordNueva)).token);
  assert.ok(sesion.token);
  const aviso = [...e.repo.entregas.values()].find(v => v.desafioId === null);
  assert.deepEqual(e.protector.abrir(aviso.sobre, aviso.id), { destinatario: actual.email, plantilla: "seguridad-cuenta", evento: "recuperacion" });
  await assert.rejects(e.servicio.confirmarRecuperacion(body, contexto), codigo("ENLACE_INVALIDO"));
});

test("tokens inválidos, propósito incorrecto, vencidos al límite exacto y revocados no cambian cuenta", async () => {
  for (const tipo of ["invalido", "proposito", "vencido", "revocado"]) {
    const e = await entorno();
    const body = await e.enlace();
    const antes = structuredClone(e.repo.filas);
    if (tipo === "invalido") body.token = crearToken("recuperacion").token;
    if (tipo === "vencido") e.avanzar(15 * 60_000);
    if (tipo === "revocado") [...e.repo.desafios.values()][0].revocadaEn = Date.now();
    const ejecutar = tipo === "proposito" ? e.servicio.aceptarInvitacion.bind(e.servicio) : e.servicio.confirmarRecuperacion.bind(e.servicio);
    await assert.rejects(ejecutar(body, contexto), codigo("ENLACE_INVALIDO"));
    assert.deepEqual(e.repo.filas, antes);
  }
});

test("consumo concurrente de recuperación: exactamente una operación y una revocación", async () => {
  const e = await entorno();
  const body = await e.enlace();
  const resultados = await Promise.allSettled([e.servicio.confirmarRecuperacion(body, contexto), e.servicio.confirmarRecuperacion(body, contexto)]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(resultados.find(r => r.status === "rejected").reason.codigo, "ENLACE_INVALIDO");
  assert.equal(e.repo.filas.get(102).versionSesion, 2);
  assert.equal(e.repo.auditoria.filter(a => a.tipo === "PASSWORD_RESTABLECIDA").length, 1);
});

test("reenvío revoca enlaces previos, respeta cooldown y no entrega correo revocado", async () => {
  const e = await entorno();
  await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto);
  const primera = [...e.repo.desafios.values()][0];
  const entrega = [...e.repo.entregas.values()][0];
  const token = new URLSearchParams(new URL(e.protector.abrir(entrega.sobre, entrega.id).enlace).hash.slice(1)).get("token");
  await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto);
  assert.equal(e.repo.desafios.size, 1);
  e.avanzar(60_001);
  await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto);
  assert.notEqual(e.repo.desafios.get(primera.id).revocadaEn, null);
  assert.equal((await e.worker.procesarUna()).estado, "entregada");
  assert.equal(e.mensajes.length, 1);
  assert.equal(e.repo.entregas.get(entrega.id).sobre, null);
  await assert.rejects(e.servicio.confirmarRecuperacion({ token, passwordNueva: password() }, contexto), codigo("ENLACE_INVALIDO"));
});

test("cambio de contacto, sesión, rol, estado o empresa invalida recuperación", async () => {
  for (const mutar of [u => { u.email = "otra@example.invalid"; }, u => { u.versionContacto++; },
    u => { u.emailVerificadoEn = "2026-10-30T15:00:01.000Z"; }, u => { u.versionSesion++; },
    u => { u.estado = "Inactivo"; }, u => { u.rol = "Administrador"; }, (_u, repo) => { repo.empresaHabilitada = false; }]) {
    const e = await entorno(); const body = await e.enlace();
    mutar(e.repo.filas.get(102), e.repo);
    await assert.rejects(e.servicio.confirmarRecuperacion(body, contexto), codigo("ENLACE_INVALIDO"));
  }
});

test("revalida tras bcrypt y revierte consumo/password/outbox ante fallo interno", async () => {
  const e = await entorno();
  const body = await e.enlace();
  const anterior = structuredClone(e.repo.filas);
  e.repo.fallarAuditoria = true;
  await assert.rejects(e.servicio.confirmarRecuperacion(body, contexto), codigo("CUENTAS_RESULTADO_INCIERTO"));
  assert.deepEqual(e.repo.filas, anterior);
  assert.equal([...e.repo.desafios.values()][0].consumidaEn, null);
  assert.equal(e.repo.entregas.size, 1);
  e.repo.fallarAuditoria = false;
  e.servicio.hashPassword = async p => { e.repo.filas.get(102).versionSesion++; return bcrypt.hash(p, 4); };
  await assert.rejects(e.servicio.confirmarRecuperacion(body, contexto), codigo("ENLACE_INVALIDO"));
  assert.equal([...e.repo.desafios.values()][0].consumidaEn, null);
});

test("fallo de outbox no deja tokens huérfanos ni filtra existencia", async () => {
  const e = await entorno(); e.repo.fallarOutbox = true;
  assert.deepEqual(await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto), RESPUESTA_NEUTRAL);
  assert.equal(e.repo.desafios.size, 0);
  assert.equal(e.repo.auditoria.length, 0);
});

test("invitación requiere admin vigente del servidor, no rol/permisos declarados por cliente", async () => {
  const e = await entorno(); const body = { email: "alta@example.invalid", nombre: "Ficticio" };
  for (const actor of [null, { ...e.operador.usuario, rol: "Administrador", permisos: ["usuarios.crear"] }, { ...e.admin.usuario, versionSesion: 99 }]) {
    await assert.rejects(e.servicio.invitar(actor, body, contexto), codigo("SIN_PERMISO"));
  }
  e.repo.filas.get(101).debeCambiarPassword = true;
  await assert.rejects(e.servicio.invitar(e.admin.usuario, body, contexto), codigo("SIN_PERMISO"));
  assert.equal(e.repo.desafios.size, 0);
});

test("invitaciones duplicadas simultáneas generan un desafío, sin sustituir cuentas existentes", async () => {
  const e = await entorno(); const body = { email: " Alta@example.invalid ", nombre: "Ficticio" };
  const resultados = await Promise.all([e.servicio.invitar(e.admin.usuario, body, contexto), e.servicio.invitar(e.admin.usuario, body, { ip: "127.0.0.2" })]);
  resultados.forEach(r => assert.deepEqual(r, RESPUESTA_NEUTRAL));
  assert.equal(e.repo.desafios.size, 1); assert.equal(e.repo.entregas.size, 1);
  const antes = structuredClone(e.repo.filas);
  assert.deepEqual(await e.servicio.invitar(e.admin.usuario, { ...body, email: e.operador.usuario.email }, contexto), RESPUESTA_NEUTRAL);
  assert.deepEqual(e.repo.filas, antes);
  assert.equal(e.repo.desafios.size, 1);
  for (const campo of ["rol", "idEmpresa", "idRol", "estado", "versionSesion"]) {
    await assert.rejects(e.servicio.invitar(e.admin.usuario, { ...body, [campo]: "Administrador" }, contexto), codigo("CAMPO_NO_PERMITIDO"));
  }
});

test("aceptación concurrente crea un solo Operador, correo verificado y contraseña bcrypt", async () => {
  const e = await entorno(); const body = await e.enlace("invitacion");
  const resultados = await Promise.allSettled([e.servicio.aceptarInvitacion(body, contexto), e.servicio.aceptarInvitacion(body, contexto)]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  const u = await e.repo.buscarUsuario("alta@example.invalid");
  assert.equal(e.repo.filas.size, 3); assert.equal(u.rol, "Operador");
  assert.equal(u.debeCambiarPassword, false); assert.equal(u.versionSesion, 1);
  assert.equal(e.repo.filas.get(u.idUsuario).actor, 101);
  assert.ok(u.emailVerificadoEn); assert.equal(u.versionContacto, 1);
  assert.equal(await bcrypt.compare(body.passwordNueva, u.passwordHash), true);
  await assert.rejects(e.servicio.aceptarInvitacion(body, contexto), codigo("ENLACE_INVALIDO"));
});

test("invitación vencida/revocada o invitador sin autoridad no se acepta", async () => {
  for (const tipo of ["vencida", "revocada", "rol", "sesion", "existente", "rol-destino"]) {
    const e = await entorno(); const body = await e.enlace("invitacion");
    const d = [...e.repo.desafios.values()][0];
    if (tipo === "vencida") e.avanzar(86400_000);
    if (tipo === "revocada") await e.servicio.revocarInvitacion(e.admin.usuario, d.id);
    if (tipo === "rol") e.repo.filas.get(101).rol = "Operador";
    if (tipo === "sesion") e.repo.filas.get(101).versionSesion++;
    if (tipo === "existente") e.repo.filas.get(102).email = "alta@example.invalid";
    if (tipo === "rol-destino") e.repo.rolesDatos.find(r => r.nombre === "Operador").activo = false;
    await assert.rejects(e.servicio.aceptarInvitacion(body, contexto), codigo("ENLACE_INVALIDO"));
    assert.equal(e.repo.filas.size, 2);
  }
});

test("política de contraseña existente: rechaza débil/repetida sin consumir enlace", async () => {
  const e = await entorno(); const body = await e.enlace();
  await assert.rejects(e.servicio.confirmarRecuperacion({ ...body, passwordNueva: "corta" }, contexto), codigo("PASSWORD_INVALIDA"));
  await assert.rejects(e.servicio.confirmarRecuperacion({ ...body, passwordNueva: e.operador.password }, contexto), codigo("PASSWORD_REPETIDA"));
  assert.equal([...e.repo.desafios.values()][0].consumidaEn, null);
});

test("cuotas compartidas entre instancias y destinos, sin bloqueos de cuenta", async () => {
  const e = await entorno(); const otra = new AutenticacionComercialService(e.config);
  for (let n = 0; n < 21; n++) {
    assert.deepEqual(await (n % 2 ? otra : e.servicio).solicitarRecuperacion({ email: `desconocido${n}@example.invalid` }, contexto), RESPUESTA_NEUTRAL);
  }
  await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto);
  assert.equal(e.repo.desafios.size, 0);
  assert.equal(e.repo.filas.get(102).estado, "Activo");
  e.avanzar(15 * 60_000);
  await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto);
  assert.equal(e.repo.desafios.size, 1);
  for (let n = 0; n < 6; n++) {
    const resultado = e.servicio.confirmarRecuperacion({ token: "invalido", passwordNueva: password() }, contexto);
    await assert.rejects(resultado, codigo(n < 5 ? "ENLACE_INVALIDO" : "LIMITE_SOLICITUDES"));
  }
});

test("proveedor ficticio caído: estado neutral, reintento acotado y eliminación del payload", async () => {
  const e = await entorno(); let llamadas = 0;
  e.proveedor.enviar = async () => { llamadas++; throw new Error("Fallo con contenido sensible que no debe salir."); };
  const respuesta = await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto);
  for (let n = 0; n < 3; n++) {
    assert.deepEqual(await e.worker.procesarUna(), { estado: "fallida" });
    assert.deepEqual(await e.worker.procesarUna(), { estado: "sin-pendientes" });
    e.avanzar(60_001);
  }
  assert.deepEqual(respuesta, RESPUESTA_NEUTRAL); assert.equal(llamadas, 3);
  assert.equal([...e.repo.entregas.values()][0].sobre, null);
});

test("dos workers no entregan en paralelo; idempotencyKey estable y payload borrado al entregar", async () => {
  const e = await entorno(); await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto);
  const otro = new EntregaCorreoSeguridad({ repository: e.repo, protector: e.protector, proveedor: e.proveedor, ahora: e.config.ahora });
  const resultados = await Promise.all([e.worker.procesarUna(), otro.procesarUna()]);
  assert.equal(resultados.filter(r => r.estado === "entregada").length, 1);
  assert.equal(e.mensajes.length, 1);
  const entrega = [...e.repo.entregas.values()][0];
  assert.equal(e.mensajes[0].idempotencyKey, entrega.id); assert.equal(entrega.sobre, null);
});

test("ninguna ruta operativa importa o monta los componentes comerciales", () => {
  const archivos = ["app.js", "server.js", "routes/authRoutes.js", "routes/usuarioRoutes.js", "controllers/AuthController.js", "controllers/UsuarioController.js"];
  for (const archivo of archivos) {
    const contenido = fs.readFileSync(path.join(__dirname, "../src", archivo), "utf8");
    assert.doesNotMatch(contenido, /AutenticacionComercialService|EntregaCorreoSeguridad|credencialesTemporales|recuperacion\/|invitaciones\//);
  }
  const cargados = Object.keys(require.cache);
  assert.ok(!cargados.some(p => /[\\/]config[\\/]database\.js$/.test(p)));
  assert.ok(!cargados.some(p => /[\\/]dotenv[\\/]/.test(p)));
});

test("un CAS fallido de password revierte consumo; fallo de invitación revierte alta y consumo", async () => {
  const e = await entorno(); const body = await e.enlace();
  e.repo.restablecerPassword = async () => false;
  await assert.rejects(e.servicio.confirmarRecuperacion(body, contexto), codigo("ENLACE_INVALIDO"));
  assert.equal([...e.repo.desafios.values()][0].consumidaEn, null);
  assert.equal(e.repo.filas.get(102).versionSesion, 1);
  const f = await entorno(); const invitacion = await f.enlace("invitacion");
  f.repo.fallarOutbox = true;
  await assert.rejects(f.servicio.aceptarInvitacion(invitacion, contexto), codigo("CUENTAS_RESULTADO_INCIERTO"));
  assert.equal(f.repo.filas.size, 2);
  assert.equal([...f.repo.desafios.values()][0].consumidaEn, null);
});

test("emisión fallida de reemplazo conserva el enlace anterior y no reintenta automáticamente", async () => {
  const e = await entorno(); const body = await e.enlace();
  e.avanzar(60_001); e.repo.fallarOutbox = true;
  assert.deepEqual(await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto), RESPUESTA_NEUTRAL);
  assert.equal(e.repo.desafios.size, 1);
  assert.equal([...e.repo.desafios.values()][0].revocadaEn, null);
  e.repo.fallarOutbox = false;
  assert.deepEqual(await e.servicio.confirmarRecuperacion(body, contexto), { status: 204 });
});

test("entrega vencida se descarta sin proveedor; un lease vencido no se finaliza como éxito", async () => {
  const e = await entorno();
  await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, contexto);
  e.avanzar(15 * 60_000);
  assert.deepEqual(await e.worker.procesarUna(), { estado: "sin-pendientes" });
  assert.equal(e.mensajes.length, 0);
  assert.equal([...e.repo.entregas.values()][0].sobre, null);
  const f = await entorno();
  await f.servicio.solicitarRecuperacion({ email: f.operador.usuario.email }, contexto);
  f.proveedor.enviar = async payload => { f.mensajes.push(payload); f.avanzar(120_001); };
  assert.deepEqual(await f.worker.procesarUna(), { estado: "resultado-incierto" });
  const id = f.mensajes[0].idempotencyKey;
  f.proveedor.enviar = async payload => { f.mensajes.push(payload); };
  assert.deepEqual(await f.worker.procesarUna(), { estado: "entregada" });
  assert.equal(f.mensajes[1].idempotencyKey, id); // El adaptador real deberá deduplicar.
});

test("límites por destino e IP no verificada no emiten; aceptar no permite inyectar rol", async () => {
  const e = await entorno();
  for (let n = 0; n < 4; n++) {
    await e.servicio.solicitarRecuperacion({ email: e.operador.usuario.email }, { ip: `127.0.0.${n + 1}` });
    e.avanzar(60_001);
  }
  assert.equal(e.repo.desafios.size, 3);
  const f = await entorno();
  await f.servicio.solicitarRecuperacion({ email: f.operador.usuario.email }, { ip: "X-Forwarded-For: no confiable" });
  assert.equal(f.repo.desafios.size, 0);
  const body = await f.enlace("invitacion");
  await assert.rejects(f.servicio.aceptarInvitacion({ ...body, rol: "Administrador" }, contexto), codigo("CAMPO_NO_PERMITIDO"));
  await assert.rejects(f.servicio.revocarInvitacion(f.operador.usuario, [...f.repo.desafios.values()][0].id), codigo("SIN_PERMISO"));
});
