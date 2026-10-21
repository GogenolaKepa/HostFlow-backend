// Los días de negocio son fechas civiles argentinas, independientes del host/SQL.
function fechaOperativa(ahora=new Date()){
 const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ahora);
 const valor=tipo=>partes.find(p=>p.type===tipo).value;
 return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
module.exports={fechaOperativa};
