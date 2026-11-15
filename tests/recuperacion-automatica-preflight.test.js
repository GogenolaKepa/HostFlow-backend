const test=require('node:test'),assert=require('node:assert/strict');
const {comprobarHabitual}=require('../src/services/PreflightRecuperacionHabitual');
const {crearPoliticaAutomatica,validarVinculoCorreo}=require('../src/security/comercial/PoliticaRecuperacionHabitual');
const consultas=require('../src/services/ConsultaElegiblesRecuperacion');
function fixture(){let cierres=0;const f={politica:crearPoliticaAutomatica(),cuenta:{idUsuario:7,email:'admin@example.invalid',rol:'Administrador',rolActivo:true,estado:'Activo',debeCambiarPassword:false,ambitoIdentidad:'dbo.Usuarios',passwordLocalHabilitada:true,versionSesion:2,versionContacto:1,verificado:new Date('2026-11-01T00:00:00Z')},cap:{permitido:1,modelo:'authcom-password-local-v1'},total:'2',outbox:[],sql:[],runtime:{lectorSql(){},protectorHabitual:{abrir:x=>x}}};
 const req=()=>({input(){return this;},async query(s){f.sql.push(s);if(!/^\s*SELECT\b/.test(s))throw Error('ESCRITURA_PROHIBIDA');let r=s===consultas.CAPACIDAD?[f.cap]:s===consultas.CONTEO?[{elegibles:f.total}]:s===consultas.POR_EMAIL?[f.cuenta]:s.includes('FROM authcom.Ingresos')?[]:s.includes('IngresoFallos')?[{total:0}]:f.outbox;return{recordset:r};}});
 f.abrir=async()=>({pools:{workerIngreso:{request:req},correo:{request:req}},cerrar:async()=>{cierres++;}});f.cierres=()=>cierres;return f;
}
const aviso=u=>({plantilla:'seguridad-cuenta',evento:'recuperacion',destinatario:u.email,cuenta:{ambitoIdentidad:'dbo.Usuarios',usuarioId:u.idUsuario,versionSesion:u.versionSesion,versionContacto:u.versionContacto,emailVerificadoEn:new Date(u.verificado).toISOString()}});
test('preflight automático solo SELECT agregado, sin lista ni lectura de hashes; cero cuentas es válido',async()=>{
 for(const total of ['2','0']){const f=fixture();f.total=total;const r=await comprobarHabitual(f);assert.equal(r.cuentasElegibles,Number(total));assert.equal(f.cierres(),1);assert.ok(f.sql.every(s=>!s.includes('PasswordHash')));assert.match(consultas.CONTEO,/COUNT_BIG/);assert.doesNotMatch(consultas.CONTEO,/@u\d/);assert.match(consultas.CONTEO,/N'Administrador',N'Operador'/);}
});
test('permiso, marca o conteo desconocidos bloquean y cierran pools; NULL no es cero',async()=>{
 for(const cambiar of [f=>f.cap.permitido=null,f=>f.cap.modelo=null,f=>f.total=null,f=>f.total=undefined,f=>f.total='desconocido',f=>f.total='9007199254740993']){const f=fixture();cambiar(f);await assert.rejects(comprobarHabitual(f));assert.equal(f.cierres(),1);}
});
test('preflight revisa aviso contra cuenta actual y rechaza correo reasignado, Google o método desconocido',async()=>{
 const f=fixture(),payload=aviso(f.cuenta);f.outbox=[{id:'FICTICIO',sobre:JSON.stringify(payload),desafioId:null,documento:null,leaseActivo:0,cuarentena:false,codigo:null}];assert.equal((await comprobarHabitual(f)).outboxPendiente,1);
 for(const cambio of [{idUsuario:8},{passwordLocalHabilitada:null},{ambitoIdentidad:'clientes.Cuentas'}]){const g=fixture();g.outbox=f.outbox;Object.assign(g.cuenta,cambio);await assert.rejects(comprobarHabitual(g));assert.equal(g.cierres(),1);}
});
test('vínculo de correo exige identidad/versiones completas; no depende solo del destinatario',()=>{
 const f=fixture(),u={...f.cuenta,emailVerificadoEn:f.cuenta.verificado.toISOString()},p=aviso(f.cuenta);validarVinculoCorreo(f.politica,p,{desafioId:null},u,1);
 for(const cuenta of [undefined,{...p.cuenta,usuarioId:77},{...p.cuenta,versionSesion:1},{...p.cuenta,versionContacto:2},{...p.cuenta,ambitoIdentidad:'clientes.Cuentas'}])assert.throws(()=>validarVinculoCorreo(f.politica,{...p,cuenta},{desafioId:null},u,1));
 assert.throws(()=>validarVinculoCorreo(f.politica,{plantilla:'seguridad-cuenta',evento:'recuperacion',destinatario:u.email},{desafioId:null},u,1));
 const r={plantilla:'recuperacion',destinatario:u.email,enlace:'https://hostflow.com.ar/cuenta/recuperacion#token=FICTICIO'},c={desafioId:'FICTICIO',usuarioId:u.idUsuario,empresa:1,proposito:'recuperacion',documento:{versionSesion:u.versionSesion,versionContacto:u.versionContacto,emailVerificadoEn:u.emailVerificadoEn}};validarVinculoCorreo(f.politica,r,c,u,1);assert.throws(()=>validarVinculoCorreo(f.politica,r,{...c,empresa:2},u,1));assert.throws(()=>validarVinculoCorreo(f.politica,r,{...c,desafioId:null},u,1));
});
