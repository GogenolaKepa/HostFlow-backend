const {test}=require('node:test');const assert=require('node:assert/strict');
const {MonedasRepository}=require('../src/repositories/MonedasRepository');
function aislado({fallo='',rol='Administrador',sesion=1}={}) {
 const consultas=[],ciclo={begin:0,commit:0,rollback:0};const pool={nombre:'pool-ficticio'};let txActual,ocupado=false;
 class Request {
  constructor(conexion){this.conexion=conexion;this.parametros={};this.tipos={};}
  input(k,t,v){this.parametros[k]=v;this.tipos[k]=t;return this;}
  async query(texto){assert.equal(ocupado,false,'Sin solicitudes paralelas');ocupado=true;
   try{
    if(txActual)assert.equal(this.conexion,txActual,'Sin escapes al pool');
    consultas.push({texto,parametros:this.parametros,tipos:this.tipos});await Promise.resolve();
    if(texto.includes('sp_getapplock'))return {recordset:[{bloqueo:fallo==='lock'?-1:0}]};
    if(texto.includes('FROM dbo.Usuarios'))return {recordset:[{idUsuario:999,estado:'Activo',rolActivo:true,rol,versionSesion:sesion,debeCambiarPassword:false}]};
    if(texto.includes('sys.extended_properties')){assert.equal(texto.includes('AcuerdosMonetariosReserva'),false,'La tabla futura sin permisos no debe ser requisito de visibilidad del runtime');return {recordset:[{cantidad:2}]};}
    if(texto.includes('INSERT INTO dbo.ConfiguracionMonetaria')) {
     if(fallo==='dml')throw Error('DML ficticio fallido');
     return {recordset:fallo==='conflicto'?[]:[{versionRegistro:Buffer.alloc(8,1)}]};
    }
    if(texto.includes('FROM dbo.ConfiguracionMonetaria')) {if(fallo==='lectura')throw Error('Lectura final ficticia fallida');return {recordset:fallo==='vacia'?[]:[{fuente:'MANUAL',tipo:'MANUAL',valor:'1000.00000000',fecha:'2026-10-17',versionRegistro:Buffer.alloc(8,1)}]};}
    if(texto.includes('INSERT INTO dbo.TarifasPropiedad'))return {recordset:[{versionRegistro:Buffer.alloc(8,2)}]};
    if(texto.includes('FROM dbo.TarifasPropiedad'))return {recordset:fallo==='vacia'?[]:[{idPropiedad:5,nombre:'Ficticia',moneda:'USD',precio:'100.00',versionRegistro:Buffer.alloc(8,2)}]};
    throw Error('Consulta no prevista');
   }finally{ocupado=false;}
  }
 }
 class Transaction {constructor(p){assert.equal(p,pool);txActual=this;}on(){}async begin(){ciclo.begin++;}async commit(){ciclo.commit++;if(fallo==='commit')throw Error('Acuse perdido');}async rollback(){ciclo.rollback++;if(['rollback','commit'].includes(fallo))throw Error('Rollback no acredita ausencia de commit');}}
 const tipos=new Proxy({Request,Transaction,ISOLATION_LEVEL:{READ_COMMITTED:2}}, {get:(o,k)=>o[k]||(()=>k)});
 const repo=new MonedasRepository({getPool:async()=>pool,driver:tipos});return {repo,consultas,ciclo};
}
const actor={idUsuario:999,versionSesion:1},dato={fuente:'MANUAL',tipo:'MANUAL',valor:'1000.00000000',fecha:'2026-10-17',consultadaEn:'2026-10-17T12:00:00Z'};
test('Repositorio monedas: misma transacción para revalidar actor/modelo/DML/lectura; parámetros y commit',async()=>{
 const a=aislado();const row=await a.repo.transaccion(actor,1,r=>r.guardarConfiguracion(1,dato,null,actor.idUsuario));
 assert.equal(row.versionRegistro,'0101010101010101');assert.deepEqual(a.ciclo,{begin:1,commit:1,rollback:0});
 const dml=a.consultas.find(c=>c.texto.includes('INSERT INTO dbo.ConfiguracionMonetaria'));assert.equal(dml.parametros.valor,'1000.00000000');assert.equal(dml.parametros.actor,999);
 assert.equal(a.consultas.some(c=>/UPDATE dbo\.(Propiedades|Reservas)|INSERT INTO dbo\.(Alertas|ReservaEventos)/i.test(c.texto)),false);
});
test('Repositorio monedas: falla DML/lectura/conflicto/lock -> rollback sin éxito',async()=>{
 for(const fallo of ['dml','lectura','conflicto','lock']){const a=aislado({fallo});await assert.rejects(a.repo.transaccion(actor,1,r=>r.guardarConfiguracion(1,dato,null,999)));assert.equal(a.ciclo.commit,0);assert.equal(a.ciclo.rollback,1);}
});
test('Repositorio monedas: sesión/rol se revalidan antes de modificar',async()=>{
 for(const opciones of [{rol:'Operador'},{sesion:2}]){const a=aislado(opciones);await assert.rejects(a.repo.transaccion(actor,1,r=>r.guardarConfiguracion(1,dato,null,999)));assert.equal(a.consultas.some(c=>c.texto.includes('INSERT INTO')),false);assert.equal(a.ciclo.rollback,1);}
});
test('Repositorio monedas: commit incierto conserva código y no reintenta',async()=>{
 const a=aislado({fallo:'commit'});await assert.rejects(a.repo.transaccion(actor,1,r=>r.guardarConfiguracion(1,dato,null,999)),e=>e.codigo==='OPERACION_RESULTADO_INCIERTO');assert.deepEqual(a.ciclo,{begin:1,commit:1,rollback:1});
});
test('Repositorio monedas: rollback fallido produce incertidumbre sin intentar commit',async()=>{
 const a=aislado({fallo:'rollback'});
 await assert.rejects(a.repo.transaccion(actor,1,async()=>{throw Error('Fallo previo ficticio');}),e=>e.codigo==='OPERACION_RESULTADO_INCIERTO');
 assert.deepEqual(a.ciclo,{begin:1,commit:0,rollback:1});
});
test('Repositorio monedas: una lectura final vacía revierte configuración o tarifa antes del commit',async()=>{
 for(const operacion of [r=>r.guardarConfiguracion(1,dato,null,999),r=>r.guardarTarifa(1,5,{moneda:'USD',precio:'100.00'},null,999,null)]){
  const a=aislado({fallo:'vacia'});await assert.rejects(a.repo.transaccion(actor,1,operacion),e=>e.codigo==='MONEDAS_LECTURA_FINAL');assert.deepEqual(a.ciclo,{begin:1,commit:0,rollback:1});
 }
});
test('Repositorio monedas: tarifa declarada no cambia la fila histórica de Propiedades ni publica canales',async()=>{
 const a=aislado();const tarifa=await a.repo.transaccion(actor,1,r=>r.guardarTarifa(1,5,{moneda:'USD',precio:'100.00'},null,999,null));
 assert.equal(tarifa.moneda,'USD');assert.equal(tarifa.precio,'100.00');assert.equal(a.consultas.some(c=>/UPDATE dbo\.Propiedades|PropiedadCanales/.test(c.texto)),false);
});
test('Repositorio monedas: transporte decimal como texto, sin la conversión binaria de Decimal del driver',async()=>{
 const a=aislado();await a.repo.transaccion(actor,1,r=>r.guardarConfiguracion(1,{...dato,valor:'1234567890.12345678'},null,999));
 const q=a.consultas.find(c=>c.texto.includes('INSERT INTO dbo.ConfiguracionMonetaria'));
 assert.equal(q.parametros.valor,'1234567890.12345678');assert.equal(q.tipos.valor,'VarChar');assert.match(q.texto,/CONVERT\(decimal\(18,8\),@valor\)/);
 const b=aislado();await b.repo.transaccion(actor,1,r=>r.guardarTarifa(1,5,{moneda:'USD',precio:'9999999999999999.99'},null,999,{...dato,valor:'1234567890.12345678'}));
 const t=b.consultas.find(c=>c.texto.includes('INSERT INTO dbo.TarifasPropiedad'));
 assert.equal(t.parametros.precio,'9999999999999999.99');assert.equal(t.tipos.precio,'VarChar');assert.equal(t.tipos.rv,'VarChar');assert.match(t.texto,/CONVERT\(decimal\(18,2\),@precio\)/);assert.match(t.texto,/CONVERT\(decimal\(18,8\),@rv\)/);
});
