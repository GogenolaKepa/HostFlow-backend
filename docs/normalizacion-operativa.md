# Normalización operativa y transacciones de Reservas

Esta entrega reúne la separación de consultas/comandos y las unidades 2A–2F,
sin reemplazar Azure SQL HostFlow. El piloto ficticio controlado fue completado
por el usuario desde la web el 17/10/2026: alta, edición y cancelación de una misma
reserva, con F5 e historial acreditados mediante SELECT independientes. No se
repitieron migraciones ni permisos. Esa evidencia es del recorrido feliz delimitado;
no acredita todas las carreras o fallos del motor ni autoriza ampliar operaciones.

## Contrato vigente

- GET/HEAD de Reservas, Limpiezas, Alertas y FlowIA solo consultan SQL.
- POST `/api/reservas/finalizar-vencidas` exige JWT, permiso `reservas.estado`
  (Administrador), y exactamente `{ "confirmar": true }`. La fecha de corte proviene
  de Buenos Aires en el servidor. Confirma todas las Confirmadas con egreso menor
  que hoy, conservando la regla anterior; no usa el filtro de la pantalla.
- La lectura no disfraza el estado persistido: devuelve `finalizacionPendiente`.
  Una Confirmada vencida no habilita acciones de edición/cancelación por evitar
  el comando. La UI informa el cierre pendiente y el Administrador lo confirma.
- La finalización y sus eventos comparten una transacción y un applock público.
  Un error al insertar timeline revierte el cambio de estado. No se usa el registro
  tolerante a fallos del resto del servicio para este comando.
- POST `/api/limpiezas/sincronizar` y `/api/alertas/sincronizar` conservan permisos,
  condiciones, claves, horizonte de 365 días y zona previos. Ahora usan transacción
  y applock por módulo; una fila idéntica no recibe UPDATE de sincronización.
- La modificación de estado de limpieza comparte el bloqueo de sincronización
  y comprueba nuevamente que no esté cancelada dentro del UPDATE.
- No hay nuevos jobs, timers, escrituras al arrancar ni POST al navegar.
  Las sincronizaciones dejan de ser automáticas al consultar: el usuario debe
  confirmarlas cuando cambian reservas/incidencias o avanza la fecha de negocio.
  No se promete refresco automático en segundo plano.
- Configuración y preferencias conservan sus flags y rowversion. No se habilita
  escritura para aparentar que el módulo operativo esté terminado.

Los locks nuevos usan `sys.sp_getapplock`, `public`, `Transaction`, 10 segundos y
`READ_COMMITTED`; no requieren DDL ni roles administrativos adicionales. La
exclusión solo cubre comandos que usan el mismo recurso; NO convierte el CRUD
completo en serializable. La transacción no bloquea cambios de otras tablas fuente
durante todo el proceso ni garantiza un snapshot global.

## Límites que siguen abiertos

Alta/edición/cancelación manuales unen reserva, historial obligatorio y lectura final
en una única conexión/transacción, con el mismo applock de finalización. La edición
relee y condiciona el UPDATE por estado/canal; no hay rowversion ni revisión del
formulario. Las unidades cooperantes serializan disponibilidad; los escritores
ajenos al protocolo aún pueden competir. Un commit incierto exige recargar, sin
reintento automático, y un rollback posterior no demuestra ausencia de escritura.

NUEVA_RESERVA inbound Booking también une huésped nuevo, reserva y eventos de
recepción/conflicto. Acepta la reserva externa confirmada incluso con conflicto;
su acuse en memoria ocurre después del commit. Los demás flujos externos siguen
fuera de esta garantía y pueden dejar operaciones parciales. Las colas/idempotencia
no son duraderas entre procesos o reinicios. Propiedades
puede persistir una edición y luego fallar la sincronización por canal. Imágenes
y sus vínculos también tienen operaciones parciales. No se inventan DELETE de
propiedades/huéspedes: no están implementados; no se recomienda borrarlos con SQL.

Siguen pendientes coordinación de todos los escritores, idempotencia durable,
formularios antiguos y pruebas autorizadas del motor sobre carreras y fallos.
No se declara seguro para producción todo el CRUD por aprobar fixtures o el piloto.
La inspección real previa acreditó parcialmente tipos, claves y permisos; las
definiciones ocultas de CHECK/defaults y visibilidad completa de RLS quedaron
pendientes de inspección administrativa. Se conserva bloqueada la propuesta
`sql/proposals/normalizacion_operativa/00_inspeccion_previa_bloqueada.sql`.

Los 48 derechos históricos y siete adicionales se conservan. Los scripts previos
de retiro de roles permanecen bloqueados; su perfil antiguo debe revisarse antes
de cualquier retiro. No repetir migraciones, bootstrap, vínculos ni GRANT históricos.

La matriz completa, resultados y aceptación controlada están en la carpeta externa
`HostFlow/revision/normalizacion-operativa-azure`. Las guías históricas que describen
GET mutantes corresponden a los commits anteriores a esta normalización local.
