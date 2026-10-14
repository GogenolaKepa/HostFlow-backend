// Herramienta LOCAL independiente. Sin opciones muestra ayuda y no conecta.
// Escrituras solo tras autorizacion externa y --write-authorized explicito.
const fs = require("node:fs");
const path = require("node:path");
const { configuracionSQLAislada, BASE, METADATOS_CONEXION, validarConexion } = require("../tests/integration/sqlAislado");

function prepararOperacion(args) {
  const modos = ["--create", "--mark", "--inspect", "--cleanup"];
  const modo = args.find(a => modos.includes(a));
  if (!modo || args.filter(a => modos.includes(a)).length !== 1) throw new Error("Seleccione una operación local explícita.");
  const permitidos = new Set([modo, "--write-authorized"]);
  let runId;
  if (modo === "--cleanup") {
    const posicion = args.indexOf("--run-id");
    runId = args[posicion + 1];
    if (posicion < 0 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId || "")) throw new Error("Limpieza requiere RunId UUIDv4 acreditado.");
    permitidos.add("--run-id"); permitidos.add(runId);
  }
  if (new Set(args).size !== args.length || args.some(a => !permitidos.has(a))) throw new Error("Opciones desconocidas o repetidas.");
  const escritura = modo !== "--inspect";
  if (escritura && !args.includes("--write-authorized")) throw new Error("Falta autorización explícita de escritura local.");
  if (!escritura && args.includes("--write-authorized")) throw new Error("Inspección es exclusivamente lectura.");
  const archivo = { "--create": "01_crear_base_local.sql", "--mark": "00_marcar_base_aislada.sql",
    "--inspect": "02_inspeccion_solo_lectura.sql", "--cleanup": "03_limpieza_manual_revisable.sql" }[modo];
  let command = fs.readFileSync(path.join(__dirname,"../tests/integration",archivo),"utf8");
  if (escritura) {
    const flag = "DECLARE @EscrituraAutorizada bit = 0;";
    if (command.split(flag).length !== 2) throw new Error("Cambió el script; revisar antes de habilitar la copia.");
    command = command.replace(flag,"DECLARE @EscrituraAutorizada bit = 1;");
  }
  if (runId) command = command.replace("DECLARE @RunId uniqueidentifier = NULL;", `DECLARE @RunId uniqueidentifier = '${runId}';`);
  return { command, escritura, base: modo === "--create" ? "master" : BASE };
}

async function prepararSQLLocal({ args = process.argv.slice(2), driver } = {}) {
  const operacion = prepararOperacion(args); // Antes de cargar el driver o conectar.
  driver ||= require("mssql/msnodesqlv8");
  const config = configuracionSQLAislada({ HOSTFLOW_SQL_TEST_AUTH: "windows", HOSTFLOW_SQL_TEST_SERVER: "localhost" },
    { lectura: true, baseLectura: operacion.base });
  const pool = new driver.ConnectionPool(config);
  try {
    await pool.connect();
    const { recordset } = await pool.request().query(METADATOS_CONEXION);
    // Crear/marcar no requieren una marca todavia. La guarda del batch valida
    // identidad/collation/pertenencia en la MISMA conexion que la escritura.
    validarConexion(recordset[0], operacion.base, { requiereMarca: false });
    const result = await pool.request().batch(operacion.command);
    if (!operacion.escritura) {
      const inspeccion = validarConexion(result.recordsets?.[0]?.[0], operacion.base, { requiereMarca: false });
      return { base: operacion.base, collation: inspeccion.collation, marca: inspeccion.marca,
        objetosInesperados: inspeccion.objetosInesperados, tablas: (result.recordsets?.[1] || []).map(t => ({
      esquema: t.esquema, tabla: t.tabla, id: t.id,
      propietario: /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(t.propietario || "") ? t.propietario : "No acreditado",
    })), objetos: (result.recordsets?.[2] || []).map(o => ({ esquema: o.esquema, nombre: o.name, tipo: o.type_desc })) };
    }
    return { base: operacion.base, finalizada: true };
  } finally { await pool.close(); }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.length || (args.length === 1 && args[0] === "--help")) {
    console.log("Preparacion SQL LOCAL: --create | --mark | --inspect | --cleanup --run-id UUID. Escrituras requieren --write-authorized y aprobacion externa. Sin opciones no conecta.");
  } else prepararSQLLocal({ args }).then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error("No se completó la operación SQL LOCAL. Revisar autorización, destino y metadatos sin exponer detalles del driver.");
    process.exitCode = 1;
  });
}
module.exports = { prepararOperacion, prepararSQLLocal };
