const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomBytes } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { AuthService } = require("../src/services/AuthService");
const UsuarioService = require("../src/services/UsuarioService");
const { validarPassword, perfilSeguro, comprobarPassword } = require("../src/security/seguridadUsuarios");
const { UsuariosAislados } = require("./helpers/usuariosAislados");

async function entorno() {
  const repo = new UsuariosAislados();
  const admin = await repo.agregar({ id: 1 });
  const operador = await repo.agregar({ id: 2, rol: "Operador" });
  const cuentas = new UsuarioService(repo, { cost: 4 });
  const secret = randomBytes(32).toString("hex");
  const auth = new AuthService({ origen: "sql", repository: repo, cuentas, secret: () => secret });
  return { repo, admin, operador, cuentas, auth, secret };
}
const nueva = () => randomBytes(20).toString("hex");
const es = (status, codigo) => (error) => error.status === status && (!codigo || error.codigo === codigo);
const claims = (sesion, secret) => jwt.verify(sesion.token, secret, { algorithms: ["HS256"] });

test("login SQL usa bcrypt, normaliza email y emite version sin exponer hash", async () => {
  const { auth, admin, secret } = await entorno();
  const sesion = await auth.login(` ${admin.usuario.email.toUpperCase()} `, admin.password);
  assert.equal(claims(sesion, secret).versionSesion, 1);
  assert.equal(claims(sesion, secret).origen, "sql");
  assert.equal(claims(sesion, secret).exp - claims(sesion, secret).iat, 7200);
  assert.equal(sesion.usuario.gestionCuentasDisponible, true);
  assert.equal(Object.hasOwn(sesion.usuario, "passwordHash"), false);
  assert.equal(Object.hasOwn(sesion.usuario, "versionSesion"), false);
});

test("login SQL desconocido e incorrecto son indistinguibles por codigo/mensaje", async () => {
  const { auth, admin } = await entorno();
  const fallos = [];
  for (const [email, password] of [["desconocido@example.invalid", nueva()], [admin.usuario.email, nueva()]]) {
    try { await auth.login(email, password); assert.fail("El login debe rechazarse"); }
    catch (error) { fallos.push({ status: error.status, codigo: error.codigo, mensaje: error.message }); }
  }
  assert.deepEqual(fallos[0], fallos[1]);
  assert.equal(fallos[0].status, 401);
});

test("Propietario, cuenta/rol inactivos y password incorrecta no se autentican", async () => {
  const { auth, repo, admin } = await entorno();
  await assert.rejects(auth.login(admin.usuario.email, nueva()), es(401));
  repo.filas.get(1).estado = "Inactivo";
  await assert.rejects(auth.login(admin.usuario.email, admin.password), es(401));
  repo.filas.get(1).estado = "Activo";
  repo.rolesDatos[0].activo = false;
  await assert.rejects(auth.login(admin.usuario.email, admin.password), es(401));
  repo.rolesDatos[0].activo = true;
  repo.filas.get(1).rol = "Propietario";
  await assert.rejects(auth.login(admin.usuario.email, admin.password), es(401));
});

test("JWT mock y versiones obsoletas se rechazan; SQL caido no recupera mocks", async () => {
  const { auth, repo, admin, secret } = await entorno();
  const antes = repo.lecturas;
  assert.equal(await auth.obtenerUsuarioSesion(1, { idUsuario: 1, email: admin.usuario.email }), null);
  assert.equal(repo.lecturas, antes);
  const payload = claims(await auth.login(admin.usuario.email, admin.password), secret);
  assert.ok(await auth.obtenerUsuarioSesion(1, payload));
  repo.filas.get(1).versionSesion++;
  assert.equal(await auth.obtenerUsuarioSesion(1, payload), null);
  repo.obtener = async () => { throw new Error("Error de conexion con datos que no deben salir"); };
  await assert.rejects(auth.obtenerUsuarioSesion(1, payload), es(503));
});

