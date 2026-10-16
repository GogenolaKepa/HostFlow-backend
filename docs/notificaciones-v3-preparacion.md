# Notificaciones v3: constructores puros, sin activación

`src/notifications/eventosReserva.js` prepara cuatro eventos desde una proyección
validada de reserva. Ninguna ruta, servicio operativo, arranque o job lo importa.
No hay driver, conexión, escrituras, productores, reparto, permisos o flags nuevos.
Las tablas v2 y los 55 derechos directos confirmados por el usuario no se modifican.

## Contrato implementado

```js
const {construirEventoReserva} = require('../notifications/eventosReserva');
const evento = construirEventoReserva({
  idEmpresa: 1, // contexto del servidor; nunca del body del cliente
  tipo: 'RESERVA_NUEVA',
  reserva: {
    idReserva: 123, idPropiedad: 7, canal: 'Manual', estado: 'Confirmada',
    fechaIngreso: '2028-02-28', fechaEgreso: '2028-03-02',
  },
  idOcurrencia: 'operacion-ficticia-1', // operación duradera confirmada, aún por integrar
  fechaEvento: '2028-02-28T12:00:00.000Z', // instante del hecho, no del reintento
});
```

Ejemplo exclusivamente ficticio, sin guardar ni ejecutar SQL. Los campos de entrada
son cerrados: no pasar una respuesta API completa con contactos, precios o texto
libre. La salida inmutable contiene solamente idEmpresa, tipo, claveEvento,
referenciaTipo, referenciaId, prioridad y fechaEvento. La referencia usa string
decimal para preservar BIGINT. El constructor valida pero no acredita existencia,
pertenencia empresarial, autorización o commit: eso corresponde al adaptador futuro.

| Tipo | Regla y prioridad inicial propuesta |
| --- | --- |
| RESERVA_NUEVA | Estado Pendiente/Confirmada; Informativa. |
| RESERVA_CANCELADA | Estado Cancelada; Media. |
| RESERVA_MODIFICADA | Snapshot válido de la operación; Media. El adaptador deberá acreditar un cambio efectivo. |
| CONFLICTO_DISPONIBILIDAD | Dos reservas diferentes, activas, misma propiedad, estadías superpuestas con egreso exclusivo; Alta. |

Las prioridades pueden recibirse explícitamente desde una política futura validada,
solo Critica/Alta/Media/Informativa. Estos valores iniciales son preparación; no se
aprovisionaron políticas ni se decidió obligatoriedad. Para conflicto se exige
`reservaRelacionada` con el mismo contrato, y se ordena el par por su ID numérico.
La salida referencia la reserva menor; la futura UI deberá revalidar todo el contexto.

## Idempotencia

Identidad canónica: versión del constructor + empresa + tipo + referencias
canónicas + idOcurrencia. SHA-256 produce `reserva-v3:<64 caracteres hex>`;
74 caracteres ASCII, dentro de varchar(200), consistente con comparación BIN2.
Misma operación reentregada conserva clave; otra empresa, reserva, tipo u ocurrencia
la cambia. Un conflicto A/B tiene la misma clave que B/A para la misma ocurrencia.

`idOcurrencia` es obligatoria y no se genera con reloj, azar o datos de contacto.
Su fuente duradera sigue pendiente. Los contadores en memoria de las simulaciones
reinician con el proceso y NO sirven como identificador duradero de producción.
Para modificaciones no usar únicamente el hash del estado final: volver a un
estado anterior en otra operación debe producir una nueva ocurrencia.

`prepararLoteEventosReserva` elimina repeticiones idénticas en memoria. Si la misma
clave llega con prioridad o fecha diferentes, falla el lote; no sobrescribe un evento
silenciosamente. No es un repositorio ni garantiza deduplicación entre procesos.
La restricción existente UQ_Notificaciones_Evento debe ser la última defensa en SQL;
una violación única futura debe comparar el evento existente antes de darlo por entregado.

## Integración futura: propuesta, no implementada

1. Acordar ocurrencia duradera y atomicidad para manual, inbound y confirmaciones
   de canal. Reserva/huésped/timeline/acuse hoy no comparten una única transacción.
   Publicar solo después de commit evita avisos de operaciones fallidas, pero deja
   una ventana de pérdida si el proceso cae; no prometer entrega garantizada.
   Evaluar un outbox transaccional requiere diseño SQL y autorización adicional.
2. Definir destinatarios autorizados, empresa/cuenta activas, rol, tipo, preferencias
   ausentes, obligatoriedad y políticas. No enviar a todos los Administradores por
   defecto ni asumir que guardar una preferencia autoriza entregar un evento.
3. Revisar privilegios nuevos para INSERT de Notificaciones y NotificacionDestinatarios.
   No se preparan GRANT ejecutables ni se confía en db_datawriter como permiso mínimo.
   Los 55 actuales no incluyen esas concesiones directas. Separar derechos del productor
   de los de lectura y marcado; revisar otra vez el procedimiento de retiro de roles.
4. Preparar/adaptar repositorio y transacciones con motor LOCAL descartable autorizado.
   Probar rollback, carreras por clave única, inserción parcial y permisos restringidos.
   No repetir DDL v2 ni los GRANT ya aplicados en Azure.
5. Integrar detrás de una activación nueva, apagada por defecto y autorizada después;
   no reutilizar WRITE_ENABLED de preferencias para encender productores inadvertidamente.
   No producir eventos al navegar por GET, HEAD, FlowIA o sincronizaciones de lectura.
6. Verificar backend personal existente, diseñar UI de entregas y actualización de
   contador sin convertir las alertas operativas en una bandeja personal.
7. Autorizar por separado cualquier prueba Azure y definir desactivación/recuperación
   sin borrados de filas. Esta entrega no activa ninguna de esas operaciones.

Limpiezas y alertas críticas quedan como fuentes propuestas: requieren identidad de
ocurrencia, tratamiento de reapertura y política para no duplicar en cada sincronización.
No se exporta un constructor para ellas ni se modifica AlertaService/LimpiezaService.

## Evidencia disponible

`tests/notificaciones-productores-puros.test.js`: tipos, longitudes, BIGINT, fechas
UTC y bisiestos, payload cerrado, referencias, superposición, repetición, conflicto
simétrico, contenido incompatible, inmutabilidad y ausencia de imports productivos.
Se contrastan constantes con el DDL v2 existente sin ejecutarlo. Son pruebas de
contratos puros; no prueban una transacción ni entrega del motor SQL.
