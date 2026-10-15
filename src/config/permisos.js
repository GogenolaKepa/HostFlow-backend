// Roles fijos. Cada acción se define una sola vez; las rutas y la UI consumen
// los permisos efectivos del servidor, nunca un rol enviado por el cliente.
// true concede la acción al Operador; Administrador dispone de todo el catálogo.
const CATALOGO_PERMISOS = Object.freeze({
  "configuracion.ver": false,
  "configuracion.modificar": false,
  "usuarios.ver": false,
  "usuarios.crear": false,
  "usuarios.modificar": false,
  "usuarios.estado": false,
  "usuarios.restablecer": false,
  "roles.ver": false,
  "cuenta.ver": true,
  "cuenta.modificar": true,
  "cuenta.password": true,
  "dashboard.ver": true,
  "dashboard.economia": false,
  "propiedades.ver": true,
  "propiedades.gestionar": false,
  "imagenes.ver": true,
  "imagenes.gestionar": false,
  "canales.ver": true,
  "canales.gestionar": false,
  "reservas.ver": true,
  "reservas.crear": true,
  "reservas.modificar": true,
  "reservas.cancelar": false,
  "reservas.importes": false,
  "reservas.estado": false,
  "reservas.canales": false,
  "mensajes.ver": true,
  "mensajes.crear": true,
  "incidencias.ver": true,
  "incidencias.crear": true,
  "incidencias.modificar": true,
  "incidencias.resolver": true,
  "observaciones.ver": true,
  "observaciones.crear": true,
  "observaciones.modificar": false,
  "observaciones.eliminar": false,
  "observaciones.fijar": false,
  "huespedes.ver": true,
  "huespedes.crear": true,
  "huespedes.modificar": true,
  "calendario.ver": true,
  "limpiezas.ver": true,
  "limpiezas.sincronizar": true,
  "limpiezas.estado": true,
  "alertas.ver": true,
  "alertas.sincronizar": true,
  "alertas.leer": true,
  "alertas.resolver": true,
  "reportes.ver": true,
  "reportes.economia": false,
  "reportes.exportar": false,
  "integraciones.gestionar": false,
  "flowia.ver": true,
  "flowia.comercial": false,
});

const PERMISOS_POR_ROL = Object.freeze({
  Administrador: Object.freeze(Object.keys(CATALOGO_PERMISOS)),
  Operador: Object.freeze(Object.keys(CATALOGO_PERMISOS).filter((accion) => CATALOGO_PERMISOS[accion])),
});

function permisosDelRol(rol) {
  return Object.hasOwn(PERMISOS_POR_ROL, rol) ? PERMISOS_POR_ROL[rol] : [];
}

function tienePermiso(usuario, permiso) {
  return permisosDelRol(usuario?.rol).includes(permiso);
}

module.exports = { CATALOGO_PERMISOS, PERMISOS_POR_ROL, permisosDelRol, tienePermiso };
