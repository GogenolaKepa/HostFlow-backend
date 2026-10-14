const fs = require("node:fs");
const path = require("node:path");
const BASE = "HostFlow_Test_Seguridad", EQUIPO = "PC-Escritorio";
const COLLATION = "SQL_Latin1_General_CP1_CI_AS", MARCA = "hostflow-security-disposable-v1";
const PROPIEDAD_RUN = "HostFlowTestRun";
const METADATOS_CONEXION = `SELECT DB_NAME() AS base,
 CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) AS equipo,
 CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS servidor,
 CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName')) AS instancia,
 CONVERT(nvarchar(128),SERVERPROPERTY('Edition')) AS edicion,
 CONVERT(nvarchar(40),SERVERPROPERTY('ProductVersion')) AS version,
 CONVERT(int,SERVERPROPERTY('EngineEdition')) AS motor,
 CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) AS soloWindows,
 CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')) AS transporte,
 CONVERT(nvarchar(40),CONNECTIONPROPERTY('auth_scheme')) AS autenticacion,
 CONVERT(nvarchar(128),DATABASEPROPERTYEX(DB_NAME(),'Collation')) AS collation,
 (SELECT CONVERT(nvarchar(100),value) FROM sys.extended_properties
  WHERE class=0 AND name=N'HostFlowTestIsolation') AS marca,
 (SELECT COUNT(*) FROM sys.objects WHERE is_ms_shipped=0 AND parent_object_id=0
  AND object_id NOT IN (ISNULL(OBJECT_ID(N'dbo.Roles',N'U'),-1),ISNULL(OBJECT_ID(N'dbo.Usuarios',N'U'),-1))) AS objetosInesperados;`;
const METADATOS_TABLAS = `SELECT s.name AS esquema,t.name AS tabla,t.object_id AS id,
 CONVERT(nvarchar(100),p.value) AS propietario FROM sys.tables t
 JOIN sys.schemas s ON s.schema_id=t.schema_id
 LEFT JOIN sys.extended_properties p ON p.class=1 AND p.major_id=t.object_id
 AND p.minor_id=0 AND p.name=N'${PROPIEDAD_RUN}' WHERE t.is_ms_shipped=0;`;

