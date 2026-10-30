const { ErrorSeguridad, RECURSO_BLOQUEO } = require("../security/seguridadUsuarios");
const fecha = ms => new Date(ms);
const ms = valor => valor == null ? null : new Date(valor).getTime();

// Sin pool, .env, database.js, singletons ni activación operativa implícitos.
class AutenticacionComercialSql {
  constructor({ pool, driver, baseEsperada, servidorEsperado, idEmpresa, habilitado = false } = {}) {
    if (!pool || !driver || !baseEsperada || !servidorEsperado || !Number.isSafeInteger(idEmpresa) || idEmpresa <= 0) {
      throw new TypeError("Pool, driver, destino y empresa explícitos obligatorios.");
    }
    Object.assign(this, { pool, driver, baseEsperada, servidorEsperado, idEmpresa, habilitado });
  }
  async transaccion(callback) {
    if (this.habilitado !== true) throw new ErrorSeguridad(503, "AUTH_COMERCIAL_INACTIVA", "Persistencia comercial desactivada.");
    const t = new this.driver.Transaction(this.pool);
    let iniciada = false, commitIntentado = false;
    try {
      await t.begin(this.driver.ISOLATION_LEVEL.SERIALIZABLE); iniciada = true;
      const tx = new AlcanceSql(t, this.driver, this.idEmpresa);
      const r = await tx.q(`SELECT DB_NAME() AS base, CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS servidor,
        (SELECT CONVERT(nvarchar(80),value) FROM sys.extended_properties
         WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthModelo') AS modelo;`);
      if (r.recordset[0]?.base !== this.baseEsperada || r.recordset[0]?.servidor !== this.servidorEsperado || r.recordset[0]?.modelo !== "authcom-v1") {
        throw new Error("Destino/modelo incompatible.");
      }
      const lock = await tx.q(`DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@recurso,
        @LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000,@DbPrincipal='public'; SELECT @r AS resultado;`, { recurso: RECURSO_BLOQUEO });
      if (![0, 1].includes(lock.recordset[0]?.resultado)) throw new Error("Bloqueo no obtenido.");
      const resultado = await callback(tx);
      commitIntentado = true; await t.commit(); iniciada = false;
      return resultado;
    } catch (error) {
      let rollbackConfirmado = false;
      if (iniciada) { try { await t.rollback(); rollbackConfirmado = true; } catch { /* resultado incierto, sin reintento */ } }
      if (!commitIntentado && rollbackConfirmado && error instanceof ErrorSeguridad) throw error;
      throw new ErrorSeguridad(503, "CUENTAS_RESULTADO_INCIERTO", "No se pudo confirmar la operación. No la reenvíe automáticamente.");
    }
  }
}