test("alta resuelve nombres SQL, fuerza cambio y rechaza IDs/campos internos/Propietario", async () => {
  const { cuentas, admin, repo } = await entorno();
  const body = { nombre: "Alta", email: "Nueva@example.invalid", rol: "Operador", passwordTemporal: nueva() };
  const resultado = await cuentas.crear(admin.usuario, body);
  assert.equal(resultado.rol, "Operador");
  assert.equal(resultado.email, "nueva@example.invalid");
  assert.equal(resultado.debeCambiarPassword, true);
  assert.equal(repo.filas.get(resultado.idUsuario).idRol, 73); // Resuelto por nombre; no asume IDs 1/3.
  for (const campo of ["idRol", "estado", "passwordHash", "versionSesion", "debeCambiarPassword", "idUsuarioCreacion"]) {
    await assert.rejects(cuentas.crear(admin.usuario, { ...body, [campo]: 1 }), es(400, "CAMPO_NO_PERMITIDO"));
  }
  await assert.rejects(cuentas.crear(admin.usuario, { ...body, rol: "Propietario" }), es(400));
  await assert.rejects(cuentas.crear(admin.usuario, { ...body, email: ` ${body.email.toUpperCase()} ` }), es(409, "EMAIL_DUPLICADO"));
});

test("edicion propia solo admite nombre y conserva tokens; revision vieja falla", async () => {
  const { cuentas, operador } = await entorno();
  const actual = await cuentas.editarNombre(operador.usuario, { nombre: "Otro nombre", versionRegistro: operador.usuario.versionRegistro });
  assert.equal(actual.versionSesion, 1);
  await assert.rejects(cuentas.editarNombre(operador.usuario, { nombre: "Viejo", versionRegistro: operador.usuario.versionRegistro }), es(409, "REVISION_VENCIDA"));
  for (const campo of ["rol", "email", "idUsuario", "estado", "passwordHash", "versionSesion"]) {
    await assert.rejects(cuentas.editarNombre(operador.usuario, { nombre: "Nombre", versionRegistro: actual.versionRegistro, [campo]: 1 }), es(400));
  }
});

test("cambiar password exige actual, password distinta y revoca JWT anteriores", async () => {
  const { cuentas, auth, operador, secret } = await entorno();
  const payload = claims(await auth.login(operador.usuario.email, operador.password), secret);
  const body = { passwordActual: operador.password, passwordNueva: nueva(), versionRegistro: operador.usuario.versionRegistro };
  await assert.rejects(cuentas.cambiarPassword(operador.usuario, { ...body, passwordActual: nueva() }), es(400, "PASSWORD_ACTUAL_INVALIDA"));
  await assert.rejects(cuentas.cambiarPassword(operador.usuario, { ...body, passwordNueva: operador.password }), es(400, "PASSWORD_REPETIDA"));
  const cambiado = await cuentas.cambiarPassword(operador.usuario, body);
  assert.equal(cambiado.versionSesion, 2);
  assert.equal(cambiado.debeCambiarPassword, false);
  assert.equal(await auth.obtenerUsuarioSesion(2, payload), null);
  assert.ok(await auth.login(operador.usuario.email, body.passwordNueva));
  await assert.rejects(auth.login(operador.usuario.email, operador.password), es(401));
});

test("restablecimiento revoca tokens, exige cambio y mantiene cuenta inactiva", async () => {
  const { cuentas, repo, admin, operador, auth, secret } = await entorno();
  const payload = claims(await auth.login(operador.usuario.email, operador.password), secret);
  const temporal = nueva();
  const reseteado = await cuentas.restablecer(admin.usuario, 2, { passwordTemporal: temporal, versionRegistro: operador.usuario.versionRegistro });
  assert.equal(reseteado.debeCambiarPassword, true);
  assert.equal(await auth.obtenerUsuarioSesion(2, payload), null);
  const login = await auth.login(operador.usuario.email, temporal);
  const obligado = await auth.obtenerUsuarioSesion(2, claims(login, secret));
  await assert.rejects(cuentas.editarNombre(obligado, { nombre: "No permitido", versionRegistro: reseteado.versionRegistro }), es(403, "PASSWORD_CHANGE_REQUIRED"));
  await cuentas.cambiarPassword(obligado, { passwordActual: temporal, passwordNueva: nueva(), versionRegistro: reseteado.versionRegistro });
  repo.filas.get(2).estado = "Inactivo";
  const inactivo = await repo.obtener(2);
  const respuesta = await cuentas.restablecer(admin.usuario, 2, { passwordTemporal: nueva(), versionRegistro: inactivo.versionRegistro });
  assert.equal(respuesta.estado, "Inactivo");
  await assert.rejects(cuentas.restablecer(admin.usuario, 1, { passwordTemporal: nueva(), versionRegistro: admin.usuario.versionRegistro }), es(403, "CAMBIO_PROPIO"));
});

