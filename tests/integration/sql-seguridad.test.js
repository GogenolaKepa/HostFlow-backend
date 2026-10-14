const { test } = require("node:test");
const assert = require("node:assert/strict");

const { randomBytes, randomUUID } = require("node:crypto");
const UsuarioRepository = require("../../src/repositories/UsuarioRepository");
const UsuarioService = require("../../src/services/UsuarioService");
const { AuthService } = require("../../src/services/AuthService");
const { configuracionSQLAislada, driverProtegido, ejecutarConFixtures } = require("./sqlAislado");
const { RECURSO_BLOQUEO, ErrorSeguridad, revisionDe, numerosErrorSQL } = require("../../src/security/seguridadUsuarios");
const cambioPasswordObligatorio = require("../../src/middlewares/cambioPasswordObligatorio");

test("SQL Server real: seguridad en base local marcada y desechable", {
  skip: process.env.HOSTFLOW_SQL_TEST_ENABLED !== "1",
}, async (t) => {
  const config = configuracionSQLAislada(process.env);
  const contexto = { runId: randomUUID(), vacia: true };
  const sql = driverProtegido(require("mssql/msnodesqlv8"), contexto, { ...process.env });
  let pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    pool.request = () => new sql.Request(pool);
    await ejecutarConFixtures(pool, contexto, async () => {
      const repo = new UsuarioRepository({ getPool: () => Promise.resolve(pool), driver: sql });
      const cuentas = new UsuarioService(repo); // Cost 12 real, no mocks.
      const secreto = randomBytes(32).toString("hex");
      const auth = new AuthService({ origen: "sql", repository: repo, cuentas, secret: () => secreto });
      const temporal = randomBytes(20).toString("hex");
      const bootstrap = { nombre: "Inicial aislado", email: "admin@example.invalid", password: temporal, escrituraAutorizada: true };
      await t.test("DDL real: columnas, tipos, calculada persistida, indices y restricciones confiables", async () => {
        const { recordset: columnas } = await pool.request().query(`SELECT name,system_type_id,max_length,is_nullable,is_computed
          FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Usuarios') ORDER BY column_id;`);
        const esperadas = [
          ["IdUsuario",56,4,false,false], ["Nombre",231,240,false,false], ["Email",231,508,false,false],
          ["EmailNormalizado",231,508,true,true], ["PasswordHash",167,255,false,false], ["IdRol",56,4,false,false],
          ["Estado",231,20,false,false], ["DebeCambiarPassword",104,1,false,false], ["VersionSesion",56,4,false,false],
          ["FechaCreacion",42,6,false,false], ["FechaActualizacion",42,6,false,false], ["FechaCambioPassword",42,6,false,false],
          ["IdUsuarioCreacion",56,4,true,false], ["IdUsuarioActualizacion",56,4,true,false], ["VersionRegistro",189,8,false,false],
        ];
        assert.deepEqual(columnas.map(c => [c.name,c.system_type_id,c.max_length,c.is_nullable,c.is_computed]), esperadas);
        const { recordset: calculada } = await pool.request().query("SELECT is_persisted FROM sys.computed_columns WHERE object_id=OBJECT_ID(N'dbo.Usuarios');");
        assert.equal(calculada[0].is_persisted, true);
        const { recordset: indices } = await pool.request().query(`SELECT i.name,i.is_unique,i.is_disabled,c.name AS columna
          FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
          JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
          WHERE i.object_id=OBJECT_ID(N'dbo.Usuarios') ORDER BY i.name,ic.key_ordinal;`);
        assert.deepEqual(indices.map(i => [i.name,i.is_unique,i.is_disabled,i.columna]), [
          ["IX_Usuarios_Rol_Estado",false,false,"IdRol"], ["IX_Usuarios_Rol_Estado",false,false,"Estado"],
          ["PK_Usuarios",true,false,"IdUsuario"], ["UX_Usuarios_EmailNormalizado",true,false,"EmailNormalizado"],
        ]);
        const { recordset: checks } = await pool.request().query("SELECT name,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Usuarios');");
        assert.equal(checks.length, 5);
        assert.ok(checks.every(c => !c.is_disabled && !c.is_not_trusted));
        const { recordset: fks } = await pool.request().query("SELECT name,is_disabled,is_not_trusted,delete_referential_action,update_referential_action FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Usuarios');");
        assert.equal(fks.length, 3);
        assert.ok(fks.every(c => !c.is_disabled && !c.is_not_trusted && c.delete_referential_action===0 && c.update_referential_action===0));
      });
      await t.test("dos bootstrap concurrentes crean exactamente un Admin", async () => {
        const resultados = await Promise.allSettled([cuentas.bootstrap(bootstrap), cuentas.bootstrap(bootstrap)]);
        assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(await repo.contarAdministradoresActivos(), 1);
      });
      const inicial = await repo.buscarPorEmail(bootstrap.email);
      assert.ok(inicial);
      await t.test("login SQL, bcrypt real y bloqueo de negocio por cambio obligatorio", async () => {
        // Solo se comparan booleanos: nunca incluir passwords/hashes/JWT en aserciones.
        assert.equal(await require("bcryptjs").compare(temporal, inicial.passwordHash), true);
        assert.equal(require("bcryptjs").getRounds(inicial.passwordHash), 12);
        assert.equal(inicial.passwordHash === temporal, false);
        const login = await auth.login(bootstrap.email, temporal);
        assert.equal(login.usuario.debeCambiarPassword, true);
        assert.equal(Object.hasOwn(login.usuario,"passwordHash"), false);
        let status, codigo, continuaciones = 0;
        cambioPasswordObligatorio({ usuario: await auth.obtenerUsuarioSesion(inicial.idUsuario, require("jsonwebtoken").verify(login.token,secreto)) },
          { status(n) { status=n; return this; }, json(dto) { codigo=dto.codigo; } }, () => continuaciones++);
        assert.equal(status,403); assert.equal(codigo,"PASSWORD_CHANGE_REQUIRED"); assert.equal(continuaciones,0);
        await assert.rejects(cuentas.editarNombre(inicial,{ nombre:"Antes del cambio",versionRegistro:revisionDe(inicial) }), e => e.codigo==="PASSWORD_CHANGE_REQUIRED");
        await assert.rejects(auth.login(bootstrap.email,randomBytes(20).toString("hex")), e => e.status===401);
        await assert.rejects(cuentas.cambiarPassword(inicial,{passwordActual:randomBytes(20).toString("hex"),passwordNueva:randomBytes(20).toString("hex"),versionRegistro:revisionDe(inicial)}), e => e.codigo==="PASSWORD_ACTUAL_INVALIDA");
      });
      const tokenInicial = auth.emitirSesion(inicial).token;
      const definitiva = randomBytes(20).toString("hex");
      const cambiado = await cuentas.cambiarPassword(inicial, { passwordActual: temporal,
        passwordNueva: definitiva, versionRegistro: inicial.versionRegistro.toString("hex") });
      const admin = cambiado;
      await t.test("cambio de password revoca JWT previo y habilita el login SQL", async () => {
        assert.equal(admin.debeCambiarPassword,false);
        assert.equal(admin.versionSesion,inicial.versionSesion+1);
        assert.equal(await auth.obtenerUsuarioSesion(inicial.idUsuario,require("jsonwebtoken").verify(tokenInicial,secreto)),null);
        const sesion = await auth.login(bootstrap.email,definitiva);
        assert.ok(await auth.obtenerUsuarioSesion(admin.idUsuario,require("jsonwebtoken").verify(sesion.token,secreto)));
        assert.equal(await auth.obtenerUsuarioSesion(admin.idUsuario,{origen:"mock",versionSesion:admin.versionSesion}),null);
      });
      await t.test("CHECK y FKs reales rechazan valores invalidos y dejan las filas intactas", async () => {
        const modificaciones = ["Nombre=N' '","Email=N' '","PasswordHash='corto'","Estado=N'Otro'","VersionSesion=0","IdRol=-1","IdUsuarioCreacion=-1","IdUsuarioActualizacion=-1"];
        for (const cambio of modificaciones) {
          const req = pool.request(); req.input("Id",sql.Int,admin.idUsuario);
          await assert.rejects(req.query(`UPDATE dbo.Usuarios SET ${cambio} WHERE IdUsuario=@Id;`),e => e.number===547);
        }
        const actual = await repo.obtener(admin.idUsuario);
        assert.equal(revisionDe(actual),revisionDe(admin));
        assert.equal(actual.estado,"Activo");
      });
      await t.test("unicidad del correo normalizado tambien se impone ante INSERT directo", async () => {
        const req = pool.request(); req.input("Hash",sql.VarChar(255),inicial.passwordHash);
        await assert.rejects(req.query("INSERT INTO dbo.Usuarios(Nombre,Email,PasswordHash,IdRol) SELECT N'Duplicado directo',N' ADMIN@example.invalid ',@Hash,IdRol FROM dbo.Roles WHERE Nombre=N'Administrador';"),e => [2601,2627].includes(e.number));
        assert.equal(await repo.contarAdministradoresActivos(),1);
      });
      await t.test("alta, activacion, reset, rol y correo revocan las sesiones SQL", async () => {
        const creada = await cuentas.crear(admin,{nombre:"Ciclo operador",email:"ciclo@example.invalid",rol:"Operador",passwordTemporal:temporal});
        let fila = await repo.obtener(creada.idUsuario);
        const clave = randomBytes(20).toString("hex");
        fila = await cuentas.cambiarPassword(fila,{passwordActual:temporal,passwordNueva:clave,versionRegistro:revisionDe(fila)});
        let payload = require("jsonwebtoken").verify((await auth.login(fila.email,clave)).token,secreto);
        const inactiva = await cuentas.cambiarEstado(admin,fila.idUsuario,{estado:"Inactivo",versionRegistro:revisionDe(fila)});
        assert.equal(inactiva.usuario.estado,"Inactivo");
        assert.equal(await auth.obtenerUsuarioSesion(fila.idUsuario,payload),null);
        await assert.rejects(auth.login(fila.email,clave),e=>e.status===401);
        await cuentas.cambiarEstado(admin,fila.idUsuario,{estado:"Activo",versionRegistro:inactiva.usuario.versionRegistro});
        fila = await repo.obtener(fila.idUsuario);
        payload = require("jsonwebtoken").verify((await auth.login(fila.email,clave)).token,secreto);
        const editada = await cuentas.editar(admin,fila.idUsuario,{nombre: fila.nombre,email:"ciclo.nuevo@example.invalid",rol:"Administrador",versionRegistro:revisionDe(fila)});
        assert.equal(editada.usuario.rol,"Administrador");
        assert.equal(await auth.obtenerUsuarioSesion(fila.idUsuario,payload),null);
        await assert.rejects(auth.login(fila.email,clave),e=>e.status===401);
        fila = await repo.obtener(fila.idUsuario);
        await cuentas.editar(admin,fila.idUsuario,{nombre:fila.nombre,email:fila.email,rol:"Operador",versionRegistro:revisionDe(fila)});
        fila = await repo.obtener(fila.idUsuario);
        payload = require("jsonwebtoken").verify((await auth.login(fila.email,clave)).token,secreto);
        const nuevaTemporal = randomBytes(20).toString("hex");
        const reset = await cuentas.restablecer(admin,fila.idUsuario,{passwordTemporal:nuevaTemporal,versionRegistro:revisionDe(fila)});
        assert.equal(reset.debeCambiarPassword,true);
        assert.equal(await auth.obtenerUsuarioSesion(fila.idUsuario,payload),null);
        await assert.rejects(auth.login(fila.email,clave),e=>e.status===401);
        assert.equal((await auth.login(fila.email,nuevaTemporal)).usuario.debeCambiarPassword,true);
      });
      await t.test("Propietario e inactividad de Roles se rechazan en SQL sin cambiar el catalogo", async () => {
        await assert.rejects(cuentas.crear(admin,{nombre:"Rol no permitido",email:"no@example.invalid",rol:"Propietario",passwordTemporal:temporal}),e=>e.codigo==="ROL_NO_PERMITIDO");
        await repo.transaccionSeguridad(async tx => {
          const propietario = await tx.request(); propietario.input("Hash",sql.VarChar(255),inicial.passwordHash);
          await propietario.query("INSERT INTO dbo.Usuarios(Nombre,Email,PasswordHash,IdRol) SELECT N'Propietario ficticio',N'propietario@example.invalid',@Hash,IdRol FROM dbo.Roles WHERE Nombre=N'Propietario';");
        });
        await assert.rejects(auth.login("propietario@example.invalid",temporal),e=>e.status===401);
        const fila = await repo.buscarPorEmail("propietario@example.invalid");
        assert.equal(await auth.obtenerUsuarioSesion(fila.idUsuario,{origen:"sql",versionSesion:fila.versionSesion}),null);
        // Solo la fixture local: rollback restaura el rol incluso si una asercion falla.
        await assert.rejects(repo.transaccionSeguridad(async tx => {
          const req = await tx.request(); req.input("Hash",sql.VarChar(255),inicial.passwordHash);
          await req.query("INSERT INTO dbo.Usuarios(Nombre,Email,PasswordHash,IdRol) SELECT N'Rol inactivo ficticio',N'rolinactivo@example.invalid',@Hash,IdRol FROM dbo.Roles WHERE Nombre=N'Operador';");
          await (await tx.request()).query("UPDATE dbo.Roles SET Activo=0 WHERE Nombre=N'Operador';");
          const authTX = new AuthService({origen:"sql",repository:tx,secret:()=>secreto});
          await assert.rejects(authTX.login("rolinactivo@example.invalid",temporal),e=>e.status===401);
          assert.equal(await tx.roles.resolverActivo("Operador"),null);
          const op = await tx.buscarPorEmail("rolinactivo@example.invalid");
          assert.equal(await authTX.obtenerUsuarioSesion(op.idUsuario,{origen:"sql",versionSesion:op.versionSesion}),null);
          throw new ErrorSeguridad(409,"REVERTIR_FIXTURE","Revertir solo fixture local.");
        }),e=>e.codigo==="REVERTIR_FIXTURE");
        assert.ok(await repo.roles.resolverActivo("Operador"));
      });
      await t.test("rollback real revierte INSERT y no deja una cuenta parcial", async () => {
        await assert.rejects(repo.transaccionSeguridad(async tx => {
          const rol = await tx.roles.resolverActivo("Operador");
          await tx.crear({nombre:"Rollback ficticio",email:"rollback@example.invalid",passwordHash:inicial.passwordHash,idRol:rol.idRol,actor:admin.idUsuario});
          throw new ErrorSeguridad(409,"ROLLBACK_PRUEBA","Rollback de prueba local.");
        }),e=>e.codigo==="ROLLBACK_PRUEBA");
        assert.equal(await repo.buscarPorEmail("rollback@example.invalid"),null);
      });
      await t.test("dos ediciones simultaneas de la misma revision producen un exito y un 409", async () => {
        const actor = await repo.obtener(admin.idUsuario);
        const resultados = await Promise.allSettled(["Edicion concurrente A","Edicion concurrente B"].map(nombre=>cuentas.editarNombre(actor,{nombre,versionRegistro:revisionDe(actor)})));
        assert.equal(resultados.filter(r=>r.status==="fulfilled").length,1);
        assert.equal(resultados.find(r=>r.status==="rejected").reason.codigo,"REVISION_VENCIDA");
        const actual = await repo.obtener(actor.idUsuario);
        assert.ok(["Edicion concurrente A","Edicion concurrente B"].includes(actual.nombre));
        assert.notEqual(revisionDe(actual),revisionDe(actor));
        assert.equal(actual.versionSesion,actor.versionSesion);
      });
      await t.test("applock real devuelve 0, 1 tras espera y -1 por timeout; repositorio aborta sin operar", async () => {
        const solicitar = async (transaction, timeout) => {
          const req = new sql.Request(transaction); req.input("Recurso",sql.NVarChar(255),RECURSO_BLOQUEO); req.input("Espera",sql.Int,timeout);
          return req.query("DECLARE @Resultado int; EXEC @Resultado=sys.sp_getapplock @Resource=@Recurso,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=@Espera,@DbPrincipal='public'; SELECT @Resultado AS resultado;");
        };
        const holder = new sql.Transaction(pool), waiter = new sql.Transaction(pool);
        let h = false, w = false;
        try {
          await holder.begin(); h=true;
          assert.equal((await solicitar(holder,0)).recordset[0].resultado,0);
          await waiter.begin(); w=true;
          assert.equal((await solicitar(waiter,0)).recordset[0].resultado,-1);
          const esperado = solicitar(waiter,5000);
          // Confirmar espera con metadatos del motor, no depender de una pausa arbitraria.
          let esperando = false;
          for (let i=0;i<100 && !esperando;i++) {
            const {recordset} = await pool.request().query("SELECT COUNT(*) AS cantidad FROM sys.dm_tran_locks WHERE resource_database_id=DB_ID() AND resource_type=N'APPLICATION' AND request_status=N'WAIT';");
            esperando=recordset[0].cantidad>0;
            if (!esperando) await new Promise(resolve=>setTimeout(resolve,20));
          }
          await holder.commit(); h=false;
          const retorno = (await esperado).recordset[0].resultado;
          assert.equal(esperando,true); assert.equal(retorno,1);
          let ejecutada = false;
          await assert.rejects(repo.transaccionSeguridad(async()=>{ejecutada=true;}),e=>e.codigo==="OPERACION_CONCURRENTE");
          assert.equal(ejecutada,false);
        } finally {
          if (h) await holder.rollback();
          if (w) await waiter.rollback();
        }
        assert.equal(await repo.transaccionSeguridad(async()=>true),true);
      });
      await t.test("indices normalizan mayusculas/espacios y mantienen unicidad en inactivos", async () => {
        const nuevo = await cuentas.crear(admin, { nombre: "Operador", email: "op@example.invalid", rol: "Operador", passwordTemporal: randomBytes(20).toString("hex") });
        await cuentas.cambiarEstado(admin, nuevo.idUsuario, { estado: "Inactivo", versionRegistro: nuevo.versionRegistro });
        await assert.rejects(cuentas.crear(admin, { nombre: "Duplicado", email: " OP@example.invalid ", rol: "Operador", passwordTemporal: randomBytes(20).toString("hex") }), (e) => e.codigo === "EMAIL_DUPLICADO");
        assert.ok(await repo.buscarPorEmail("op@example.invalid"));
      });
      await t.test("rowversion viejo no sobrescribe; password/logout revocan tokens", async () => {
        const vigente = await repo.obtener(admin.idUsuario);
        const otra = await cuentas.editarNombre(vigente, { nombre: "Nuevo nombre", versionRegistro: revisionDe(vigente) });
        await assert.rejects(cuentas.editarNombre(vigente, { nombre: "Revision vieja", versionRegistro: revisionDe(vigente) }), (e) => e.codigo === "REVISION_VENCIDA");
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
      await t.test("ultimo Admin no se degrada ni desactiva despues de la concurrencia", async () => {
        const listado = await repo.listar({estado:"Activo"});
        const perfil = listado.usuarios.find(u=>u.rol==="Administrador");
        const actor = await repo.obtener(perfil.idUsuario);
        await assert.rejects(cuentas.editar(actor,actor.idUsuario,{nombre:actor.nombre,email:actor.email,rol:"Operador",versionRegistro:revisionDe(actor)}),e=>e.codigo==="ULTIMO_ADMINISTRADOR");
        await assert.rejects(cuentas.cambiarEstado(actor,actor.idUsuario,{estado:"Inactivo",versionRegistro:revisionDe(actor)}),e=>e.codigo==="ULTIMO_ADMINISTRADOR");
        assert.equal(await repo.contarAdministradoresActivos(),1);
      });
      await t.test("roles existentes conservados; Propietario no asignable; FKs/CHECK presentes", async () => {
        const { recordset } = await pool.request().query("SELECT IdRol, Nombre, Activo FROM dbo.Roles ORDER BY IdRol;");
        assert.deepEqual(recordset.map((r) => r.Nombre), ["Administrador", "Propietario", "Operador"]);
        assert.ok(recordset.every((r) => r.Activo));
        assert.equal(await repo.roles.resolverActivo("Propietario"), null);
        const { recordset: constraints } = await pool.request().query("SELECT COUNT(*) AS cantidad FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Usuarios');");
        assert.equal(constraints[0].cantidad, 3);
        let codigos = [];
        try {
          const req = pool.request();
          req.input("Hash", sql.VarChar(255), await require("bcryptjs").hash(temporal, 12));
          await req.query("INSERT INTO dbo.Usuarios(Nombre,Email,PasswordHash,IdRol) VALUES(N'FK aislada',N'fk@example.invalid',@Hash,-1);");
        } catch (error) { codigos = numerosErrorSQL(error); }
        assert.ok(codigos.includes(547), `La FK debe rechazar el rol con 547; codigos recibidos: ${codigos.join(",")}.`);
        codigos = [];
        try {
          const req = pool.request();
          req.input("Hash", sql.VarChar(255), await require("bcryptjs").hash(temporal, 12));
          await req.query("INSERT INTO dbo.Usuarios(Nombre,Email,PasswordHash,IdRol,Estado) SELECT N'CHECK aislada',N'check@example.invalid',@Hash,IdRol,N'Otro' FROM dbo.Roles WHERE Nombre=N'Operador';");
        } catch (error) { codigos = numerosErrorSQL(error); }
        assert.ok(codigos.includes(547), `El CHECK debe rechazar el estado con 547; codigos recibidos: ${codigos.join(",")}.`);
      });
    });
  } catch {
    // No imprimir errores del driver que puedan incluir parametros/credenciales.
    throw new Error("Falló la integración SQL aislada; no se imprimieron detalles sensibles.");
  } finally {
    if (pool) {
      try { await pool.close(); } catch { /* No imprimir detalles del driver. */ }
    }
  }
});
