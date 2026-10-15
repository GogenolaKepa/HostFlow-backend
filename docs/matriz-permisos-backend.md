# Matriz SQL mínima del backend HostFlow

Generada offline desde código: 111 archivos src con huellas, 118 llamadas SQL y 308 evidencias por tabla/operación. Incluye 104 rutas (99 políticas de negocio y 5 de autenticación). No son resultados de Azure ni una prueba del motor SQL. El extractor estático no reemplaza la revisión humana de alias, ramas dinámicas, triggers, herencias y SQL real.

El principal de proceso hostflow_app necesita la UNIÓN de operaciones de Administrador y Operador. Los permisos JWT/acción y las proyecciones económicas siguen aplicándose en Express. No se conceden estos permisos SQL a cada cuenta final ni se convierte Operador en administrador de SQL.

## Matriz por objeto

S=SELECT, I=INSERT, U=UPDATE, D=DELETE. Un guion significa NO conceder. Todas las tablas son dbo. El objetivo es 48 permisos DML específicos sobre 19 tablas.

| Tabla | S | I | U | D | Justificación |
| --- | --- | --- | --- | --- | --- |
| Roles | Sí | — | — | — | Autenticación y roles: consulta de nombres/estado; nunca administrar el catálogo SQL desde la aplicación. |
| Usuarios | Sí | Sí | Sí | — | Login/perfil, alta, edición, estado, contraseña, revocación y último Administrador; sin borrado físico. |
| CanalesReserva | Sí | — | — | — | Catálogo para joins y resolución de Manual/Airbnb/Booking. |
| EstadosReserva | Sí | — | — | — | Catálogo para resolver y mostrar estados; las transiciones actualizan Reservas. |
| EstadosPropiedad | Sí | — | — | — | Catálogo de estados; no se modifica desde el backend. |
| Propiedades | Sí | Sí | Sí | — | Alta/edición/estado e inbound de propiedades; baja por estado. |
| Huespedes | Sí | Sí | Sí | — | Alta manual y desde canales, edición y consulta de huéspedes. |
| Reservas | Sí | Sí | Sí | — | Alta/edición/cancelación/estado/canales y finalización automática en GET. |
| ReservaEventos | Sí | Sí | — | — | Timeline y auditoría de operaciones/finalización; registros anexados, nunca modificados. |
| ReservaMensajes | Sí | Sí | Sí | — | Mensajes y cambios de su estado; no se borran. |
| ReservaIncidencias | Sí | Sí | Sí | — | Alta, edición y resolución de incidencias. |
| ReservaObservaciones | Sí | Sí | Sí | Sí | Notas internas: DELETE físico autorizado por la API para Administrador. |
| TareasLimpieza | Sí | Sí | Sí | — | Sincronización automática y cambios de estado, incluidos GET de Limpiezas y FlowIA. |
| Alertas | Sí | Sí | Sí | — | Upsert, lectura y resolución automática/manual; GET puede sincronizar. |
| PropiedadCanales | Sí | Sí | Sí | — | Vinculación/publicación, estados de sincronización e inbound. |
| PropiedadImagenes | Sí | Sí | Sí | — | Alta, edición, principal, orden, baja lógica/restauración e inbound; DELETE de API usa UPDATE. |
| PropiedadImagenCanales | Sí | Sí | Sí | Sí | Vínculos de imágenes con canales; eliminarVinculacion realiza DELETE físico. |
| Empresas | Sí | — | Sí | — | Leer y editar la empresa vinculada; INSERT inicial exclusivamente administrativo. |
| PreferenciasOperativas | Sí | — | Sí | — | Leer/editar horarios; GET predeterminados solo lee; INSERT inicial administrativo. |

## Evidencia por objeto y operación

Las líneas se refieren al código local auditado. El JSON adjunto contiene las 308 referencias y las huellas completas.

### dbo.Roles

