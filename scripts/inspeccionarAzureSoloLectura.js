// Inspeccion independiente y explicita. No importa server/config/database ni .env al cargar.
const fs = require("node:fs");
const path = require("node:path");
const carpetaSQL = path.join(__dirname,"../sql/proposals/seguridad_etapas_3_4");
const ARCHIVOS = Object.freeze([
  "06_destino_azure_solo_lectura.sql", "03_comprobacion_administrativa_solo_lectura.sql",
  "02_verificacion_metadatos.sql", "07_permisos_migracion_solo_lectura.sql",
  "08_respaldos_azure_solo_lectura.sql",
]);

function soloSelect(texto) {
  const codigo = texto.replace(/'(?:[^']|'')*'|\/\*[\s\S]*?\*\/|--[^\r\n]*/g," ");
  const sentencias = codigo.split(";").map(s=>s.trim()).filter(Boolean);
  if (!sentencias.length || sentencias.some(s=>!/^SELECT\b/i.test(s)) ||
      /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|EXEC|EXECUTE|INTO|OPENQUERY|OPENROWSET|OPENDATASOURCE|NEXT\s+VALUE|USE|GO)\b/i.test(codigo)) {
    throw new Error("Consulta fuera del contrato SELECT revisado.");
  }
  return texto;
}

function configuracion(env) {
  if (env.DB_DATABASE !== "HostFlow" || !/^[a-z0-9-]+\.database\.windows\.net$/i.test(env.DB_SERVER || "") ||
      !env.DB_USER || !env.DB_PASSWORD || (env.DB_PORT && Number(env.DB_PORT)!==1433)) {
    throw new Error("La configuracion existente no acredita el destino Azure HostFlow.");
  }
  return { server:env.DB_SERVER,database:"HostFlow",user:env.DB_USER,password:env.DB_PASSWORD,port:1433,
    options:{encrypt:true,trustServerCertificate:false},pool:{max:1,min:0,idleTimeoutMillis:30000},
    connectionTimeout:30000,requestTimeout:30000 };
}

async function tlsDePool(pool) {
  const connection = await pool.acquire(pool);
  try {
    // Evidencia del socket del driver instalado. Nunca serializar conexion/certificado.
    const socket = connection.messageIo?.securePair?.cleartext;
    if (!socket || socket.authorized!==true || !connection.messageIo.tlsNegotiationComplete) {
      throw new Error("No se pudo acreditar TLS y certificado validado.");
    }
    return {cifrado:true,certificadoValidado:true,protocolo:socket.getProtocol()};
  } finally { pool.release(connection); }
}

function resumir(destino, administrativa, metadatos, permisos, respaldos, tls, clavesRoles = []) {
  const completo = destino.PuedeVerEsquemaCompleto===1 && administrativa[0]?.[0]?.PuedeVerEsquemaCompleto===1;
  const inventario = administrativa[1] || [];
  const candidatos = new Set(inventario.filter(r=>/usuario|user|login|auth|account/i.test(r.Objeto) ||
    /password|hash|contrasena|contraseña|credencial/i.test(r.Columna || "")).map(r=>`${r.Esquema}.${r.Objeto}`));
  const rolesColumnas = (metadatos[0] || []).filter(r=>r.Tabla==="Roles");
  const rolesIndices = (metadatos[1] || []).filter(r=>r.Tabla==="Roles");
  return { destino:{base:destino.BaseActual,servidor:destino.ServidorActual,motor:destino.MotorActual,
    collation:destino.CollationActual,transacciones:destino.TransaccionesAbiertas,implicitas:destino.TransaccionesImplicitas},
    tls,driver:require("mssql/package.json").version,identidad:"conexion existente del backend",
    esquemaCompleto:completo,objetosVisibles:new Set(inventario.map(r=>`${r.Esquema}.${r.Objeto}`)).size,
    usuariosVisible:inventario.some(r=>r.Esquema==="dbo" && r.Objeto==="Usuarios"),
    candidatosSeguridadVisibles:[...candidatos],ausenciaSeguridadConfirmada:completo && candidatos.size===0,
    roles:{columnas:rolesColumnas,indices:rolesIndices,claves:clavesRoles,registros:administrativa[2] || []},
    permisos,respaldos };
}

async function inspeccionar({args=process.argv.slice(2),env,driver,tlsInspector=tlsDePool}={}) {
  if (args.length!==1 || args[0]!=="--read-only") throw new Error("Requiere --read-only exclusivamente.");
  // Verificar todos los artefactos ANTES de leer configuracion o conectar.
  const consultas=ARCHIVOS.map(archivo=>soloSelect(fs.readFileSync(path.join(carpetaSQL,archivo),"utf8")));
  env ||= {...require("dotenv").parse(fs.readFileSync(path.join(__dirname,"../.env"))),...process.env};
  const config=configuracion(env);
  driver ||= require("mssql");
  const pool=new driver.ConnectionPool(config);
  try {
    await pool.connect();
    const tls=await tlsInspector(pool);
    const destino=(await pool.request().query(consultas[0])).recordset[0];
    if (!destino || destino.BaseActual!=="HostFlow" || destino.MotorActual!==5 ||
        ![config.server.toLowerCase(),config.server.split(".")[0].toLowerCase()].includes(String(destino.ServidorActual).toLowerCase()) ||
        destino.TransaccionesAbiertas!==0 || destino.TransaccionesImplicitas!==false) {
      throw new Error("La conexion no acredita el destino Azure esperado.");
    }
    const administrativa=(await pool.request().query(consultas[1])).recordsets;
    const metadatos=(await pool.request().query(consultas[2])).recordsets;
    const permisosResult=await pool.request().query(consultas[3]);
    const permisos=permisosResult.recordsets[0][0];
    let respaldos;
    try { respaldos={consultado:true,tipos:(await pool.request().query(consultas[4])).recordset}; }
    catch { respaldos={consultado:false,motivo:"La identidad no pudo consultar la vista de backups; verificar en Portal."}; }
    return resumir(destino,administrativa,metadatos,permisos,respaldos,tls,permisosResult.recordsets[1]);
  } finally { await pool.close(); }
}

if (require.main===module) {
  if (!process.argv.slice(2).length || (process.argv.length===3 && process.argv[2]==="--help")) {
    console.log("Inspeccion Azure: --read-only. Solo SELECT revisados, sin archivos de resultados. Sin opciones no conecta.");
  } else inspeccionar().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{
    console.error("No se completo la inspeccion Azure. Sin detalles del driver, secretos ni cadenas de conexion.");
    process.exitCode=1;
  });
}
module.exports={ARCHIVOS,soloSelect,configuracion,tlsDePool,resumir,inspeccionar};
