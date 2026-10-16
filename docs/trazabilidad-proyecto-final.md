# Matriz de trazabilidad técnica para revisión académica

Objetivos propuestos a partir del código, no una rúbrica institucional aprobada.
Base y límites: [arquitectura-proyecto-final.md](arquitectura-proyecto-final.md).
Implementado significa disponible en código y con la evidencia indicada; no afirma
una validación nueva en Azure. Preparado significa sin integración/activación completa.

| Objetivo académico propuesto | Funcionalidad | Código relacionado | Evidencia reproducible | Estado y límite |
| --- | --- | --- | --- | --- |
| Centralizar alojamientos | Propiedades, estados, imágenes y canales | src/services/PropiedadService.js, src/repositories/PropiedadRepository.js; frontend/src/pages/Propiedades.jsx | tests/authorization.test.js; navegador: navegación y geometría de módulos | Implementado; publicación externa simulada. |
| Organizar estadías | Alta, edición, cancelación y reservas externas | src/services/ReservaService.js, src/security/validacionReserva.js | tests/operaciones-aisladas.test.js, tests/reservas-regresion-integral.test.js | Implementado; timeline y reserva no son una única transacción. |
| Mostrar disponibilidad sin solapamientos falsos | Calendario mensual, estadía con salida exclusiva, conflictos | src/services/CalendarioService.js; frontend/src/pages/Calendario.jsx | tests/calendario-regresion-integral.test.js; navegador de módulos | Implementado; concurrencia manual global pendiente. |
| Mantener contexto de huéspedes | Ficha e historial consultable, permisos económicos | src/services/HuespedService.js; frontend/src/components/huespedes/DetalleHuesped.jsx | tests/operaciones-aisladas.test.js; navegador de Huéspedes, ambos roles | Implementado; pruebas ficticias y aprobación visual previa del usuario. |
| Coordinar preparación y excepciones | Limpiezas y alertas derivadas | src/services/LimpiezaService.js, src/services/AlertaService.js | tests/operaciones-aisladas.test.js, tests/dashboard-readonly.test.js | Implementado; existen GET con escrituras, no se probaron en Azure. |
| Restringir acceso y responsabilidad | JWT, roles, campos, proyección económica e IDs | src/middlewares/autenticacion.js, src/middlewares/autorizacion.js, src/security/proyecciones.js | tests/auth.test.js, tests/authorization.test.js, tests/flowia-permissions.test.js | Implementado; principal SQL compartido, sin RLS. |
| Gestionar cuentas con seguridad | Contraseñas, revocación, último Administrador, Mi cuenta | src/services/AuthService.js, src/services/UsuarioService.js, src/repositories/UsuarioRepository.js | tests/security-api.test.js, tests/security-cuentas.test.js, tests/security-repositories.test.js; navegador | Implementado; concurrencia de motor solo con resultados históricos externos a esta tanda. |
| Apoyar decisiones operativas | Dashboard, reportes, PDF diferido | src/services/DashboardService.js; frontend/src/pages/Reportes.jsx | tests/dashboard-readonly.test.js, tests/authorization.test.js; navegador PDF | Implementado; valores económicos restringidos por permiso, sin contabilidad completa. |
| Explicar señales detectadas | FlowIA y drawer modal | src/services/RecomendacionService.js, src/services/IaService.js; frontend/src/pages/FlowIA.jsx | tests/flowia-permissions.test.js; frontend/tests/contratos-operativos.test.js y navegador | Implementado; IA opcional, no se llamó al proveedor real en esta tanda. |
| Parametrizar una organización | Empresa, horarios, concurrencia y modo lectura | src/services/ConfiguracionService.js, src/repositories/ConfiguracionRepository.js | tests/configuracion-api.test.js, tests/configuracion-repository.test.js; navegador | Implementado; una organización, zona fija y flags explícitas. Persistencia previa confirmada por usuario. |
| Facilitar acceso y legibilidad | Claro/Oscuro/Automático, movimiento reducido, responsive | frontend/public/appearance.js, frontend/src/services/preferenciasNavegador.js | frontend/tests/appearance.test.js, frontend/tests/theme-palette.test.js; navegador | Implementado por navegador; no tema SQL por cuenta. |
| Consultar avisos y preferencias | Bandeja operativa y ocho preferencias propias | src/services/NotificacionService.js, src/repositories/NotificacionRepository.js; frontend/src/pages/Notificaciones.jsx | tests/notificaciones-api.test.js, tests/notificaciones-regresion.test.js; navegador | Implementado; preferencias reales confirmadas por usuario, no generan avisos automáticos. |
| Preparar automatización confiable | Contratos personales v2 y constructores de eventos v3 | src/notifications/eventosReserva.js; src/repositories/NotificacionRepository.js | tests/notificaciones-productores-puros.test.js, tests/notificaciones-personales-repository.test.js | Preparado; sin productores conectados, reparto, UI personal o nuevos GRANT. |
| Sustentar calidad y reproducibilidad | Pruebas aisladas y guardas SQL | tests/*.test.js; frontend/tests/browser; sql/proposals | Suites actuales y PRUEBAS.md de la tanda; SQL solo histórico | Implementado para el alcance probado; no sustituye pruebas de carga o despliegue. |

Las rutas se interpretan relativas a backend salvo el prefijo frontend. Las tablas
reales y los permisos efectivos no se inspeccionaron en esta entrega. No se atribuyen
al documento pruebas institucionales, aceptación comercial o cumplimiento normativo.
