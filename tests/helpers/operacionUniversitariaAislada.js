// API real + driver/filas ficticios. No importa database real, .env o SQL Server.
const {randomBytes}=require('node:crypto');
const jwt=require('jsonwebtoken');
async function crearApiUniversitaria(){
 const {prepararMonedasIntegradas}=require('./monedasIntegradasAisladas'),h=prepararMonedasIntegradas();
 const {fechaNegocio}=require('../../src/domain/monedas');h.hoy=fechaNegocio();h.siguienteId=900;h.siguienteHuesped=100;h.fechaUTC=new Date().toISOString();
 const copia=x=>structuredClone(x),consultaAnterior=h.consultaExtra;
 h.limpiezas=new Map();const publicarAnterior=h.publicarExtra;h.publicarExtra=tx=>{publicarAnterior?.(tx);for(const tipo of ['limpiezas','huespedes'])for(const [id,fila]of tx[tipo]||[])h[tipo].set(id,copia(fila));};
 const filas=tx=>[...new Map([...h.filas,...tx.cambios]).values()];
 const reserva=(r,tx)=>{const g=tx?.huespedes?.get(r.idHuesped)||h.huespedes.get(r.idHuesped);return {...copia(r),bloqueaDisponibilidad:!['Cancelada','No show'].includes(r.estado),propiedad:h.propiedades.get(r.idPropiedad)?.nombre||'',huesped:[g?.nombre,g?.apellido].filter(Boolean).join(' ')};};
 const operativa=r=>!['Cancelada','Finalizada','No show'].includes(r.estado);
 h.consultaExtra=async q=>{
  const {texto,args,tx}=q;
  if(texto.includes('INSERT INTO dbo.Reservas')&&Object.hasOwn(args,'canal')){
   const idReserva=h.siguienteId++;tx.cambios.set(idReserva,{...copia(args),idReserva,estadoSincronizacion:'Sincronizada'});tx.creadas.add(idReserva);h.inserts++;return {recordset:[{IdReserva:idReserva}]};
  }
  if(texto.includes('UPDATE dbo.TareasLimpieza')){
   await h.hooks.limpiezaActualizar?.();const fila=h.limpiezas.get(args.idTareaLimpieza);if(!fila||fila.estado==='Cancelada')return {rowsAffected:[0]};tx.limpiezas??=new Map();tx.limpiezas.set(args.idTareaLimpieza,{...copia(fila),estado:args.estado});return {rowsAffected:[1]};
  }
  if(texto.includes('FROM dbo.TareasLimpieza')){
   const xs=[...new Map([...h.limpiezas,...(tx.limpiezas||[])]).values()].filter(x=>args.idTareaLimpieza===undefined||x.idTareaLimpieza===args.idTareaLimpieza);
   if(texto.includes('AS pendientes'))return {recordset:[{total:xs.length,pendientes:xs.filter(x=>x.estado==='Pendiente').length,enProgreso:xs.filter(x=>x.estado==='En progreso').length,completadas:xs.filter(x=>x.estado==='Completada').length,canceladas:xs.filter(x=>x.estado==='Cancelada').length,urgentes:0}]};return {recordset:copia(xs)};
  }
  if(texto.includes('@PropiedadesActivas'))return {recordset:[{propiedadesActivas:[...h.propiedades.values()].filter(p=>p.estado==='Activa').length,reservasActivas:filas(tx).filter(r=>['Pendiente','Confirmada'].includes(r.estado)&&r.fechaEgreso>=args.fechaActual).length,huespedesRegistrados:h.huespedes.size,ingresosMes:0,ocupacionMensual:0}]};
  if(texto.includes('FROM dbo.Alertas a'))return {recordset:[]};
  if(texto.includes('SELECT TOP (@limite)'))return {recordset:filas(tx).filter(r=>operativa(r)&&r.fechaIngreso>=args.fechaActual).map(reserva)};
  if(texto.includes('AS totalReservasPeriodo')){
   const rs=filas(tx).filter(r=>r.fechaIngreso>=args.fechaDesde&&r.fechaIngreso<args.fechaHasta&&(!args.idPropiedad||r.idPropiedad===args.idPropiedad)&&(!args.canal||r.canal===args.canal)&&(!args.estado||r.estado===args.estado));
   const suma=xs=>xs.filter(r=>['Confirmada','Finalizada'].includes(r.estado)).reduce((s,r)=>s+Number(r.montoEstimado||0),0);
   const grupo=campo=>[...new Set(rs.map(r=>r[campo]))].map(k=>({[campo]:k,cantidad:rs.filter(r=>r[campo]===k).length}));
   const props=[...h.propiedades.values()].filter(p=>!args.idPropiedad||p.idPropiedad===args.idPropiedad).map(p=>{const xs=rs.filter(r=>r.idPropiedad===p.idPropiedad);return {idPropiedad:p.idPropiedad,propiedad:p.nombre,reservas:xs.length,ingresosEstimados:suma(xs),nochesReservadas:xs.filter(r=>['Confirmada','Finalizada'].includes(r.estado)).reduce((s,r)=>s+(Date.parse(r.fechaEgreso)-Date.parse(r.fechaIngreso))/86400000,0)};});
   return {recordsets:[[{totalReservasPeriodo:rs.length,totalReservasOperativas:rs.filter(r=>['Pendiente','Confirmada','Finalizada'].includes(r.estado)).length,reservasConIngreso:rs.filter(r=>['Confirmada','Finalizada'].includes(r.estado)).length,ingresosEstimados:suma(rs)}],grupo('canal'),grupo('estado'),props]};
  }
  if(texto.includes(';WITH Meses AS')){
   // El driver devuelve filas de agregado, no pretende ejecutar/validar el CTE SQL.
   return {recordset:[]};
  }
  if(/AS canal\b/.test(texto)&&/AS estado\b/.test(texto)&&!texto.includes('FROM dbo.Reservas'))return {recordsets:[Array.from(h.propiedades.values(),p=>({idPropiedad:p.idPropiedad,nombre:p.nombre})),[{canal:'Manual'},{canal:'Booking'},{canal:'Airbnb'}],['Confirmada','Cancelada','Finalizada','Pendiente'].map(estado=>({estado}))]};
  const tablaPrincipal=/\bFROM dbo\.(\w+)\b/.exec(texto)?.[1];
  if(['ReservaMensajes','ReservaIncidencias','ReservaObservaciones','PropiedadImagenes','PropiedadImagenCanales'].includes(tablaPrincipal))return {recordset:[]};
  if(texto.includes('FROM dbo.CanalesReserva cr')&&texto.includes('LEFT JOIN dbo.PropiedadCanales'))return {recordset:['Booking','Airbnb'].map((canal,i)=>({idCanalReserva:i+2,canal,idPropiedadCanal:null,idExterno:null,estadoPublicacion:'No publicada',estadoSincronizacion:'No aplica'}))};
  if(texto.includes('FROM dbo.CanalesReserva cr')&&texto.includes('INNER JOIN dbo.PropiedadCanales'))return {recordset:[]};
  if(/FROM dbo\.PropiedadCanales\b/.test(texto))return {recordset:[]};
  if(texto.includes('INSERT INTO dbo.Huespedes')){
   await h.hooks.huespedCrear?.(args);if(h.fallos.huespedCrear)throw h.fallos.huespedCrear;
   const fila={...copia(args),idHuesped:h.siguienteHuesped++,origenRegistro:args.origenRegistro||'Manual'};tx.huespedes??=new Map();tx.huespedes.set(fila.idHuesped,fila);return {recordset:[copia(fila)],rowsAffected:[1]};
  }
  if(texto.includes('UPDATE dbo.Huespedes')){
   await h.hooks.huespedActualizar?.(args);if(h.fallos.huespedActualizar)throw h.fallos.huespedActualizar;
   const id=Number(args.idHuesped),a=h.huespedes.get(id);if(!a)return {recordset:[],rowsAffected:[0]};tx.huespedes??=new Map();tx.huespedes.set(id,{...a,...copia(args)});return {recordset:[],rowsAffected:[1]};
  }
  if(texto.includes('FROM dbo.Huespedes')){
   await h.hooks.huespedConsulta?.(args);if(h.fallos.huespedConsulta)throw h.fallos.huespedConsulta;
   let lista=[...new Map([...h.huespedes,...(tx.huespedes||[])]).values()];if(args.idHuesped!==undefined)lista=lista.filter(g=>g.idHuesped===Number(args.idHuesped));
   if(args.nombre!==undefined)lista=lista.filter(g=>g.nombre===args.nombre&&g.apellido===args.apellido);
   if(args.email!==undefined)lista=lista.filter(g=>(g.email||'').toLowerCase()===String(args.email).toLowerCase());
   return {recordset:lista.map(g=>{const rs=filas(tx).filter(r=>r.idHuesped===g.idHuesped);return {...copia(g),cantidadReservas:rs.length,tieneReservaActiva:Number(rs.some(r=>operativa(r)&&r.fechaIngreso<=h.hoy&&h.hoy<r.fechaEgreso)),tieneReservaFutura:Number(rs.some(r=>operativa(r)&&r.fechaIngreso>h.hoy))};})};
  }
  if(texto.includes('FROM dbo.Propiedades p')){
   await h.hooks.propiedadConsulta?.(args);if(h.fallos.propiedadConsulta)throw h.fallos.propiedadConsulta;
   const lista=[...new Map([...h.propiedades,...(tx.propiedades||[])]).values()].filter(p=>args.idPropiedad===undefined||p.idPropiedad===Number(args.idPropiedad));
   return {recordset:lista.map(p=>{const rs=filas(tx).filter(r=>r.idPropiedad===p.idPropiedad);return {...copia(p),cantidadReservas:rs.length,cantidadReservasActivas:rs.filter(operativa).length};})};
  }
  if(texto.includes('FROM dbo.Reservas r1')){
   const conjunto=filas(tx).map(reserva).filter(r=>r.bloqueaDisponibilidad&&(!args.idPropiedad||r.idPropiedad===args.idPropiedad)&&r.fechaIngreso<args.fechaHasta&&r.fechaEgreso>args.fechaDesde),conflictos=[];
   for(const a of conjunto)for(const b of conjunto)if(a.idReserva<b.idReserva&&a.idPropiedad===b.idPropiedad&&a.fechaIngreso<b.fechaEgreso&&a.fechaEgreso>b.fechaIngreso){
    const c={idPropiedad:a.idPropiedad,propiedad:a.propiedad,fechaConflictoDesde:[a.fechaIngreso,b.fechaIngreso].sort().at(-1),fechaConflictoHasta:[a.fechaEgreso,b.fechaEgreso].sort()[0]};for(const [s,r]of [['A',a],['B',b]])for(const k of ['idReserva','huesped','canal','estado','fechaIngreso','fechaEgreso'])c[k+s]=r[k];conflictos.push(c);
   }return {recordset:conflictos};
  }
  if(texto.includes('FROM dbo.Reservas r')&&!texto.includes('SELECT COUNT')&&!texto.includes('IdEstadoReserva AS idEstadoReserva')){
   let rs=filas(tx);if(args.idReserva!==undefined)rs=rs.filter(r=>r.idReserva===Number(args.idReserva));
   if(args.idExterno!==undefined)rs=rs.filter(r=>r.canal===args.canal&&r.idExterno===args.idExterno);
   if(args.idHuesped!==undefined)rs=rs.filter(r=>r.idHuesped===Number(args.idHuesped));
   if(args.fechaDesde&&args.fechaHasta)rs=rs.filter(r=>r.fechaIngreso<args.fechaHasta&&r.fechaEgreso>args.fechaDesde&&(!args.idPropiedad||r.idPropiedad===args.idPropiedad));return {recordset:rs.map(r=>reserva(r,tx))};
  }
  return consultaAnterior(q);
 };
 let poolN=0;h.pool.request=()=>{
  const tx={id:`POOL-${++poolN}`,ocupada:false,cambios:new Map(),eventos:[],creadas:new Set(),editadas:new Set(),lecturas:new Map()};
  const r=h.requestPara(tx),query=r.query;r.query=async sql=>{const respuesta=await query(sql);h.publicarExtra?.(tx);return respuesta;};return r;
 };
 const claves=['HOSTFLOW_AUTH_SOURCE','JWT_SECRET','HOSTFLOW_MONEDAS_SQL_ENABLED','HOSTFLOW_MONEDAS_WRITE_ENABLED','HOSTFLOW_MONEDAS_RESERVAS_ENABLED','HOSTFLOW_CONFIGURACION_READ_ONLY'];
 const antes=Object.fromEntries(claves.map(k=>[k,process.env[k]]));Object.assign(process.env,{HOSTFLOW_AUTH_SOURCE:'sql',JWT_SECRET:randomBytes(32).toString('hex'),HOSTFLOW_MONEDAS_SQL_ENABLED:'0',HOSTFLOW_MONEDAS_WRITE_ENABLED:'0',HOSTFLOW_MONEDAS_RESERVAS_ENABLED:'0',HOSTFLOW_CONFIGURACION_READ_ONLY:'1'});
 const auth=require('../../src/services/AuthService'),anteriorAuth=auth.obtenerUsuarioSesion;
 const cuenta=rol=>({idUsuario:rol==='Administrador'?999:998,nombre:'Cuenta universitaria ficticia',email:`${rol.toLowerCase()}@example.invalid`,rol,estado:'Activo',rolActivo:true,versionSesion:1,debeCambiarPassword:false});
 auth.obtenerUsuarioSesion=async(id,claims)=>{if(![999,998].includes(id)||claims.versionSesion!==1)throw Object.assign(Error('Sesión ficticia inválida'),{status:401,codigo:'SESION_INVALIDA'});return copia(cuenta(id===999?'Administrador':'Operador'));};
 const app=require('../../src/app'),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
 async function pedir(ruta,method='GET',body,rol='Administrador'){
  const u=cuenta(rol),token=jwt.sign({idUsuario:u.idUsuario,email:u.email,origen:'sql',versionSesion:1},process.env.JWT_SECRET,{expiresIn:'30m'});
  const res=await fetch(base+ruta,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=method==='HEAD'?null:await res.json();return {status:res.status,data};
 }
 return {h,pedir,async cerrar(){await new Promise(r=>server.close(r));auth.obtenerUsuarioSesion=anteriorAuth;for(const [k,v]of Object.entries(antes)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}};
}
module.exports={crearApiUniversitaria};
