// Auditoría OFFLINE. No importa configuración, dotenv, drivers ni servicios.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const OPERACIONES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const MATRIZ = [
  ['Roles','S','Autenticación y roles: consulta de nombres/estado; nunca administrar el catálogo SQL desde la aplicación.'],
  ['Usuarios','SIU','Login/perfil, alta, edición, estado, contraseña, revocación y último Administrador; sin borrado físico.'],
  ['CanalesReserva','S','Catálogo para joins y resolución de Manual/Airbnb/Booking.'],
  ['EstadosReserva','S','Catálogo para resolver y mostrar estados; las transiciones actualizan Reservas.'],
  ['EstadosPropiedad','S','Catálogo de estados; no se modifica desde el backend.'],
  ['Propiedades','SIU','Alta/edición/estado e inbound de propiedades; baja por estado.'],
  ['Huespedes','SIU','Alta manual y desde canales, edición y consulta de huéspedes.'],
  ['Reservas','SIU','Alta/edición/cancelación/estado/canales y finalización automática en GET.'],
  ['ReservaEventos','SI','Timeline y auditoría de operaciones/finalización; registros anexados, nunca modificados.'],
  ['ReservaMensajes','SIU','Mensajes y cambios de su estado; no se borran.'],
  ['ReservaIncidencias','SIU','Alta, edición y resolución de incidencias.'],
  ['ReservaObservaciones','SIUD','Notas internas: DELETE físico autorizado por la API para Administrador.'],
  ['TareasLimpieza','SIU','Sincronización automática y cambios de estado, incluidos GET de Limpiezas y FlowIA.'],
  ['Alertas','SIU','Upsert, lectura y resolución automática/manual; GET puede sincronizar.'],
  ['PropiedadCanales','SIU','Vinculación/publicación, estados de sincronización e inbound.'],
  ['PropiedadImagenes','SIU','Alta, edición, principal, orden, baja lógica/restauración e inbound; DELETE de API usa UPDATE.'],
  ['PropiedadImagenCanales','SIUD','Vínculos de imágenes con canales; eliminarVinculacion realiza DELETE físico.'],
  ['Empresas','SU','Leer y editar la empresa vinculada; INSERT inicial exclusivamente administrativo.'],
  ['PreferenciasOperativas','SU','Leer/editar horarios; GET predeterminados solo lee; INSERT inicial administrativo.'],
].map(([tabla, letras, motivo]) => ({ esquema: 'dbo', tabla,
  operaciones: OPERACIONES.filter((_, i) => letras.includes(['S','I','U','D'][i])), motivo }));

const ALIAS = { pc: 'PropiedadCanales', pic: 'PropiedadImagenCanales', tarea: 'TareasLimpieza' };
function analizarFuente(fuente, archivo) {
  const referencias = [];
  const metodos = [...fuente.matchAll(/\basync\s+(\w+)\s*\(/g)];
  function agregar(tabla, operacion, indice, nota = '') {
    const metodo = metodos.filter(m => m.index <= indice).at(-1)?.[1] || '(nivel de módulo)';
    referencias.push({ tabla, operacion, archivo, linea: fuente.slice(0, indice).split('\n').length, metodo, nota });
  }
  for (const m of fuente.matchAll(/\b(?:FROM|JOIN)\s+dbo\.(\w+)/gi)) agregar(m[1], 'SELECT', m.index);
  for (const m of fuente.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+dbo\.(\w+)/gi)) agregar(m[2], /^INSERT/i.test(m[1]) ? 'INSERT' : /^UPDATE/i.test(m[1]) ? 'UPDATE' : 'DELETE', m.index);
  for (const m of fuente.matchAll(/\b(UPDATE|DELETE)\s+(pc|pic|tarea)\b/gi)) agregar(ALIAS[m[2].toLowerCase()], m[1].toUpperCase(), m.index, 'Alias SQL resuelto y revisado contra FROM/JOIN.');
  if (archivo.endsWith('/ConfiguracionRepository.js')) {
    const indice = fuente.indexOf('UPDATE ${tabla}');
    if (indice < 0) throw Error('Revisar UPDATE dinámico de Configuración.');
    for (const tabla of ['Empresas','PreferenciasOperativas']) agregar(tabla,'UPDATE',indice,'Tabla elegida por rama interna cerrada, no por el cliente.');
  }
  return referencias;
}
function inventariar(root) {
  const fuentes = [], referencias = [], llamadasSQL = [];
  function recorrer(dir) {
    for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
      const absoluta=path.join(dir,e.name);
      if(e.isDirectory()) recorrer(absoluta);
      else if(e.name.endsWith('.js')) {
        const archivo=path.relative(root,absoluta).replace(/\\/g,'/');
        const bytes=fs.readFileSync(absoluta),fuente=bytes.toString('utf8');
        fuentes.push({archivo,sha256:createHash('sha256').update(bytes).digest('hex')});
        if(archivo.startsWith('src/repositories/')) referencias.push(...analizarFuente(fuente,archivo));
        for(const m of fuente.matchAll(/\.(query|batch|execute)\s*\(/g)) llamadasSQL.push({archivo,linea:fuente.slice(0,m.index).split('\n').length,tipo:m[1]});
      }
    }
  }
  recorrer(path.join(root,'src'));
  const modelo=new Map(MATRIZ.map(r=>[r.tabla,r]));
  for(const r of referencias) if(!modelo.get(r.tabla)?.operaciones.includes(r.operacion)) throw Error(`Operación fuera de matriz: ${r.archivo}:${r.linea} ${r.operacion} ${r.tabla}.`);
  for(const r of MATRIZ) for(const operacion of r.operaciones) if(!referencias.some(e=>e.tabla===r.tabla && e.operacion===operacion))throw Error(`Permiso sin evidencia SQL: ${operacion} ${r.tabla}.`);
  const otras=llamadasSQL.filter(r=>!r.archivo.startsWith('src/repositories/') && r.archivo!=='src/services/AuthService.js');
  if(otras.length)throw Error('Aparecieron consultas fuera de los repositorios/AuthService: revisar antes de conceder.');
  return {fuentes,referencias,llamadasSQL};
}
function filasEsperadas() {
  return MATRIZ.flatMap(r=>r.operaciones.map(op=>`(N'dbo.${r.tabla}',N'${op}')`)).join(',\n ');
}
function grants() { return MATRIZ.map(r=>`GRANT ${r.operaciones.join(', ')} ON OBJECT::dbo.${r.tabla} TO [hostflow_app];`).join('\n'); }
function filasPerfilCompleto() {
  return MATRIZ.flatMap(r=>OPERACIONES.map(op=>`(N'dbo.${r.tabla}',N'${op}',${r.operaciones.includes(op)?1:0})`)).join(',\n ');
}
module.exports={MATRIZ,OPERACIONES,analizarFuente,inventariar,filasEsperadas,filasPerfilCompleto,grants};