class AlcanceSql {
  constructor(transaction, driver, idEmpresa) { Object.assign(this, { transaction, driver, idEmpresa }); }
  q(texto, parametros = {}) {
    const r = new this.driver.Request(this.transaction);
    for (const [nombre, valor] of Object.entries(parametros)) {
      if (valor instanceof Date) r.input(nombre, this.driver.DateTime2(3), valor);
      else r.input(nombre, valor);
    }
    return r.query(texto);
  }
  async empresaActiva(id) {
    if (id !== this.idEmpresa) return false;
    return (await this.q("SELECT IdEmpresa FROM dbo.Empresas WITH (UPDLOCK,HOLDLOCK) WHERE IdEmpresa=@id AND Activo=1;", { id })).recordset.length === 1;
  }
  async leerUsuario(filtro, parametros) {
    const r = await this.q(`SELECT u.IdUsuario AS idUsuario,u.Nombre AS nombre,u.Email AS email,u.PasswordHash AS passwordHash,
      u.Estado AS estado,u.DebeCambiarPassword AS debeCambiarPassword,u.VersionSesion AS versionSesion,
      u.VersionRegistro AS versionRegistro,r.Nombre AS rol,r.Activo AS rolActivo,
      c.VerificadoEn AS verificado,c.VersionContacto AS versionContacto
      FROM dbo.Usuarios u WITH (UPDLOCK,HOLDLOCK) JOIN dbo.Roles r WITH (HOLDLOCK) ON r.IdRol=u.IdRol
      LEFT JOIN authcom.Contactos c WITH (UPDLOCK,HOLDLOCK) ON c.IdUsuario=u.IdUsuario
        AND c.Email=LOWER(LTRIM(RTRIM(u.Email))) COLLATE Latin1_General_100_BIN2 AND c.RevocadoEn IS NULL
      WHERE ${filtro};`, parametros);
    const u = r.recordset[0];
    if (!u) return null;
    u.emailVerificadoEn = u.verificado ? new Date(u.verificado).toISOString() : null;
    delete u.verificado; return u;
  }
  usuario(id) { return this.leerUsuario("u.IdUsuario=@id", { id }); }
  buscarUsuario(email) { return this.leerUsuario("u.EmailNormalizado=@email", { email }); }
  async rolActivo(nombre) {
    return (await this.q("SELECT IdRol FROM dbo.Roles WITH (HOLDLOCK) WHERE Nombre COLLATE Latin1_General_100_BIN2=@nombre AND Activo=1;", { nombre })).recordset.length === 1;
  }
  async admitir(v) {
    const claves = [[`ip:${v.ip}`, v.maxIp], [`destino:${v.destino}`, v.maxDestino], ["global", v.maxGlobal]];
    const datos = [];
    for (const [clave, max] of claves) {
      const r = await this.q("SELECT Inicio,Ultima,Cuenta FROM authcom.Cuotas WITH (UPDLOCK,HOLDLOCK) WHERE Proposito=@p AND Clave=@clave;", { p: v.proposito, clave });
      const previo = r.recordset[0];
      const vigente = previo && v.ahora - ms(previo.Inicio) < v.ventanaMs;
      if (previo && v.ahora < ms(previo.Ultima)) return false; // reloj retrocedido: fail closed
      if (vigente && (previo.Cuenta >= max || (clave.startsWith("destino:") && v.ahora - ms(previo.Ultima) < v.cooldownMs))) return false;
      datos.push({ clave, existe: !!previo, cuenta: vigente ? previo.Cuenta + 1 : 1, inicio: vigente ? previo.Inicio : fecha(v.ahora) });
    }
    for (const d of datos) await this.q(d.existe
      ? "UPDATE authcom.Cuotas SET Inicio=@inicio,Ultima=@ultima,Cuenta=@cuenta WHERE Proposito=@p AND Clave=@clave;"
      : "INSERT authcom.Cuotas(Proposito,Clave,Inicio,Ultima,Cuenta) VALUES(@p,@clave,@inicio,@ultima,@cuenta);",
    { p: v.proposito, clave: d.clave, inicio: d.inicio, ultima: fecha(v.ahora), cuenta: d.cuenta });
    return true;
  }
  async invitacionPendiente(email, idEmpresa, ahora) {
    if (idEmpresa !== this.idEmpresa) throw new Error("Contexto incompatible.");
    await this.q("UPDATE authcom.Desafios SET Pendiente=0 WHERE IdEmpresa=@idEmpresa AND Email=@email AND Pendiente=1 AND ExpiraEn<=@ahora;", { email, idEmpresa, ahora: fecha(ahora) });
    return (await this.q("SELECT Id FROM authcom.Desafios WITH (UPDLOCK,HOLDLOCK) WHERE IdEmpresa=@idEmpresa AND Email=@email AND Pendiente=1;", { email, idEmpresa })).recordset.length > 0;
  }
  async insertarDesafio(d) {
    if (d.idEmpresa !== this.idEmpresa || !/^[a-f0-9]{64}$/.test(d.hash) || !["recuperacion", "invitacion"].includes(d.proposito)) throw new Error("Desafío incompatible.");
    const documento = {};
    for (const campo of ["nombre", "rol", "versionSesion", "versionContacto", "emailVerificadoEn", "versionInvitador"]) {
      if (d[campo] !== undefined) documento[campo] = d[campo];
    }
    await this.q(`INSERT authcom.Desafios(Id,Hash,Proposito,IdEmpresa,Email,IdUsuario,IdInvitador,Documento,CreadaEn,ExpiraEn,ConsumidaEn,RevocadaEn,Pendiente)
      VALUES(@id,@hash,@p,@empresa,@email,@usuario,@invitador,@doc,@creada,@expira,NULL,NULL,@pendiente);`,
    { id: d.id, hash: Buffer.from(d.hash, "hex"), p: d.proposito, empresa: d.idEmpresa, email: d.email,
      usuario: d.usuarioId ?? null, invitador: d.invitadorId ?? null, doc: JSON.stringify(documento),
      creada: fecha(d.creadaEn), expira: fecha(d.expiraEn), pendiente: d.proposito === "invitacion" });
  }
  async desafio(hash, proposito) {
    const r = await this.q("SELECT * FROM authcom.Desafios WITH (UPDLOCK,HOLDLOCK) WHERE Hash=@hash AND Proposito=@p AND IdEmpresa=@empresa;",
      { hash: Buffer.from(hash, "hex"), p: proposito, empresa: this.idEmpresa });
    const d = r.recordset[0];
    return d ? { ...JSON.parse(d.Documento), id: d.Id, hash, proposito: d.Proposito, idEmpresa: d.IdEmpresa,
      email: d.Email, usuarioId: d.IdUsuario, invitadorId: d.IdInvitador, creadaEn: ms(d.CreadaEn), expiraEn: ms(d.ExpiraEn),
      consumidaEn: ms(d.ConsumidaEn), revocadaEn: ms(d.RevocadaEn) } : null;
  }
  async consumir(id, ahora) {
    const r = await this.q(`UPDATE authcom.Desafios SET ConsumidaEn=@ahora,Pendiente=0
      WHERE Id=@id AND IdEmpresa=@empresa AND ConsumidaEn IS NULL AND RevocadaEn IS NULL
       AND CreadaEn<=@ahora AND ExpiraEn>@ahora AND ExpiraEn>SYSUTCDATETIME();`, { id, empresa: this.idEmpresa, ahora: fecha(ahora) });
    return r.rowsAffected[0] === 1;
  }
  revocarRecuperaciones(usuarioId, ahora) {
    return this.q(`UPDATE authcom.Desafios SET RevocadaEn=@ahora WHERE IdUsuario=@usuario AND IdEmpresa=@empresa
      AND Proposito='recuperacion' AND ConsumidaEn IS NULL AND RevocadaEn IS NULL;`, { usuario: usuarioId, empresa: this.idEmpresa, ahora: fecha(ahora) });
  }
  revocarInvitacion(id, empresa, ahora) {
    if (empresa !== this.idEmpresa) throw new Error("Contexto incompatible.");
    return this.q(`UPDATE authcom.Desafios SET RevocadaEn=@ahora,Pendiente=0 WHERE Id=@id AND IdEmpresa=@empresa
      AND Proposito='invitacion' AND ConsumidaEn IS NULL AND RevocadaEn IS NULL;`, { id, empresa, ahora: fecha(ahora) });
  }
  async restablecerPassword(v) {
    if (v.nuevaVersionSesion !== v.versionSesion + 1) throw new Error("Versión inválida.");
    const r = await this.q(`UPDATE dbo.Usuarios SET PasswordHash=@hash,DebeCambiarPassword=0,VersionSesion=VersionSesion+1,
      FechaCambioPassword=SYSUTCDATETIME(),FechaActualizacion=SYSUTCDATETIME(),IdUsuarioActualizacion=IdUsuario
      WHERE IdUsuario=@id AND VersionSesion=@version AND VersionSesion<2147483647 AND Estado=N'Activo';`,
    { hash: v.passwordHash, id: v.usuarioId, version: v.versionSesion });
    return r.rowsAffected[0] === 1;
  }
  async crearInvitado(v) {
    if (v.rol !== "Operador") throw new Error("Rol incompatible.");
    const r = await this.q(`INSERT dbo.Usuarios(Nombre,Email,PasswordHash,IdRol,DebeCambiarPassword,IdUsuarioCreacion,IdUsuarioActualizacion)
      OUTPUT inserted.IdUsuario AS id
      SELECT @nombre,@email,@hash,IdRol,0,@actor,@actor FROM dbo.Roles WITH (HOLDLOCK)
      WHERE Nombre COLLATE Latin1_General_100_BIN2=N'Operador' AND Activo=1;`,
    { nombre: v.nombre, email: v.email, hash: v.passwordHash, actor: v.actorId });
    if (r.recordset.length !== 1) throw new Error("Rol no disponible.");
    const id = r.recordset[0].id;
    await this.q("INSERT authcom.Contactos(IdUsuario,Email,VersionContacto,VerificadoEn) VALUES(@id,@email,1,@fecha);",
      { id, email: v.email, fecha: new Date(v.emailVerificadoEn) });
    return id;
  }
  encolar(v) {
    // Lista cerrada: no conservar campos arbitrarios ni enlace/token en texto plano.
    const { keyId, iv, tag, contenido } = v.sobre;
    return this.q(`INSERT authcom.Outbox(Id,DesafioId,ExpiraEn,Sobre,Estado,Proxima)
      VALUES(@id,@desafio,@expira,@sobre,'pendiente',SYSUTCDATETIME());`,
    { id: v.id, desafio: v.desafioId, expira: fecha(v.expiraEn), sobre: JSON.stringify({ keyId, iv, tag, contenido }) });
  }
  auditar(v) {
    return this.q("INSERT authcom.Auditoria(Tipo,UsuarioId,ActorId,DesafioId,IdEmpresa,Fecha) VALUES(@tipo,@usuario,@actor,@desafio,@empresa,@fecha);",
      { tipo: v.tipo, usuario: v.usuarioId ?? null, actor: v.actorId ?? null, desafio: v.desafioId ?? null, empresa: this.idEmpresa, fecha: fecha(v.ahora) });
  }
  async reservarEntrega({ lease, leaseMs, maxIntentos }) {
    if (maxIntentos !== 3 || leaseMs !== 120000) throw new Error("Política de entrega incompatible.");
    await this.q(`UPDATE o SET Sobre=NULL,Estado='descartada',Lease=NULL,LeaseHasta=NULL FROM authcom.Outbox o
      WHERE Sobre IS NOT NULL AND (o.ExpiraEn<=SYSUTCDATETIME() OR o.Intentos>=3 AND (o.LeaseHasta IS NULL OR o.LeaseHasta<=SYSUTCDATETIME())
        OR EXISTS(SELECT 1 FROM authcom.Desafios d WHERE d.Id=o.DesafioId AND (d.ConsumidaEn IS NOT NULL OR d.RevocadaEn IS NOT NULL)));
      `);
    const r = await this.q(`;WITH siguiente AS (SELECT TOP(1) * FROM authcom.Outbox WITH (UPDLOCK,HOLDLOCK)
      WHERE Sobre IS NOT NULL AND ExpiraEn>SYSUTCDATETIME() AND Intentos<3 AND Proxima<=SYSUTCDATETIME()
       AND (LeaseHasta IS NULL OR LeaseHasta<=SYSUTCDATETIME()) ORDER BY Proxima,Id)
      UPDATE siguiente SET Estado='procesando',Intentos=Intentos+1,Lease=@lease,LeaseHasta=DATEADD(second,120,SYSUTCDATETIME())
      OUTPUT inserted.Id AS id,inserted.Sobre AS sobre;`, { lease });
    const e = r.recordset[0]; return e ? { id: e.id, sobre: JSON.parse(e.sobre) } : null;
  }
  async finalizarEntrega({ id, lease, exito, reintentoMs, maxIntentos }) {
    if (reintentoMs !== 60000 || maxIntentos !== 3) throw new Error("Política de entrega incompatible.");
    const r = await this.q(`UPDATE authcom.Outbox SET Estado=@estado,Proxima=DATEADD(second,60,SYSUTCDATETIME()),
      Sobre=CASE WHEN @exito=1 OR Intentos>=3 THEN NULL ELSE Sobre END,Lease=NULL,LeaseHasta=NULL
      WHERE Id=@id AND Lease=@lease AND LeaseHasta>SYSUTCDATETIME() AND Estado='procesando';`,
    { id, lease, exito, estado: exito ? "entregada" : "fallida" });
    return r.rowsAffected[0] === 1;
  }
}
module.exports = { AutenticacionComercialSql };
