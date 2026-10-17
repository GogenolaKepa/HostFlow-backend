// Paths relativos al montaje /api. Una ruta nueva debe declarar su política;
// de lo contrario el middleware la rechaza antes de ejecutar el controlador.
const politicas = [];
function agregar(prefijo, permiso, metodos) {
  for (const [metodo, rutas] of Object.entries(metodos)) {
    for (const ruta of rutas) {
      const path = prefijo + (ruta === "/" ? "" : ruta);
      const patron = path.split("/").map((parte) =>
        parte.startsWith(":") ? "[^/]+" : parte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      ).join("/");
      politicas.push(Object.freeze({ metodo, path, permiso, patron: new RegExp(`^${patron}/?$`, "i") }));
    }
  }
}

agregar("/dashboard", "dashboard.ver", { GET: ["/resumen", "/historico"] });
agregar("/notificaciones", "notificaciones.ver", { GET: ["/avisos"] });
agregar("/notificaciones", "notificaciones.ver", { GET: ["/personales", "/personales/contador"] });
agregar("/notificaciones", "notificaciones.leer", { PUT: ["/personales/:id/lectura"] });
agregar("/notificaciones", "notificaciones.preferencias", { GET: ["/preferencias"], PUT: ["/preferencias"] });
agregar("/configuracion", "configuracion.ver", { GET: ["/empresa", "/operativas"] });
agregar("/configuracion", "configuracion.modificar", { PUT: ["/empresa", "/operativas"] });
agregar("/configuracion", "reservas.crear", { GET: ["/predeterminados-reserva"] });
agregar("/usuarios", "usuarios.ver", { GET: ["/", "/:id"] });
agregar("/usuarios", "usuarios.crear", { POST: ["/"] });
agregar("/usuarios", "usuarios.modificar", { PUT: ["/:id"] });
agregar("/usuarios", "usuarios.estado", { PATCH: ["/:id/estado"] });
agregar("/usuarios", "usuarios.restablecer", { POST: ["/:id/restablecer-password"] });
agregar("/roles", "roles.ver", { GET: ["/"] });
agregar("/dashboard", "reportes.ver", { GET: ["/reportes", "/reportes/opciones"] });
agregar("/propiedades", "propiedades.ver", { GET: ["/", "/:id"] });
agregar("/propiedades", "propiedades.gestionar", { POST: ["/"], PUT: ["/:id"], PATCH: ["/:id/estado"] });
agregar("/propiedades", "canales.ver", { GET: ["/:id/canales"] });
agregar("/propiedades", "canales.gestionar", { POST: ["/:id/canales/publicar", "/:id/canales/sincronizar"] });
agregar("/propiedades", "imagenes.ver", { GET: ["/:id/imagenes"] });
agregar("/propiedades", "imagenes.gestionar", {
  GET: ["/:id/imagenes/todas"], POST: ["/:id/imagenes", "/:id/imagenes/upload"],
  PUT: ["/:id/imagenes/:idImagen"], DELETE: ["/:id/imagenes/:idImagen"],
  PATCH: ["/:id/imagenes/:idImagen/principal", "/:id/imagenes/:idImagen/orden", "/:id/imagenes/:idImagen/restaurar"],
});
agregar("/reservas", "reservas.ver", { GET: ["/", "/:id", "/:id/eventos"] });
agregar("/reservas", "reservas.crear", { POST: ["/"] });
agregar("/reservas", "reservas.estado", { POST: ["/finalizar-vencidas"] });
agregar("/reservas", "reservas.modificar", { PUT: ["/:id"] });
agregar("/reservas", "reservas.cancelar", { PATCH: ["/:id/cancelar"] });
agregar("/reservas", "reservas.canales", { POST: ["/:id/airbnb/propuesta", "/:id/booking/estadia", "/:id/booking/no-show"] });
agregar("/reservas", "integraciones.gestionar", { POST: ["/airbnb/solicitudes/:idSolicitud/aceptar", "/airbnb/solicitudes/:idSolicitud/rechazar", "/booking/operaciones/:idOperacion/sincronizar"] });
agregar("/reservas", "mensajes.ver", { GET: ["/:id/mensajes"] });
agregar("/reservas", "mensajes.crear", { POST: ["/:id/mensajes"] });
agregar("/reservas", "incidencias.ver", { GET: ["/:id/incidencias"] });
agregar("/reservas", "incidencias.crear", { POST: ["/:id/incidencias"] });
agregar("/reservas", "incidencias.modificar", { PATCH: ["/:id/incidencias/:idIncidencia"] });
agregar("/reservas", "incidencias.resolver", { POST: ["/:id/incidencias/:idIncidencia/resolver"] });
agregar("/reservas", "observaciones.ver", { GET: ["/:id/observaciones"] });
agregar("/reservas", "observaciones.crear", { POST: ["/:id/observaciones"] });
agregar("/reservas", "observaciones.modificar", { PATCH: ["/:id/observaciones/:idObservacion"] });
agregar("/reservas", "observaciones.fijar", { PATCH: ["/:id/observaciones/:idObservacion/fijar"] });
agregar("/reservas", "observaciones.eliminar", { DELETE: ["/:id/observaciones/:idObservacion"] });
agregar("/huespedes", "huespedes.ver", { GET: ["/", "/:id"] });
agregar("/huespedes", "huespedes.crear", { POST: ["/"] });
agregar("/huespedes", "huespedes.modificar", { PUT: ["/:id"] });
agregar("/calendario", "calendario.ver", { GET: ["/"] });
agregar("/limpiezas", "limpiezas.ver", { GET: ["/", "/resumen"] });
agregar("/limpiezas", "limpiezas.sincronizar", { POST: ["/sincronizar"] });
agregar("/limpiezas", "limpiezas.estado", { PATCH: ["/:id/estado"] });
agregar("/alertas", "alertas.ver", { GET: ["/", "/resumen"] });
agregar("/alertas", "alertas.sincronizar", { POST: ["/sincronizar"] });
agregar("/alertas", "alertas.leer", { PATCH: ["/:id/leida"] });
agregar("/alertas", "alertas.resolver", { PATCH: ["/:id/resolver"] });
agregar("/recomendaciones", "flowia.ver", { GET: ["/"] });

for (const canal of ["airbnb", "booking"]) {
  agregar(`/integraciones/${canal}`, "integraciones.gestionar", {
    GET: ["/eventos", "/propiedades/eventos", "/propiedades/imagenes/eventos"],
    POST: ["/simulacion/nueva-reserva", "/simulacion/modificacion", "/simulacion/cancelacion",
      "/eventos/:idEvento/procesar", "/propiedades/modificacion", "/propiedades/eventos/:idEvento/procesar",
      "/propiedades/imagenes/creacion", "/propiedades/imagenes/modificacion", "/propiedades/imagenes/eliminacion",
      "/propiedades/imagenes/principal", "/propiedades/imagenes/eventos/:idEvento/procesar"],
  });
}

function politicaPara(metodo, path) {
  // Express responde HEAD con el handler GET cuando no hay uno específico.
  const efectivo = metodo === "HEAD" ? "GET" : metodo;
  return politicas.find((politica) => politica.metodo === efectivo && politica.patron.test(path));
}

module.exports = { politicas: Object.freeze(politicas), politicaPara };
