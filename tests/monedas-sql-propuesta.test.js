const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const leer=n=>fs.readFileSync(path.join(__dirname,'../sql/proposals/monedas',n),'utf8');
test('DDL monetario bloqueado, tablas nuevas sin backfill, claves/tipos/marcas y ninguna ejecución automática',()=>{
 const ddl=leer('01_modelo_bloqueado.sql');for(const texto of ['@Aplicar bit=0','@InventarioRevisado bit=0','@ServidorEsperado sysname=NULL','@@TRANCOUNT<>0','DATALENGTH','EngineEdition','VIEW DEFINITION','REFERENCES','ROLLBACK TRANSACTION'])assert.ok(ddl.includes(texto));
 assert.deepEqual([...ddl.matchAll(/CREATE TABLE dbo\.(\w+)/g)].map(m=>m[1]),['ConfiguracionMonetaria','TarifasPropiedad','AcuerdosMonetariosReserva']);
 assert.equal(/\b(?:INSERT|UPDATE|DELETE|ALTER TABLE|DROP TABLE)\s+(?:INTO\s+|FROM\s+)?dbo\./i.test(ddl),false);
 assert.equal((ddl.match(/@value=N'hostflow-monedas-v2'/g)||[]).length,3);
 for(const columna of ['FuenteReferencia','TipoReferencia','IdUsuarioActualizacion','FechaActualizacion','FechaCheckinFijada'])assert.ok(ddl.includes(columna));
 assert.ok(ddl.includes('FechaEfectiva<=FechaCheckinFijada'));assert.ok(ddl.includes('ROUND(Importe*ValorAplicado,2)'));
 assert.ok(ddl.includes('ReferenciaValor IS NOT NULL AND ReferenciaValor>0'));assert.ok(ddl.includes('EquivalenteARS IS NOT NULL AND EquivalenteARS>=0'));
 assert.equal(/EXEC(?:UTE)?\s*\(/i.test(leer('02_permisos_texto.sql')),false);
 const pkg=require('../package.json');for(const script of ['dev','start','test'])assert.equal(/monedas|migr|bootstrap/.test(pkg.scripts[script]),false);
});

// Comprobación de contratos de fuente, no parser/ejecución de SQL Server.
const sinLiterales=s=>s.replace(/--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/g,m=>m.replace(/[^\r\n]/g,' '));
function secciones(s){const partes=[];let inicio=0,nivel=0;for(let i=0;i<s.length;i++){if(s[i]==='(')nivel++;if(s[i]===')')nivel--;if(s[i]===','&&nivel===0){partes.push(s.slice(inicio,i).trim());inicio=i+1;}}assert.equal(nivel,0,'Paréntesis SQL equilibrados');partes.push(s.slice(inicio).trim());return partes;}
function tablasModelo(){
 const s=sinLiterales(leer('01_modelo_bloqueado.sql')),tablas=new Map();let match;
 const re=/CREATE TABLE dbo\.(\w+)\s*\(/g;
 while((match=re.exec(s))){const inicio=re.lastIndex;let fin=inicio,nivel=1;while(nivel&&fin<s.length){if(s[fin]==='(')nivel++;if(s[fin]===')')nivel--;fin++;}assert.equal(nivel,0);const columnas=new Map();
  for(const parte of secciones(s.slice(inicio,fin-1))){const c=/^(\w+)\s+(int|bit|char|varchar|nvarchar|decimal|date|datetime2|time|rowversion)\b\s*(\([^)]*\))?/i.exec(parte);if(c){assert.equal(columnas.has(c[1]),false);columnas.set(c[1],{tipo:c[2].toLowerCase(),capacidad:(c[3]||'').replace(/\s/g,''),declaracion:parte});}}
  tablas.set(match[1],columnas);re.lastIndex=fin;
 }return tablas;
}
test('Contratos SQL: cada columna INSERT/UPDATE del runtime existe, los UPDATE coinciden con derechos por columna',()=>{
 const tablas=tablasModelo(),permisos=leer('02_permisos_texto.sql'),verificacion=leer('03_verificacion_solo_lectura.sql');
 const fuentes=['MonedasRepository','AcuerdoMonetarioRepository'].map(n=>fs.readFileSync(path.join(__dirname,'../src/repositories',n+'.js'),'utf8')).join('\n');
 let updates=0,inserts=0;
 for(const [tabla,columnas]of tablas){
  const permitidas=new Set(new RegExp(`GRANT UPDATE \\(([^)]+)\\) ON OBJECT::dbo\\.${tabla}\\b`).exec(permisos)[1].split(',').map(x=>x.trim()));
  const usadas=new Set();
  for(const m of fuentes.matchAll(new RegExp(`INSERT INTO dbo\\.${tabla}\\(([^)]+)\\)`,'g'))){inserts++;for(const c of m[1].split(',').map(x=>x.trim()))assert.ok(columnas.has(c),`${tabla}.${c} INSERT no existe en DDL`);}
  for(const m of fuentes.matchAll(new RegExp(`UPDATE dbo\\.${tabla} SET ([\\s\\S]*?)OUTPUT`,'g'))){updates++;for(const asignacion of secciones(m[1])){const c=/^(\w+)\s*=/.exec(asignacion)?.[1];assert.ok(c&&columnas.has(c),`${tabla}.${c} UPDATE no existe`);assert.ok(permitidas.has(c),`${tabla}.${c} carece de derecho propuesto`);usadas.add(c);}}
  assert.deepEqual([...usadas].sort(),[...permitidas].sort(),`Sin UPDATE adicionales en ${tabla}`);
  const verificadas=[...verificacion.matchAll(new RegExp(`\\(N'${tabla}',N'([^']+)'\\)`,'g'))].map(m=>m[1]);assert.deepEqual(verificadas.sort(),[...permitidas].sort());
  for(const c of ['IdEmpresa','IdPropiedad','IdReserva','IdUsuarioAcuerdo','FechaAcuerdo','VersionRegistro'])assert.equal(permitidas.has(c),false,`${c} no es modificable`);
 }assert.equal(inserts,3);assert.equal(updates,4);
});
test('Tipos monetarios, dominios y snapshot completos son compatibles con los contratos decimales y de auditoría',()=>{
 const t=tablasModelo(),ddl=leer('01_modelo_bloqueado.sql');
 for(const [tabla,columna,tipo,capacidad]of [
  ['ConfiguracionMonetaria','Valor','decimal','(18,8)'],['TarifasPropiedad','PrecioBase','decimal','(18,2)'],
  ['AcuerdosMonetariosReserva','Importe','decimal','(18,2)'],['AcuerdosMonetariosReserva','ValorAplicado','decimal','(18,8)'],['AcuerdosMonetariosReserva','EquivalenteARS','decimal','(18,2)'],
  ['AcuerdosMonetariosReserva','Moneda','char','(3)'],['AcuerdosMonetariosReserva','FuenteReferencia','varchar','(10)'],['AcuerdosMonetariosReserva','TipoReferencia','varchar','(40)']]){
  assert.equal(t.get(tabla).get(columna).tipo,tipo);assert.equal(t.get(tabla).get(columna).capacidad,capacidad);
 }
 for(const columnas of t.values())assert.equal(columnas.get('VersionRegistro').tipo,'rowversion');
 for(const c of ['FuenteAplicada','TipoAplicado','ValorAplicado','FechaEfectiva','FechaCheckinFijada','FijadoEn','EquivalenteARS','IdUsuarioFijacion']){
  assert.ok(t.get('AcuerdosMonetariosReserva').has(c));assert.ok(ddl.includes(c+' IS NULL'));assert.ok(ddl.includes(c+' IS NOT NULL'));
 }
 for(const [nombre,largo]of [['MANUAL',6],['BCRA',4],['BCRA_TIPO_COTIZACION',20]]){assert.equal(nombre.length,largo);assert.ok(largo<=40);}
 assert.equal((ddl.match(/CREATE INDEX /g)||[]).length,2);assert.equal((ddl.match(/FOREIGN KEY\(/g)||[]).length,10);
 assert.doesNotMatch(sinLiterales(ddl),/\b(?:EXECUTE AS|ALTER ROLE|GRANT|DROP|DISABLE)\b/i);
});
test('Guardas de destino y activación permanecen cerradas y el generador nunca ejecuta DCL',()=>{
 for(const archivo of ['00_inspeccion_bloqueada.sql','01_modelo_bloqueado.sql','02_permisos_texto.sql','03_verificacion_solo_lectura.sql']){
  const texto=leer(archivo);assert.ok(texto.includes('@ServidorEsperado sysname=NULL'));assert.ok(texto.includes("N'HostFlow'"));assert.ok(texto.includes("SERVERPROPERTY('EngineEdition')"));assert.ok(texto.includes('DATALENGTH'));assert.ok(texto.includes('THROW'));
 }
 const texto=leer('02_permisos_texto.sql');assert.equal((texto.match(/N'GRANT /g)||[]).length,6);assert.doesNotMatch(sinLiterales(texto),/\b(?:GRANT|DENY|REVOKE|EXEC|EXECUTE|ALTER)\b/i);
});