function exigirEscritura(env) {
  if (env.HOSTFLOW_SQL_TEST_ENABLED !== "1" || env.HOSTFLOW_SQL_TEST_WRITE_APPROVED !== "YES_LOCAL_DISPOSABLE") throw new Error("Falta autorización explícita de escrituras SQL locales.");
}
function configuracionSQLAislada(env = {}, { lectura = false, baseLectura = "master" } = {}) {
  if (env.HOSTFLOW_SQL_TEST_AUTH !== "windows" || env.HOSTFLOW_SQL_TEST_SERVER !== "localhost") throw new Error("Solo se admite Windows integrado y Shared Memory local explícito.");
  if (!lectura && env.HOSTFLOW_SQL_TEST_DATABASE !== BASE) throw new Error("La base debe coincidir exactamente con el destino aprobado.");
  if (env.HOSTFLOW_SQL_TEST_USER || env.HOSTFLOW_SQL_TEST_PASSWORD) throw new Error("Windows integrado no admite credenciales SQL.");
  if (!lectura) exigirEscritura(env);
  if (lectura && !["master", BASE].includes(baseLectura)) throw new Error("Contexto de metadatos local inválido.");
  const database = lectura ? baseLectura : BASE;
  return { server: "localhost", database, driver: "ODBC Driver 18 for SQL Server",
    options: { trustedConnection: true, encrypt: true, trustServerCertificate: true, useUTC: true },
    pool: { min: 0, max: 5 }, connectionTimeout: 10000, requestTimeout: 15000,
    beforeConnect(connection) {
      // Privado: forzar lpc sin el puerto que node-mssql agrega por defecto.
      const { build } = require("@tediousjs/connection-string");
      connection.conn_str = build({ Driver: "ODBC Driver 18 for SQL Server", Server: "lpc:localhost",
        Database: database, Trusted_Connection: true, Encrypt: true, TrustServerCertificate: true });
    } };
}
function validarConexion(row, base, { requiereMarca = true } = {}) {
  if (!row || row.base !== base || row.equipo !== EQUIPO || row.servidor !== EQUIPO || row.instancia !== null ||
      row.motor !== 3 || row.edicion !== "Enterprise Evaluation Edition (64-bit)" || !/^17\./.test(row.version || "") ||
      row.soloWindows !== 1 || row.transporte !== "Shared memory" || !["NTLM", "KERBEROS"].includes(row.autenticacion)) throw new Error("La conexión no acredita la instancia local Windows autorizada.");
  if (base === BASE && row.collation !== COLLATION) throw new Error("Collation de la base aislada incorrecta.");
  if (base === BASE && requiereMarca && (row.marca !== MARCA || row.objetosInesperados !== 0)) throw new Error("Marca incorrecta u objetos inesperados en la base aislada.");
  return row;
}
function validarRun(runId) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId || "")) throw new Error("Identificador de ejecución inválido.");
}
function validarTablas(tablas, { runId, vacia = false }) {
  validarRun(runId);
  if (!Array.isArray(tablas) || (vacia && tablas.length) || tablas.some(t => t.esquema !== "dbo" ||
      !["Roles", "Usuarios"].includes(t.tabla) || t.propietario !== runId || !Number.isInteger(t.id) || t.id <= 0)) throw new Error("Objetos preexistentes, residuales o inciertos: inspección manual requerida.");
  return tablas;
}
async function verificarAislamiento(pool, contexto) {
  const { recordset } = await pool.request().query(METADATOS_CONEXION);
  validarConexion(recordset[0], BASE);
  const { recordset: tablas } = await pool.request().query(METADATOS_TABLAS);
  return validarTablas(tablas, contexto);
}
function guardasSQL({ runId, vacia = false }) {
  validarRun(runId);
  const iguales = [["DB_NAME()", BASE], ["SERVERPROPERTY('MachineName')", EQUIPO],
    ["SERVERPROPERTY('ServerName')", EQUIPO], ["SERVERPROPERTY('Edition')", "Enterprise Evaluation Edition (64-bit)"],
    ["CONNECTIONPROPERTY('net_transport')", "Shared memory"], ["DATABASEPROPERTYEX(DB_NAME(),'Collation')", COLLATION]];
  const condiciones = iguales.map(([expr, valor]) => `ISNULL(CONVERT(nvarchar(128),${expr}),N'') COLLATE Latin1_General_100_BIN2 <> N'${valor}'`);
  return `
IF ${condiciones.join("\n OR ")}
 OR DATALENGTH(DB_NAME())<>DATALENGTH(N'${BASE}') OR SERVERPROPERTY('InstanceName') IS NOT NULL
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>3
 OR ISNULL(CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')),0)<>1
 OR ISNULL(CONVERT(nvarchar(40),SERVERPROPERTY('ProductVersion')),N'') NOT LIKE N'17.%'
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('auth_scheme')),N'') NOT IN (N'NTLM',N'KERBEROS')
 THROW 51400,'Destino SQL local no acreditado.',1;
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'HostFlowTestIsolation'
 AND CONVERT(nvarchar(100),value) COLLATE Latin1_General_100_BIN2=N'${MARCA}'
 AND DATALENGTH(CONVERT(nvarchar(100),value))=DATALENGTH(N'${MARCA}'))
 THROW 51401,'Marca de aislamiento ausente.',1;
IF EXISTS (SELECT 1 FROM sys.objects WHERE is_ms_shipped=0 AND parent_object_id=0
 AND object_id NOT IN (ISNULL(OBJECT_ID(N'dbo.Roles',N'U'),-1),ISNULL(OBJECT_ID(N'dbo.Usuarios',N'U'),-1)))
 THROW 51402,'Objetos inesperados: inspeccion manual.',1;
IF EXISTS (SELECT 1 FROM sys.tables t LEFT JOIN sys.extended_properties p
 ON p.class=1 AND p.major_id=t.object_id AND p.minor_id=0 AND p.name=N'${PROPIEDAD_RUN}'
 WHERE t.is_ms_shipped=0 AND (t.schema_id<>SCHEMA_ID(N'dbo') OR t.name NOT IN (N'Roles',N'Usuarios')
 OR ISNULL(CONVERT(nvarchar(100),p.value),N'') COLLATE Latin1_General_100_BIN2<>N'${runId}'
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(100),p.value)),0)<>DATALENGTH(N'${runId}')))
 THROW 51403,'Pertenencia de tablas no acreditada.',1;
${vacia ? "IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0) THROW 51404,'La base debe estar vacia.',1;" : ""}
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF;
`;
}
function driverProtegido(driver, contexto, env) {
  class Request extends driver.Request {
    query(command) { return super.query(this.proteger(command)); }
    batch(command) { return super.batch(this.proteger(command)); }
    execute() { throw new Error("No se admiten procedimientos desde el runner local."); }
    bulk() { throw new Error("Bulk fuera del contrato de pruebas locales."); }
    proteger(command) {
      exigirEscritura(env);
      if (typeof command !== "string" || !command.trim()) throw new Error("Comando de prueba inválido.");
      const codigo = command.replace(/'(?:[^']|'')*'|\/\*[\s\S]*?\*\/|--[^\r\n]*/g, "");
      if (/\bUSE\b|\b(?:CREATE|ALTER|DROP)\s+DATABASE\b|\b(?:sp_executesql|OPENQUERY|OPENROWSET|OPENDATASOURCE)\b|\bEXEC(?:UTE)?\s*\(/i.test(codigo) ||
          /(?:\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)\s*\.\s*(?:\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)\s*\.\s*(?:\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)/.test(codigo) ||
          /(?:\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)\s*\.\s*\.\s*(?:\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)/.test(codigo) ||
          [...codigo.matchAll(/\bEXEC(?:UTE)?\s+(?:@\w+\s*=\s*)?([^\s;,()]+)/gi)].some(m =>
            !["sys.sp_getapplock", "sys.sp_addextendedproperty"].includes(m[1].toLowerCase()))) {
        throw new Error("No se admite cambiar contexto ni acceder a otras bases desde los fixtures.");
      }
      // Guardas en el MISMO comando/conexion, incluidas Request en transaccion.
      return guardasSQL(contexto) + command;
    }
  }
  class PreparedStatement { constructor() { throw new Error("PreparedStatement fuera del contrato de pruebas locales."); } }
  return { ...driver, Request, PreparedStatement };
}
function propiedadTabla(tabla, runId) {
  validarRun(runId);
  if (!["Roles", "Usuarios"].includes(tabla)) throw new Error("Tabla fuera del fixture.");
  return `EXEC sys.sp_addextendedproperty @name=N'${PROPIEDAD_RUN}',@value=N'${runId}',
 @level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'${tabla}';`;
}
function fixtureRoles(runId) {
  return `SET XACT_ABORT ON; BEGIN TRY BEGIN TRANSACTION;
 CREATE TABLE dbo.Roles(IdRol int IDENTITY NOT NULL PRIMARY KEY,Nombre nvarchar(50) NOT NULL UNIQUE,
 Descripcion nvarchar(200) NULL,Activo bit NOT NULL DEFAULT 1);
 ${propiedadTabla("Roles", runId)}
 INSERT INTO dbo.Roles(Nombre) VALUES(N'Administrador'),(N'Propietario'),(N'Operador');
 COMMIT TRANSACTION; END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK TRANSACTION; THROW; END CATCH;`;
}
function migracionParaPruebas(database, runId) {
  if (database !== BASE) throw new Error("Destino de prueba inválido.");
  validarRun(runId);
  let codigo = fs.readFileSync(path.join(__dirname,"../../sql/proposals/seguridad_etapas_3_4/01_modelo_roles_usuarios.sql"),"utf8");
  for (const [original, nuevo] of [["DECLARE @ModeloAprobado bit = 0;", "DECLARE @ModeloAprobado bit = 1;"],
    ["DECLARE @EscrituraAutorizada bit = 0;", "DECLARE @EscrituraAutorizada bit = 1;"],
    ["DECLARE @BaseEsperada sysname = N'HostFlow';", `DECLARE @BaseEsperada sysname = N'${BASE}';`],
    ["  COMMIT TRANSACTION;", `  ${propiedadTabla("Usuarios", runId)}\n  COMMIT TRANSACTION;`]]) {
    if (codigo.split(original).length !== 2) throw new Error("La propuesta cambió; revisar adaptación local.");
    codigo = codigo.replace(original,nuevo);
  }
  return codigo;
}
async function limpiarFixtures(pool, contexto) {
  // No depende de 'creada': admite incluso un COMMIT cuya respuesta se perdio.
  contexto.vacia = false;
  const tablas = await verificarAislamiento(pool, contexto);
  if (!tablas.length) return;
  const comandos = ["Usuarios", "Roles"].filter(nombre => tablas.some(t => t.tabla === nombre))
    .map(nombre => `IF OBJECT_ID(N'dbo.${nombre}',N'U') IS NOT NULL DROP TABLE dbo.${nombre};`).join("\n");
  await pool.request().batch(`SET XACT_ABORT ON; BEGIN TRY BEGIN TRANSACTION;
 ${guardasSQL(contexto)}${comandos}
 COMMIT TRANSACTION; END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK TRANSACTION; THROW; END CATCH;`);
}
async function ejecutarConFixtures(pool, contexto, operacion) {
  let validado = false, fase = "aislamiento";
  try {
    contexto.vacia = true;
    await verificarAislamiento(pool, contexto);
    validado = true;
    fase = "Roles";
    await pool.request().batch(fixtureRoles(contexto.runId));
    contexto.vacia = false;
    fase = "Usuarios/indices/restricciones";
    await pool.request().batch(migracionParaPruebas(BASE, contexto.runId));
    fase = "casos de integracion";
    return await operacion();
  } catch {
    throw new Error(`Falló SQL local en ${fase}; ejecución ${contexto.runId}. Sin detalles sensibles.`);
  } finally {
    if (validado) {
      try { await limpiarFixtures(pool, contexto); }
      catch { throw new Error(`Limpieza no acreditada/completada. Inspección manual local requerida; ejecución ${contexto.runId}.`); }
    }
  }
}
module.exports = { BASE, EQUIPO, COLLATION, MARCA, PROPIEDAD_RUN, METADATOS_CONEXION, METADATOS_TABLAS,
 configuracionSQLAislada, exigirEscritura, validarConexion, validarTablas, verificarAislamiento,
 guardasSQL, driverProtegido, fixtureRoles, migracionParaPruebas, limpiarFixtures, ejecutarConFixtures };
