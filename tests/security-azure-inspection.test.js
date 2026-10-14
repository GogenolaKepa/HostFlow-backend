const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {randomBytes} = require("node:crypto");
const {ARCHIVOS,soloSelect,configuracion,tlsDePool,resumir,inspeccionar} = require("../scripts/inspeccionarAzureSoloLectura");

test("inspeccion Azure admite solo SELECT de los artefactos revisados, sin DML/DDL/procedimientos", () => {
  for (const archivo of ARCHIVOS) assert.doesNotThrow(()=>soloSelect(fs.readFileSync(path.join(__dirname,"../sql/proposals/seguridad_etapas_3_4",archivo),"utf8")));
  for (const codigo of ["SELECT 1; DELETE FROM dbo.Roles;", "SELECT * INTO dbo.Copia FROM dbo.Roles;",
    "EXEC sys.sp_getapplock;", "SELECT NEXT VALUE FOR dbo.Secuencia;", "SELECT * FROM OPENQUERY(test,'SELECT 1');"]) assert.throws(()=>soloSelect(codigo));
});

test("opciones/destinos no autorizados fallan antes de cargar configuracion o conectar", async () => {
  let conexiones=0;
  class ConnectionPool {constructor(){conexiones++;}}
  for (const args of [[],["--apply"],["--read-only","--apply"]]) await assert.rejects(inspeccionar({args,driver:{ConnectionPool}}));
  const env={DB_SERVER:"fixture.database.windows.net",DB_DATABASE:"HostFlow",DB_USER:"fixture",DB_PASSWORD:randomBytes(16).toString("hex")};
  const config=configuracion(env);
  assert.deepEqual(config.options,{encrypt:true,trustServerCertificate:false});
  for (const cambio of [{DB_DATABASE:"master"},{DB_SERVER:"localhost"},{DB_SERVER:"evil.example.invalid"},{DB_PORT:1444},{DB_PASSWORD:""}]) assert.throws(()=>configuracion({...env,...cambio}));
  assert.equal(conexiones,0);
});

test("TLS exige negociacion y certificado validado y libera siempre la conexion", async () => {
  let liberaciones=0;
  let socket={authorized:true,getProtocol:()=>"TLSv1.2"};
  const pool={acquire:async()=>({messageIo:{securePair:{cleartext:socket},tlsNegotiationComplete:true}}),release:()=>liberaciones++};
  assert.deepEqual(await tlsDePool(pool),{cifrado:true,certificadoValidado:true,protocolo:"TLSv1.2"});
  socket={authorized:false};
  await assert.rejects(tlsDePool(pool));
  assert.equal(liberaciones,2);
});

test("esquema parcial nunca confirma ausencia de Usuarios o equivalentes", () => {
  const destino={PuedeVerEsquemaCompleto:0};
  const resumen=resumir(destino,[[{PuedeVerEsquemaCompleto:0}],[],[]],[[],[]],{}, {},{});
  assert.equal(resumen.usuariosVisible,false);
  assert.equal(resumen.ausenciaSeguridadConfirmada,false);
  const completo=resumir({PuedeVerEsquemaCompleto:1},[[{PuedeVerEsquemaCompleto:1}],[],[]],[[],[]],{}, {},{});
  assert.equal(completo.ausenciaSeguridadConfirmada,true);
  const equivalente=resumir({PuedeVerEsquemaCompleto:1},[[{PuedeVerEsquemaCompleto:1}],[{Esquema:"dbo",Objeto:"Credenciales",Columna:"PasswordHash"}],[]],[[],[]],{}, {},{});
  assert.equal(equivalente.ausenciaSeguridadConfirmada,false);
});

test("destino distinto aborta luego del primer SELECT y nunca continua con inventario", async () => {
  let consultas=0,cerradas=0;
  class ConnectionPool {
    async connect() {}
    async close(){cerradas++;}
    request(){return {query:async()=>{consultas++;return {recordset:[{BaseActual:"HostFlow",MotorActual:3,ServidorActual:"fixture"}]};}};}
  }
  await assert.rejects(inspeccionar({args:["--read-only"],env:{DB_SERVER:"fixture.database.windows.net",DB_DATABASE:"HostFlow",DB_USER:"fixture",DB_PASSWORD:randomBytes(16).toString("hex")},driver:{ConnectionPool},tlsInspector:async()=>({cifrado:true,certificadoValidado:true,protocolo:"TLSv1.2"})}));
  assert.equal(consultas,1);assert.equal(cerradas,1);
});