test("rol, email y estado invalidan sesiones; permisos provienen del rol vigente", async () => {
  const { cuentas, admin, operador, repo, auth, secret } = await entorno();
  const payload = claims(await auth.login(operador.usuario.email, operador.password), secret);
  const editado = await cuentas.editar(admin.usuario, 2, { nombre: "Operador", email: "otro@example.invalid", rol: "Administrador", versionRegistro: operador.usuario.versionRegistro });
  assert.ok(editado.usuario.permisos.includes("usuarios.crear"));
  assert.equal(await auth.obtenerUsuarioSesion(2, payload), null);
  const nuevo = await repo.obtener(2);
  await cuentas.cambiarEstado(admin.usuario, 2, { estado: "Inactivo", versionRegistro: nuevo.versionRegistro });
  await assert.rejects(auth.login("otro@example.invalid", operador.password), es(401));
});

test("ultimo Admin no se desactiva/degrada; dos cambios concurrentes dejan uno", async () => {
  const { cuentas, admin, repo } = await entorno();
  await assert.rejects(cuentas.cambiarEstado(admin.usuario, 1, { estado: "Inactivo", versionRegistro: admin.usuario.versionRegistro }), es(409, "ULTIMO_ADMINISTRADOR"));
  await assert.rejects(cuentas.editar(admin.usuario, 1, { nombre: "Admin", email: admin.usuario.email, rol: "Operador", versionRegistro: admin.usuario.versionRegistro }), es(409, "ULTIMO_ADMINISTRADOR"));
  const segundo = await repo.agregar({ id: 3 });
  const resultados = await Promise.allSettled([
    cuentas.cambiarEstado(admin.usuario, 1, { estado: "Inactivo", versionRegistro: admin.usuario.versionRegistro }),
    cuentas.editar(segundo.usuario, 3, { nombre: "Otro", email: segundo.usuario.email, rol: "Operador", versionRegistro: segundo.usuario.versionRegistro }),
  ]);
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await repo.contarAdministradoresActivos(), 1);
});

test("actor que pierde privilegios mientras espera el bloqueo no puede escribir", async () => {
  const { cuentas, admin, repo } = await entorno();
  const segundo = await repo.agregar({ id: 3 });
  const resultados = await Promise.allSettled([
    cuentas.cambiarEstado(admin.usuario, 3, { estado: "Inactivo", versionRegistro: segundo.usuario.versionRegistro }),
    cuentas.cambiarEstado(segundo.usuario, 1, { estado: "Inactivo", versionRegistro: admin.usuario.versionRegistro }),
  ]);
  assert.equal(resultados[0].status, "fulfilled");
  assert.equal(resultados[1].reason.status, 401);
  assert.equal(await repo.contarAdministradoresActivos(), 1);
});

test("dos resets sobre la misma revision no sobrescriben; logout revoca todas", async () => {
  const { cuentas, repo, admin, operador, auth, secret } = await entorno();
  const resultados = await Promise.allSettled([nueva(), nueva()].map((passwordTemporal) => cuentas.restablecer(admin.usuario, 2, { passwordTemporal, versionRegistro: operador.usuario.versionRegistro })));
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(resultados.find((r) => r.status === "rejected").reason.codigo, "REVISION_VENCIDA");
  const login = await auth.login(admin.usuario.email, admin.password);
  await cuentas.logout(admin.usuario);
  assert.equal(await auth.obtenerUsuarioSesion(1, claims(login, secret)), null);
  assert.equal((await repo.obtener(1)).versionSesion, 2);
});

