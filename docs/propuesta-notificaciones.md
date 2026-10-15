# Próximo módulo: Notificaciones y preferencias generales

Diseño para revisión, no implementación. No hay DDL, filas nuevas, endpoints
operativos ni envíos externos. Una organización por instalación; no habilitar
multiempresa solo por agregar IdEmpresa a tablas nuevas.

## Separar responsabilidades

Las alertas actuales expresan condiciones operativas y se sincronizan por clave;
no son una bandeja personal. Sus tipos y reglas se conservan. El estado Leída de
una alerta actual tampoco debe confundirse con la lectura de una notificación de
cada usuario. Apariencia sigue siendo local del navegador en esta etapa.

Tipos verificados en AlertaService.construirAlertasOperativas:

| Tipo actual | Clave actual de condición |
| --- | --- |
| INCIDENCIA_ABIERTA | INCIDENCIA + IdIncidenciaReserva |
| SINCRONIZACION_ERROR | SYNC_ERROR + IdPropiedadCanal |
| CHECKIN_PROXIMO | CHECKIN + IdReserva |
| CONFLICTO_RESERVAS | CONFLICTO + par de reservas ordenado |

Una clave de condición no equivale a una nueva ocurrencia: si se resuelve y
reaparece, hay que decidir cuándo volver a avisar. No reutilizar sin más esa clave
como idempotencia eterna ni emitir otro aviso en cada GET. Definir ciclo/versión
de ocurrencia en el diseño del productor antes de implementarlo. Limpiezas puede
originar avisos futuros, pero no se inventa un tipo de Alerta existente para ello.

Preferencias personales propuestas: tipos de avisos dentro de HostFlow, densidad
de presentación y, si se aprueba, inicio de semana/calendario. No cambiar formatos
de fechas o zona operativa de forma implícita. Preferencias empresariales: qué
eventos operativos generan avisos y su política de conservación, solo Administrador.
Mantener Buenos Aires fija y las preferencias de nuevas reservas ya implementadas.

## Modelo conceptual, sujeto a aprobación SQL

| Entidad propuesta | Relación y datos mínimos |
| --- | --- |
| PreferenciasNotificacionUsuario | Una fila por IdUsuario y tipo; habilitado para avisos internos; auditoría y rowversion. |
| PoliticasNotificacionEmpresa | Una empresa del servidor, tipo, habilitado global y retención acordada; rowversion y editor. |
| Notificaciones | Id, IdEmpresa, tipo, clave de evento única por empresa, fecha UTC y referencia operativa; sin importes ni copia de documentos/contactos. |
| NotificacionDestinatarios | IdNotificacion + IdUsuario únicos, fecha de lectura personal y revisión. Nunca altera Alertas.Estado. |

No almacenar cuerpos generados por IA ni secretos. La referencia al objeto se
revalida al abrirlo. Evitar preconstruir mensajes económicos visibles a Operador;
formar el texto permitido según los permisos actuales al consultar. Una cuenta
desactivada o con cambio obligatorio no accede; rol Propietario sigue excluido.

## Flujos y permisos

Generar un aviso solo después de confirmar el cambio operativo, con clave idempotente
del evento. Para la primera versión, priorizar bandeja interna; nada de email/SMS,
webhooks o tareas externas. Diseñar outbox transaccional si se necesita entrega
robusta; no injertar el envío en GET ni duplicar la sincronización existente.
Si operación y aviso no comparten transacción, definir explícitamente la recuperación
antes de anunciar entrega garantizada. La falla del aviso no debe recrear reservas.

Administrador administra políticas empresariales y sus preferencias personales;
Operador solo las personales y su bandeja autorizada. Ninguno marca avisos de otro
usuario mediante un ID recibido del cliente. El backend deriva IdUsuario del JWT
revalidado e IdEmpresa del servidor. No se introduce membresía multiempresa ficticia.

Consultas futuras de bandeja, contador y preferencias deben ser lecturas puras.
Marcar leído requiere acción explícita e idempotente. Navegar desde un aviso sigue
las rutas y permisos actuales; advertir que algunos módulos destino sincronizan
datos sin que eso convierta GET /notificaciones en un sincronizador.

## Etapas y pruebas esperadas

1. Aprobar tipos de avisos y retención, diferenciándolos del Centro de alertas.
2. Inspección SQL de metadatos autorizada y revisión del modelo; migración separada,
   bloqueada hasta aprobación, sin asumir permisos sobre tablas nuevas.
3. Repositorios parametrizados y pruebas aisladas de destinatarios, claves únicas,
   revisiones concurrentes, desactivación/revocación y datos económicos anidados.
4. API y UI de bandeja/personalización con vacíos, errores, carga y responsive en
   tres temas. Confirmar que GET no genera avisos y que leer no cambia Alertas.
5. Integración gradual de productores con fixtures: reserva creada/cancelada,
   limpieza pendiente y alerta de conflicto; duplicación/reproceso/reintento no
   duplican notificaciones. No probar contra reservas reales sin autorización.

Decisiones pendientes del usuario: avisos predeterminados, destinatarios por tipo,
retención y si se desea marcar todo como leído. No asumir destinatarios globales,
envío a todos los Administradores ni nuevos permisos de producción.
