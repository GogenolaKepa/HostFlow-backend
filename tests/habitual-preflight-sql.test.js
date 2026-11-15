const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {comprobarHabitual}=require('../src/services/PreflightRecuperacionHabitual');
const {AutenticacionComercialSql}=require('../src/repositories/AutenticacionComercialSql');
const {crearConfiguracionAprobada}=require('../scripts/prepararRecuperacionHabitual');
function fixture(){let cierres=0;const sql=[];const politica=crearConfiguracionAprobada([101],'HABITUAL-1794710000000').politica;
 const usuarios=[{idUsuario:101,email:'fixture@example.invalid',versionSesion:1,versionContacto:1,verificado:new Date('2026-11-01T00:00:00.000Z')}],ingresos=[],outbox=[];let cuarentena=0;
 const request=()=>({input(){return this;},async query(s){sql.push(s);if(!/^\s*SELECT\b/i.test(s))throw Error('No SELECT');return{recordset:s.includes('FROM dbo.Usuarios')?usuarios:s.includes('FROM authcom.Ingresos')?ingresos:s.includes('IngresoFallos')?[{total:cuarentena}]:outbox};}});
 const abrir=async o=>{assert.equal(o.timeoutMs,30000);assert.equal(Object.keys(o.identidades).length,4);return{pools:{workerIngreso:{request},correo:{request}},cerrar:async()=>{cierres++;}};};
 return{politica,usuarios,ingresos,outbox,sql,abrir,cuarentena:n=>{cuarentena=n;},cierres:()=>cierres,runtime:{lectorSql:()=>{},protectorHabitual:{abrir:p=>p}}};
}
test('habitual: preflight nuevo solo SELECT, allowlist exacta y cuatro perfiles TLS existentes',async()=>{const f=fixture();const r=await comprobarHabitual(f);assert.equal(r.operadores,1);assert.equal(f.cierres(),1);assert.ok(f.sql.every(s=>/^\s*SELECT/.test(s)));assert.ok(f.sql[0].includes('@u0'));assert.ok(f.sql[0].includes("r.Nombre=N'Operador'"));});
test('habitual: usuario no acreditado, lease, cuarentena o clase no permitida bloquean y cierran pools',async()=>{
 for(const cambiar of [f=>f.usuarios.length=0,f=>f.ingresos.push({id:'FICTICIO',leaseActivo:1,sobre:'{}'}),f=>f.cuarentena(1),f=>f.outbox.push({id:'FICTICIO',sobre:JSON.stringify({plantilla:'invitacion'}),leaseActivo:0,cuarentena:false,codigo:null})]){const f=fixture();cambiar(f);await assert.rejects(comprobarHabitual(f));assert.equal(f.cierres(),1);}
});
test('habitual: trabajos normales pendientes pueden reiniciarse; resultado incierto no se reenvía',async()=>{
 const f=fixture();f.ingresos.push({id:'FICTICIO',leaseActivo:0,sobre:JSON.stringify({email:'desconocido@example.invalid',ip:'203.0.113.1'})});f.outbox.push({id:'FICTICIO',sobre:JSON.stringify({plantilla:'seguridad-cuenta',evento:'recuperacion',destinatario:'fixture@example.invalid'}),desafioId:null,leaseActivo:0,cuarentena:false,codigo:null});assert.equal((await comprobarHabitual(f)).outboxPendiente,1);
 f.outbox[0].codigo='RESULTADO_INCIERTO';await assert.rejects(comprobarHabitual(f));assert.equal(f.cierres(),2);
});
test('habitual: SQL generado selecciona ID y empresa exactos sin limpieza de filas ajenas',async()=>{
 const consultas=[];let confirmados=0,iso;
 class Transaction extends EventEmitter{async begin(i){iso=i;}async commit(){confirmados++;}async rollback(){}}
 class Request{constructor(){this.p={};}input(k,...v){this.p[k]=v.at(-1);return this;}async query(s){consultas.push({s,p:this.p});if(s.includes('DB_NAME() AS base'))return{recordset:[{base:'FICTICIO',servidor:'FICTICIO',modelo:'authcom-v1'}]};if(s.includes('sp_getapplock'))return{recordset:[{resultado:0}]};if(s.includes('HostFlowAuthCorreo'))return{recordset:[{modelo:'authcom-correo-v1'}]};if(s.includes('HostFlowAuthResiliencia'))return{recordset:[{modelo:'authcom-resiliencia-v1'}]};if(s.includes('SELECT TOP(1)'))return{recordset:[{id:'00000000-0000-4000-8000-000000000001',sobre:'{}',documento:null}]};return{recordset:[]};}}
 const driver={Transaction,Request,ISOLATION_LEVEL:{SERIALIZABLE:'serializable'},DateTime2:()=>{}};const r=new AutenticacionComercialSql({pool:{},driver,baseEsperada:'FICTICIO',servidorEsperado:'FICTICIO',idEmpresa:1,habilitado:true});
 await r.transaccion(async tx=>{await tx.usuario(101);await tx.consultarEntregaPendiente();await tx.reservarEntrega({lease:'00000000-0000-4000-8000-000000000002',leaseMs:120000,maxIntentos:3,soloRecuperacion:true,idEsperado:'00000000-0000-4000-8000-000000000001'});});
 const lectura=consultas.find(q=>q.s.includes('u.IdUsuario AS idUsuario')).s;
 // La búsqueda y la comparación del desafío deben usar el mismo correo canónico:
 // un Email mostrado como Fixture@Example.invalid no cambia el destinatario firmado.
 assert.match(lectura,/u\.EmailNormalizado AS email/);assert.doesNotMatch(lectura,/u\.Email AS email/);
 assert.equal(iso,'serializable');assert.equal(confirmados,1);const updates=consultas.filter(q=>/UPDATE/.test(q.s));assert.equal(updates.length,1);assert.match(updates[0].s,/Id=@idEsperado/);assert.match(updates[0].s,/h.IdEmpresa=@empresa/);assert.equal(updates[0].p.empresa,1);assert.equal(consultas.some(q=>/DELETE|DROP|ALTER|CREATE\s+USER/i.test(q.s)),false);
});
