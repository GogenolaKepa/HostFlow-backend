// Extensión explícita de la fixture transaccional existente. Solo memoria ficticia.
const assert=require('node:assert/strict');
const {serialize,deserialize}=require('node:v8');
const {prepararCreacionAislada}=require('./creacionAislada');
function prepararMonedasIntegradas(){
 const h=prepararCreacionAislada(),resetAnterior=h.reset,copiar=x=>deserialize(serialize(x));
 const version=()=>Buffer.from((++h.siguienteVersion).toString(16).padStart(16,'0'),'hex');
 const mapas=tx=>{tx.tarifas??=new Map();tx.acuerdos??=new Map();tx.propiedades??=new Map();return tx;};
 const buscar=(tx,tipo,id)=>tx[tipo]?.has(id)?tx[tipo].get(id):h[tipo].get(id);
 h.reset=()=>{
  resetAnterior();h.tarifas=new Map();h.acuerdos=new Map();h.configuracion=null;h.siguienteVersion=100;h.siguientePropiedad=50;
  h.actor={idUsuario:999,estado:'Activo',rolActivo:true,rol:'Administrador',versionSesion:1,debeCambiarPassword:false};
  for(const p of h.propiedades.values())Object.assign(p,{precioBase:'50000.00',tipo:'Departamento',direccion:'Ficticia 1',ciudad:'Ficticia',provincia:'Ficticia'});
  h.consultaExtra=async({texto,args,tx,paso})=>{
   mapas(tx);
   if(texto.includes('FROM dbo.Usuarios')){await paso('actor',tx,args);const actor=h.actores?.get(args.IdUsuario)||h.actor;return {recordset:actor?[copiar(actor)]:[]};}
   if(texto.includes('sys.extended_properties')){await paso('modelo',tx,args);return {recordset:[{cantidad:texto.includes("N'dbo.AcuerdosMonetariosReserva'")?1:2}]};}
   if(texto.includes('FROM dbo.ConfiguracionMonetaria'))return {recordset:h.configuracion?[copiar(h.configuracion)]:[]};
   if(texto.includes('INSERT INTO dbo.TarifasPropiedad')){
    await paso('tarifa',tx,args);const vieja=buscar(tx,'tarifas',args.propiedad);
    if((args.revision===null&&vieja)||(args.revision&&!vieja?.versionRegistro.equals(args.revision)))return {recordset:[]};
    const fila={idPropiedad:args.propiedad,nombre:buscar(tx,'propiedades',args.propiedad)?.nombre||'Ficticia',moneda:args.moneda,precio:args.precio,referenciaFuente:args.rf,referenciaTipo:args.rt,referenciaValor:args.rv,referenciaFecha:args.rd,versionRegistro:version()};
    tx.tarifas.set(args.propiedad,fila);return {recordset:[{versionRegistro:fila.versionRegistro}]};
   }
   if(texto.includes('UPDATE dbo.Propiedades')){
    await paso('propiedadUpdate',tx,args);const vieja=buscar(tx,'propiedades',args.idPropiedad),tarifa=buscar(tx,'tarifas',args.idPropiedad);
    if(!vieja||(!args.preservarPrecio&&tarifa&&texto.includes('NOT EXISTS')))return {recordset:[],rowsAffected:[0]};
    tx.propiedades.set(args.idPropiedad,{...vieja,...args,precioBase:args.preservarPrecio?vieja.precioBase:args.precioBase});return {recordset:[],rowsAffected:[1]};
   }
   if(texto.includes('FROM dbo.TarifasPropiedad'))return {recordset:copiar([...new Map([...h.tarifas,...tx.tarifas]).values()])};
   if(texto.includes('FROM dbo.EstadosPropiedad'))return {recordset:['Activa','Inactiva','Mantenimiento'].includes(args.estado)?[{idEstadoPropiedad:1,nombre:args.estado}]:[]};
   if(texto.includes('INSERT INTO dbo.Propiedades')){
    await paso('propiedadInsert',tx,args);const idPropiedad=h.siguientePropiedad++;
    tx.propiedades.set(idPropiedad,{...copiar(args),idPropiedad,precioBase:args.precioBase,estado:'Activa'});return {recordset:[{idPropiedad}]};
   }
   if(texto.includes('FROM dbo.Propiedades p')){
    await paso('propiedad',tx,args);const filas=[...new Map([...h.propiedades,...tx.propiedades]).values()];
    return {recordset:copiar(args.idPropiedad?filas.filter(p=>p.idPropiedad===args.idPropiedad):filas)};
   }
   if(texto.includes('FROM dbo.Reservas r')&&args.idReserva===undefined&&!texto.includes('SELECT COUNT'))return {recordset:copiar([...new Map([...h.filas,...tx.cambios]).values()])};
   // Contratos de la tercera tabla: las ramas deben reconocerse explícitamente.
   if(texto.includes('INSERT INTO dbo.AcuerdosMonetariosReserva')){
    await paso(args.revision?'acuerdoUpdate':'acuerdoInsert',tx,args);const anterior=buscar(tx,'acuerdos',args.reserva);
    if(args.revision?(!anterior||anterior.fijadoEn||!anterior.versionRegistro.equals(args.revision)):Boolean(anterior))return {recordset:[]};
    const fila={idReserva:args.reserva,idEmpresa:args.empresa,moneda:args.moneda,importe:args.importe,pagoEquivalenteARS:args.pagoARS,
     fuenteReferencia:args.fuente,tipoReferencia:args.tipo,idAutor:anterior?.idAutor||args.actor,fechaAcuerdo:anterior?.fechaAcuerdo||new Date('2026-10-17T12:00:00Z'),
     versionRegistro:version(),fijadoEn:null,valorAplicado:null,equivalenteARS:null};
    tx.acuerdos.set(args.reserva,fila);return {recordset:[{versionRegistro:fila.versionRegistro}]};
   }
   if(texto.includes('UPDATE dbo.AcuerdosMonetariosReserva')){
    await paso(texto.includes('ValorAplicado=')?'fijacion':'acuerdoUpdate',tx,args);const fila=buscar(tx,'acuerdos',args.reserva);
    if(!fila||fila.fijadoEn||!fila.versionRegistro.equals(args.revision))return {recordset:[]};
    let nueva;
    if(texto.includes('ValorAplicado='))nueva={...fila,fuenteAplicada:args.fuente,tipoAplicado:args.tipo,valorAplicado:args.valor,fechaEfectiva:args.fecha,fechaCheckinFijada:args.checkin,
     fijadoEn:new Date(args.fijado),equivalenteARS:args.equivalente,idUsuarioFijacion:args.actor};
    else nueva={...fila,moneda:args.moneda,importe:args.importe,pagoEquivalenteARS:args.pagoARS,fuenteReferencia:args.fuente,tipoReferencia:args.tipo};
    nueva.versionRegistro=version();tx.acuerdos.set(args.reserva,nueva);return {recordset:[{versionRegistro:nueva.versionRegistro}]};
   }
   if(texto.includes('FROM dbo.AcuerdosMonetariosReserva')){
    await paso('acuerdoLectura',tx,args);const fila=buscar(tx,'acuerdos',args.reserva);
    return {recordset:args.reserva===undefined?copiar([...new Map([...h.acuerdos,...tx.acuerdos]).values()]):fila?[copiar(fila)]:[]};
   }
   if(texto.includes('FROM dbo.ReservaEventos re'))return {recordset:copiar(h.eventos.filter(e=>e.idReserva===args.idReserva))};
  };
  h.publicarExtra=tx=>{for(const tipo of ['tarifas','acuerdos','propiedades'])for(const [id,fila]of tx[tipo]||[])h[tipo].set(id,copiar(fila));};
 };
 h.reset();
 h.nuevaConexion=()=>new h.driver.Transaction(h.pool);
 h.verificarUnaConexion=()=>{assert.equal(h.poolRequests,0);assert.equal(new Set(h.consultas.map(c=>c.tx)).size,1);};
 return h;
}
module.exports={prepararMonedasIntegradas};
