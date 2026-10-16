const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TIPOS_RESERVA,construirEventoReserva,prepararLoteEventosReserva}=require('../src/notifications/eventosReserva');
const reserva=()=>({idReserva:1,idPropiedad:1,fechaIngreso:'2028-02-28',fechaEgreso:'2028-03-02',estado:'Confirmada',canal:'Manual'});
const entrada=(cambios={})=>({idEmpresa:1,tipo:'RESERVA_NUEVA',reserva:reserva(),idOcurrencia:'operacion-ficticia-1',fechaEvento:'2028-02-28T12:00:00.000Z',...cambios});

test('v3 puro: cuatro tipos compatibles con el modelo v2, prioridad y proyección sin datos personales',()=>{
 for(const tipo of Object.keys(TIPOS_RESERVA)){
  const datos=entrada({tipo});if(tipo==='RESERVA_CANCELADA')datos.reserva.estado='Cancelada';
  if(tipo==='CONFLICTO_DISPONIBILIDAD')datos.reservaRelacionada={...reserva(),idReserva:2};
  const evento=construirEventoReserva(datos);
  assert.deepEqual(Object.keys(evento),['idEmpresa','tipo','claveEvento','referenciaTipo','referenciaId','prioridad','fechaEvento']);
  assert.ok(evento.claveEvento.length<=200);assert.match(evento.claveEvento,/^reserva-v3:[a-f0-9]{64}$/);assert.equal(evento.prioridad,TIPOS_RESERVA[tipo]);assert.ok(Object.isFrozen(evento));
 }
});
test('v3 puro: repetición, claves canónicas, empresa, referencia, tipo y ocurrencia independientes',()=>{
 const uno=construirEventoReserva(entrada());assert.deepEqual(construirEventoReserva(entrada()),uno);
 assert.deepEqual(construirEventoReserva(entrada({idEmpresa:'1',reserva:{...reserva(),idReserva:'1',idPropiedad:'1'}})),uno);
 for(const datos of [entrada({idEmpresa:2}),entrada({idOcurrencia:'operacion-ficticia-2'}),entrada({tipo:'RESERVA_MODIFICADA'}),entrada({reserva:{...reserva(),idReserva:2}})])assert.notEqual(construirEventoReserva(datos).claveEvento,uno.claveEvento);
 assert.equal(prepararLoteEventosReserva([entrada(),entrada(),entrada()]).length,1);
});
test('v3 puro: conflicto simétrico, límite de salida exclusivo y reservas no bloqueantes',()=>{
 const a=reserva(),b={...reserva(),idReserva:2};
 const uno=entrada({tipo:'CONFLICTO_DISPONIBILIDAD',reserva:a,reservaRelacionada:b});
 assert.deepEqual(construirEventoReserva(uno),construirEventoReserva({...uno,reserva:b,reservaRelacionada:a}));
 for(const otra of [{...b,idReserva:1},{...b,idPropiedad:2},{...b,fechaIngreso:a.fechaEgreso,fechaEgreso:'2028-03-05'},{...b,estado:'Cancelada'},{...b,estado:'Finalizada'},{...b,estado:'No show'}])assert.throws(()=>construirEventoReserva({...uno,reservaRelacionada:otra}));
});
test('v3 puro: misma ocurrencia con fecha o prioridad distinta se detiene, sin fusionar silenciosamente',()=>{
 for(const cambio of [{prioridad:'Alta'},{fechaEvento:'2028-02-28T12:00:01.000Z'}])assert.throws(()=>prepararLoteEventosReserva([entrada(),entrada(cambio)]),/incompatible/);
 assert.equal(prepararLoteEventosReserva([entrada(),entrada({idOcurrencia:'otra-operacion'})]).length,2);
});
test('v3 puro: BIGINT no pierde precisión; IDs malformados y límites se rechazan',()=>{
 assert.equal(construirEventoReserva(entrada({reserva:{...reserva(),idReserva:'9223372036854775807'}})).referenciaId,'9223372036854775807');
 for(const id of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'01','1 ','+1','1e3','9223372036854775808',true,{}])assert.throws(()=>construirEventoReserva(entrada({reserva:{...reserva(),idReserva:id}})));
 for(const id of [0,2147483648,'2147483648'])assert.throws(()=>construirEventoReserva(entrada({idEmpresa:id})));
});
test('v3 puro: fechas UTC, bisiestos y ocurrencia explícita; sin reloj ni valores predeterminados ficticios',()=>{
 for(const fechaEvento of [undefined,'2027-02-29T12:00:00.000Z','2028-02-30T12:00:00.000Z','2028-02-28T12:00:00Z','2028-02-28T09:00:00.000-03:00','0000-01-01T00:00:00.000Z'])assert.throws(()=>construirEventoReserva(entrada({fechaEvento})));
 for(const idOcurrencia of [undefined,'','a'.repeat(101),' usuario','cuenta@example.invalid',2])assert.throws(()=>construirEventoReserva(entrada({idOcurrencia})));
 for(const fechaIngreso of ['2027-02-29','2028-02-30','incorrecta'])assert.throws(()=>construirEventoReserva(entrada({reserva:{...reserva(),fechaIngreso}})));
});
test('v3 puro: tipos, prioridad, referencia y payload cerrados; no aceptar datos del cliente sin adaptar',()=>{
 for(const tipo of ['LIMPIEZA_PENDIENTE','ALERTA_CRITICA','RESERVA_NUEVA ','reserva_nueva','__proto__',['RESERVA_NUEVA'],null,{}])assert.throws(()=>construirEventoReserva(entrada({tipo})));
 for(const prioridad of ['Baja','Informativa ','x'.repeat(17),null,{}])assert.throws(()=>construirEventoReserva(entrada({prioridad})));
 for(const prioridad of ['Informativa','Critica','Alta','Media'])assert.equal(construirEventoReserva(entrada({prioridad})).prioridad,prioridad);
 assert.throws(()=>construirEventoReserva(entrada({destinatarios:[1]})));
 assert.throws(()=>construirEventoReserva(entrada({reserva:{...reserva(),email:'persona@example.invalid'}})));
 assert.throws(()=>construirEventoReserva(entrada({tipo:'RESERVA_CANCELADA'})));
 assert.throws(()=>construirEventoReserva(entrada({reservaRelacionada:reserva()})));
 assert.throws(()=>prepararLoteEventosReserva(null));
});
test('v3 puro: no muta entradas; no está importado por ninguna ruta, servicio ni script de arranque',()=>{
 const datos=entrada(),copia=structuredClone(datos);construirEventoReserva(datos);assert.deepEqual(datos,copia);
 const raiz=path.join(__dirname,'../src');
 function revisar(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())revisar(f);else if(e.name.endsWith('.js')&&!f.includes(`${path.sep}notifications${path.sep}`))assert.doesNotMatch(fs.readFileSync(f,'utf8'),/require\s*\([^)]*eventosReserva/);}}
 revisar(raiz);
 const ddl=fs.readFileSync(path.join(__dirname,'../sql/proposals/notificaciones/01_modelo_bloqueado.sql'),'utf8');
 for(const tipo of Object.keys(TIPOS_RESERVA))assert.ok(ddl.includes(`N'${tipo}'`));
 assert.match(ddl,/Prioridad nvarchar\(16\)/);assert.match(ddl,/UNIQUE\(IdEmpresa,ClaveEvento\)/);
});