test("bootstrap exige autorizacion, no reemplaza cuentas y serializa dos altas", async () => {
  const repo = new UsuariosAislados();
  const cuentas = new UsuarioService(repo, { cost: 4 });
  const body = { nombre: "Inicial", email: "primero@example.invalid", password: nueva() };
  await assert.rejects(cuentas.bootstrap(body), es(403));
  assert.equal(repo.escrituras, 0);
  const resultados = await Promise.allSettled([1, 2].map(() => cuentas.bootstrap({ ...body, escrituraAutorizada: true })));
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(repo.filas.size, 1);
  assert.equal(await repo.contarAdministradoresActivos(), 1);
  assert.deepEqual(repo.rolesDatos.map((r) => r.nombre), ["Administrador", "Operador", "Propietario"]);
  const respuesta = resultados.find((r) => r.status === "fulfilled").value;
  assert.equal(respuesta.debeCambiarPassword, true);
  assert.equal(Object.hasOwn(respuesta, "passwordHash"), false);
});

test("politica de password cuenta caracteres y bytes, evita truncamiento bcrypt", async () => {
  assert.throws(() => validarPassword("a".repeat(12) + "\n"), es(400));
  assert.throws(() => validarPassword("a".repeat(11)), es(400));
  assert.throws(() => validarPassword("😀".repeat(19)), es(400));
  assert.equal(validarPassword("😀".repeat(18)).length, 36);
  assert.equal(validarPassword("a".repeat(72)).length, 72);
  assert.throws(() => validarPassword("a".repeat(73)), es(400));
  assert.equal(await comprobarPassword(nueva(), "texto sin hash"), false);
  const perfil = perfilSeguro({ idUsuario: 1, nombre: "Prueba", email: "prueba@example.invalid", rol: "Operador", estado: "Activo", versionRegistro: "0000000000000001", passwordHash: nueva(), datoOculto: {} });
  assert.equal(Object.hasOwn(perfil, "passwordHash"), false);
  assert.equal(Object.hasOwn(perfil, "datoOculto"), false);
});

test("Operador tampoco administra desde el servicio y roles inactivos no se asignan", async () => {
  const { cuentas, repo, admin, operador } = await entorno();
  const body = { nombre: "Alta", email: "otra@example.invalid", rol: "Operador", passwordTemporal: nueva() };
  await assert.rejects(cuentas.crear(operador.usuario, body), es(403, "SIN_PERMISO"));
  await assert.rejects(cuentas.cambiarEstado(operador.usuario, 1, { estado: "Inactivo", versionRegistro: admin.usuario.versionRegistro }), es(403));
  repo.rolesDatos[1].activo = false;
  await assert.rejects(cuentas.crear(admin.usuario, body), es(409, "ROL_INACTIVO"));
  assert.equal(repo.escrituras, 0);
});

test("preparacion SQL exige destino, permisos y primer Admin; mock no consulta", async () => {
  const { auth, repo } = await entorno();
  const contexto = { base: "HostFlow", roles: 1, lectura: 1, alta: 1, edicion: 1, bloqueo: 1 };
  repo.request = async () => ({ query: async () => ({ recordset: [contexto] }) });
  await auth.comprobarPreparacionSQL();
  contexto.alta = 0;
  await assert.rejects(auth.comprobarPreparacionSQL(), es(503, "SQL_NO_PREPARADO"));
  contexto.alta = 1; contexto.base = "otra";
  await assert.rejects(auth.comprobarPreparacionSQL(), es(503));
  contexto.base = "HostFlow"; repo.filas.clear();
  await assert.rejects(auth.comprobarPreparacionSQL(), es(503));
  const mock = new AuthService({ origen: "mock", repository: new Proxy({}, { get() { throw new Error("SQL prohibido"); } }) });
  await mock.comprobarPreparacionSQL();
});

test("origen ausente conserva mock; configuracion invalida no habilita mocks", () => {
  const { origenAutenticacion } = require("../src/config/autenticacion");
  const anterior = process.env.HOSTFLOW_AUTH_SOURCE;
  try {
    delete process.env.HOSTFLOW_AUTH_SOURCE;
    assert.equal(origenAutenticacion(), "mock");
    for (const valor of ["", "SQL", "desconocido"]) {
      process.env.HOSTFLOW_AUTH_SOURCE = valor;
      assert.throws(() => origenAutenticacion());
    }
    process.env.HOSTFLOW_AUTH_SOURCE = "sql";
    assert.equal(origenAutenticacion(), "sql");
  } finally {
    if (anterior === undefined) delete process.env.HOSTFLOW_AUTH_SOURCE;
    else process.env.HOSTFLOW_AUTH_SOURCE = anterior;
  }
});