- SELECT: [src/repositories/RolRepository.js:15](../src/repositories/RolRepository.js#L15), método listarAsignables.

### dbo.Usuarios

- SELECT: [src/repositories/UsuarioRepository.js:23](../src/repositories/UsuarioRepository.js#L23), método buscarPorEmail.
- INSERT: [src/repositories/UsuarioRepository.js:76](../src/repositories/UsuarioRepository.js#L76), método crear.
- UPDATE: [src/repositories/UsuarioRepository.js:101](../src/repositories/UsuarioRepository.js#L101), método actualizar.

### dbo.CanalesReserva

- SELECT: [src/repositories/AlertaRepository.js:115](../src/repositories/AlertaRepository.js#L115), método obtenerSincronizacionesConError.

### dbo.EstadosReserva

- SELECT: [src/repositories/AlertaRepository.js:196](../src/repositories/AlertaRepository.js#L196), método obtenerCheckinsProximos.

### dbo.EstadosPropiedad

- SELECT: [src/repositories/CalendarioRepository.js:73](../src/repositories/CalendarioRepository.js#L73), método obtenerPropiedades.

### dbo.Propiedades

- SELECT: [src/repositories/AlertaRepository.js:57](../src/repositories/AlertaRepository.js#L57), método obtenerIncidenciasAlertables.
- INSERT: [src/repositories/PropiedadRepository.js:512](../src/repositories/PropiedadRepository.js#L512), método crear.
- UPDATE: [src/repositories/PropiedadRepository.js:617](../src/repositories/PropiedadRepository.js#L617), método actualizar.

### dbo.Huespedes

- SELECT: [src/repositories/AlertaRepository.js:61](../src/repositories/AlertaRepository.js#L61), método obtenerIncidenciasAlertables.
- INSERT: [src/repositories/HuespedRepository.js:216](../src/repositories/HuespedRepository.js#L216), método crear.
- UPDATE: [src/repositories/HuespedRepository.js:299](../src/repositories/HuespedRepository.js#L299), método actualizar.

### dbo.Reservas

- SELECT: [src/repositories/AlertaRepository.js:53](../src/repositories/AlertaRepository.js#L53), método obtenerIncidenciasAlertables.
- INSERT: [src/repositories/ReservaRepository.js:1069](../src/repositories/ReservaRepository.js#L1069), método crearReservaManual.
- UPDATE: [src/repositories/ReservaRepository.js:231](../src/repositories/ReservaRepository.js#L231), método finalizarReservasVencidas.

### dbo.ReservaEventos

- SELECT: [src/repositories/ReservaEventoRepository.js:288](../src/repositories/ReservaEventoRepository.js#L288), método obtenerPorReserva.
- INSERT: [src/repositories/ReservaEventoRepository.js:164](../src/repositories/ReservaEventoRepository.js#L164), método crearEvento.

### dbo.ReservaMensajes

- SELECT: [src/repositories/ReservaMensajeRepository.js:355](../src/repositories/ReservaMensajeRepository.js#L355), método obtenerPorReserva.
- INSERT: [src/repositories/ReservaMensajeRepository.js:211](../src/repositories/ReservaMensajeRepository.js#L211), método crearMensaje.
- UPDATE: [src/repositories/ReservaMensajeRepository.js:518](../src/repositories/ReservaMensajeRepository.js#L518), método actualizarEstado.

### dbo.ReservaIncidencias

- SELECT: [src/repositories/AlertaRepository.js:51](../src/repositories/AlertaRepository.js#L51), método obtenerIncidenciasAlertables.
- INSERT: [src/repositories/ReservaIncidenciaRepository.js:257](../src/repositories/ReservaIncidenciaRepository.js#L257), método crearIncidencia.
- UPDATE: [src/repositories/ReservaIncidenciaRepository.js:741](../src/repositories/ReservaIncidenciaRepository.js#L741), método actualizarIncidencia.

### dbo.ReservaObservaciones

- SELECT: [src/repositories/ReservaObservacionRepository.js:213](../src/repositories/ReservaObservacionRepository.js#L213), método obtenerPorReserva.
- INSERT: [src/repositories/ReservaObservacionRepository.js:106](../src/repositories/ReservaObservacionRepository.js#L106), método crearObservacion.
- UPDATE: [src/repositories/ReservaObservacionRepository.js:419](../src/repositories/ReservaObservacionRepository.js#L419), método actualizarObservacion.
- DELETE: [src/repositories/ReservaObservacionRepository.js:529](../src/repositories/ReservaObservacionRepository.js#L529), método eliminarObservacion.

### dbo.TareasLimpieza

- SELECT: [src/repositories/LimpiezaRepository.js:127](../src/repositories/LimpiezaRepository.js#L127), método sincronizar.
- INSERT: [src/repositories/LimpiezaRepository.js:139](../src/repositories/LimpiezaRepository.js#L139), método sincronizar.
- UPDATE: [src/repositories/LimpiezaRepository.js:648](../src/repositories/LimpiezaRepository.js#L648), método cambiarEstado.

### dbo.Alertas

- SELECT: [src/repositories/AlertaRepository.js:442](../src/repositories/AlertaRepository.js#L442), método crearOActualizarPorClave.
- INSERT: [src/repositories/AlertaRepository.js:515](../src/repositories/AlertaRepository.js#L515), método crearOActualizarPorClave.
- UPDATE: [src/repositories/AlertaRepository.js:447](../src/repositories/AlertaRepository.js#L447), método crearOActualizarPorClave.

### dbo.PropiedadCanales

- SELECT: [src/repositories/AlertaRepository.js:109](../src/repositories/AlertaRepository.js#L109), método obtenerSincronizacionesConError.
- INSERT: [src/repositories/PropiedadCanalRepository.js:298](../src/repositories/PropiedadCanalRepository.js#L298), método iniciarPublicacion.
- UPDATE: [src/repositories/PropiedadCanalRepository.js:362](../src/repositories/PropiedadCanalRepository.js#L362), método confirmarPublicacion. Alias SQL resuelto y revisado contra FROM/JOIN.

### dbo.PropiedadImagenes

- SELECT: [src/repositories/PropiedadImagenRepository.js:57](../src/repositories/PropiedadImagenRepository.js#L57), método obtenerPorPropiedad.
- INSERT: [src/repositories/PropiedadImagenRepository.js:244](../src/repositories/PropiedadImagenRepository.js#L244), método crear.
- UPDATE: [src/repositories/PropiedadImagenRepository.js:312](../src/repositories/PropiedadImagenRepository.js#L312), método actualizar.

### dbo.PropiedadImagenCanales

- SELECT: [src/repositories/PropiedadImagenCanalRepository.js:57](../src/repositories/PropiedadImagenCanalRepository.js#L57), método obtenerPorImagen.
- INSERT: [src/repositories/PropiedadImagenCanalRepository.js:302](../src/repositories/PropiedadImagenCanalRepository.js#L302), método iniciarSincronizacion.
- UPDATE: [src/repositories/PropiedadImagenCanalRepository.js:356](../src/repositories/PropiedadImagenCanalRepository.js#L356), método confirmarSincronizacion. Alias SQL resuelto y revisado contra FROM/JOIN.
- DELETE: [src/repositories/PropiedadImagenCanalRepository.js:670](../src/repositories/PropiedadImagenCanalRepository.js#L670), método eliminarVinculacion. Alias SQL resuelto y revisado contra FROM/JOIN.

### dbo.Empresas

- SELECT: [src/repositories/ConfiguracionRepository.js:34](../src/repositories/ConfiguracionRepository.js#L34), método leer.
- UPDATE: [src/repositories/ConfiguracionRepository.js:62](../src/repositories/ConfiguracionRepository.js#L62), método actualizar. Tabla elegida por rama interna cerrada, no por el cliente.

### dbo.PreferenciasOperativas

- SELECT: [src/repositories/ConfiguracionRepository.js:37](../src/repositories/ConfiguracionRepository.js#L37), método leer.
- UPDATE: [src/repositories/ConfiguracionRepository.js:62](../src/repositories/ConfiguracionRepository.js#L62), método actualizar. Tabla elegida por rama interna cerrada, no por el cliente.

## Consultas por repositorio

| Repositorio | Operaciones sobre tablas |
| --- | --- |
| src/repositories/AlertaRepository.js | Alertas: SELECT/UPDATE/INSERT; CanalesReserva: SELECT; EstadosReserva: SELECT; Huespedes: SELECT; PropiedadCanales: SELECT; Propiedades: SELECT; ReservaIncidencias: SELECT; Reservas: SELECT |
| src/repositories/CalendarioRepository.js | CanalesReserva: SELECT; EstadosPropiedad: SELECT; EstadosReserva: SELECT; Huespedes: SELECT; Propiedades: SELECT; Reservas: SELECT |
| src/repositories/ConfiguracionRepository.js | Empresas: SELECT/UPDATE; PreferenciasOperativas: SELECT/UPDATE |
| src/repositories/DashboardRepository.js | CanalesReserva: SELECT; EstadosPropiedad: SELECT; EstadosReserva: SELECT; Huespedes: SELECT; Propiedades: SELECT; Reservas: SELECT |
| src/repositories/HuespedRepository.js | EstadosReserva: SELECT; Huespedes: SELECT/INSERT/UPDATE; Reservas: SELECT |
| src/repositories/LimpiezaRepository.js | CanalesReserva: SELECT; EstadosReserva: SELECT; Huespedes: SELECT; Propiedades: SELECT; Reservas: SELECT; TareasLimpieza: SELECT/INSERT/UPDATE |
| src/repositories/PropiedadCanalRepository.js | CanalesReserva: SELECT; PropiedadCanales: SELECT/INSERT/UPDATE; Propiedades: SELECT |
| src/repositories/PropiedadImagenCanalRepository.js | CanalesReserva: SELECT; PropiedadImagenCanales: SELECT/INSERT/UPDATE/DELETE |
| src/repositories/PropiedadImagenRepository.js | PropiedadImagenes: SELECT/INSERT/UPDATE |
| src/repositories/PropiedadRepository.js | EstadosPropiedad: SELECT; EstadosReserva: SELECT; Huespedes: SELECT; PropiedadImagenes: SELECT; Propiedades: SELECT/INSERT/UPDATE; Reservas: SELECT |
| src/repositories/RecomendacionRepository.js | CanalesReserva: SELECT; EstadosPropiedad: SELECT; EstadosReserva: SELECT; Propiedades: SELECT; Reservas: SELECT |
| src/repositories/ReservaEventoRepository.js | ReservaEventos: SELECT/INSERT |
| src/repositories/ReservaIncidenciaRepository.js | ReservaIncidencias: SELECT/INSERT/UPDATE |
| src/repositories/ReservaMensajeRepository.js | ReservaMensajes: SELECT/INSERT/UPDATE |
| src/repositories/ReservaObservacionRepository.js | ReservaObservaciones: SELECT/INSERT/UPDATE/DELETE |
| src/repositories/ReservaRepository.js | CanalesReserva: SELECT; EstadosPropiedad: SELECT; EstadosReserva: SELECT; Huespedes: SELECT/INSERT; Propiedades: SELECT; Reservas: SELECT/UPDATE/INSERT |
| src/repositories/RolRepository.js | Roles: SELECT |
| src/repositories/UsuarioRepository.js | Roles: SELECT; Usuarios: SELECT/INSERT/UPDATE |

## Rutas auditadas

Prefijo /api. Todas las peticiones protegidas con JWT SQL consultan además Usuarios/Roles. HEAD hereda GET y sus efectos. OPTIONS se resuelve antes de autenticación, sin SQL. GET / de salud y recursos estáticos no son módulos SQL. No ejecutar estos endpoints contra Azure para validar permisos.

| Método | Ruta | Permiso API | DML en GET |
| --- | --- | --- | --- |
| GET | /api/dashboard/resumen | dashboard.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/dashboard/historico | dashboard.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/configuracion/empresa | configuracion.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/configuracion/operativas | configuracion.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| PUT | /api/configuracion/empresa | configuracion.modificar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PUT | /api/configuracion/operativas | configuracion.modificar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/configuracion/predeterminados-reserva | reservas.crear | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/usuarios | usuarios.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/usuarios/:id | usuarios.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/usuarios | usuarios.crear | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PUT | /api/usuarios/:id | usuarios.modificar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/usuarios/:id/estado | usuarios.estado | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/usuarios/:id/restablecer-password | usuarios.restablecer | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/roles | roles.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/dashboard/reportes | reportes.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/dashboard/reportes/opciones | reportes.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/propiedades | propiedades.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/propiedades/:id | propiedades.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/propiedades | propiedades.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PUT | /api/propiedades/:id | propiedades.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/propiedades/:id/estado | propiedades.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/propiedades/:id/canales | canales.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/propiedades/:id/canales/publicar | canales.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/propiedades/:id/canales/sincronizar | canales.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/propiedades/:id/imagenes | imagenes.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/propiedades/:id/imagenes/todas | imagenes.gestionar | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/propiedades/:id/imagenes | imagenes.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/propiedades/:id/imagenes/upload | imagenes.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PUT | /api/propiedades/:id/imagenes/:idImagen | imagenes.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| DELETE | /api/propiedades/:id/imagenes/:idImagen | imagenes.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/propiedades/:id/imagenes/:idImagen/principal | imagenes.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/propiedades/:id/imagenes/:idImagen/orden | imagenes.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/propiedades/:id/imagenes/:idImagen/restaurar | imagenes.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/reservas | reservas.ver | UPDATE Reservas; INSERT ReservaEventos si se finaliza alguna reserva vencida. |
| GET | /api/reservas/:id | reservas.ver | UPDATE Reservas; INSERT ReservaEventos si se finaliza alguna reserva vencida (puede afectar otras reservas, no solo el ID). |
| GET | /api/reservas/:id/eventos | reservas.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/reservas | reservas.crear | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PUT | /api/reservas/:id | reservas.modificar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/reservas/:id/cancelar | reservas.cancelar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/reservas/:id/airbnb/propuesta | reservas.canales | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/reservas/:id/booking/estadia | reservas.canales | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/reservas/:id/booking/no-show | reservas.canales | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/reservas/airbnb/solicitudes/:idSolicitud/aceptar | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/reservas/airbnb/solicitudes/:idSolicitud/rechazar | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/reservas/booking/operaciones/:idOperacion/sincronizar | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/reservas/:id/mensajes | mensajes.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/reservas/:id/mensajes | mensajes.crear | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/reservas/:id/incidencias | incidencias.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/reservas/:id/incidencias | incidencias.crear | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/reservas/:id/incidencias/:idIncidencia | incidencias.modificar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/reservas/:id/incidencias/:idIncidencia/resolver | incidencias.resolver | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/reservas/:id/observaciones | observaciones.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/reservas/:id/observaciones | observaciones.crear | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/reservas/:id/observaciones/:idObservacion | observaciones.modificar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/reservas/:id/observaciones/:idObservacion/fijar | observaciones.fijar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| DELETE | /api/reservas/:id/observaciones/:idObservacion | observaciones.eliminar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/huespedes | huespedes.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/huespedes/:id | huespedes.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/huespedes | huespedes.crear | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PUT | /api/huespedes/:id | huespedes.modificar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/calendario | calendario.ver | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/limpiezas | limpiezas.ver | SELECT fuentes; INSERT/UPDATE TareasLimpieza durante sincronización. |
| GET | /api/limpiezas/resumen | limpiezas.ver | SELECT fuentes; INSERT/UPDATE TareasLimpieza durante sincronización. |
| POST | /api/limpiezas/sincronizar | limpiezas.sincronizar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/limpiezas/:id/estado | limpiezas.estado | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/alertas | alertas.ver | SELECT fuentes; INSERT/UPDATE Alertas, incluida resolución automática. |
| GET | /api/alertas/resumen | alertas.ver | SELECT fuentes; INSERT/UPDATE Alertas durante sincronización. |
| POST | /api/alertas/sincronizar | alertas.sincronizar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/alertas/:id/leida | alertas.leer | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| PATCH | /api/alertas/:id/resolver | alertas.resolver | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/recomendaciones | flowia.ver | Consulta LimpiezaService.obtenerLimpiezas: INSERT/UPDATE TareasLimpieza; el resto consulta SQL/IA. |
| GET | /api/integraciones/airbnb/eventos | integraciones.gestionar | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/integraciones/airbnb/propiedades/eventos | integraciones.gestionar | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/integraciones/airbnb/propiedades/imagenes/eventos | integraciones.gestionar | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/integraciones/airbnb/simulacion/nueva-reserva | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/simulacion/modificacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/simulacion/cancelacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/eventos/:idEvento/procesar | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/propiedades/modificacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/propiedades/eventos/:idEvento/procesar | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/propiedades/imagenes/creacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/propiedades/imagenes/modificacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/propiedades/imagenes/eliminacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/propiedades/imagenes/principal | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/airbnb/propiedades/imagenes/eventos/:idEvento/procesar | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/integraciones/booking/eventos | integraciones.gestionar | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/integraciones/booking/propiedades/eventos | integraciones.gestionar | No se detecta DML persistente en el handler/servicio de consulta. |
| GET | /api/integraciones/booking/propiedades/imagenes/eventos | integraciones.gestionar | No se detecta DML persistente en el handler/servicio de consulta. |
| POST | /api/integraciones/booking/simulacion/nueva-reserva | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/simulacion/modificacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/simulacion/cancelacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/eventos/:idEvento/procesar | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/propiedades/modificacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/propiedades/eventos/:idEvento/procesar | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/propiedades/imagenes/creacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/propiedades/imagenes/modificacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/propiedades/imagenes/eliminacion | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/propiedades/imagenes/principal | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/integraciones/booking/propiedades/imagenes/eventos/:idEvento/procesar | integraciones.gestionar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/auth/login | Público con limitación de intentos | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| GET | /api/auth/me | JWT | No se detecta DML persistente en el handler/servicio de consulta. |
| PATCH | /api/auth/me | cuenta.modificar | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/auth/cambiar-password | cuenta.password | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |
| POST | /api/auth/logout | JWT | Consultar matriz y escenarios del módulo; no clasificar por verbo solamente. |

El procedimiento de transición, riesgos y preparación de pruebas está en [auditoria-permisos-sql.md](auditoria-permisos-sql.md). Scripts y manifiesto: sql/proposals/permisos_minimos/. No se ejecutaron concesiones ni retiros de roles.
