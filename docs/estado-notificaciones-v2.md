# Notificaciones v2: estado confirmado y límites

## Hechos confirmados por el usuario

Estas comprobaciones fueron ejecutadas manualmente por el usuario, no por Codex
en la tanda de cierre:

- Azure HostFlow, empresa del servidor IdEmpresa=1: cuatro tablas v2 creadas y
  verificadas; 28 columnas, seis FK, nueve CHECK, nueve índices y cuatro marcas.
- Esquema local: 25/25 grupos aprobados.
- Permisos locales: 8/8 positivos y 18/18 negativos, con copia SSMS corregida,
  rollback completado y las seis tablas dbo originales preservadas.
- Azure: cinco instrucciones GRANT ejecutadas; 48/48 históricos + 7/7 nuevos =
  **55/55 derechos directos**. CONNECT adicional conocido en base, estado G.
- hostflow_app conserva db_datareader y db_datawriter. Esto todavía NO constituye
  mínimo privilegio efectivo, aunque las concesiones directas estén completas.
- El usuario confirmó posteriormente el guardado real de las ocho preferencias
  del Administrador: RESERVA_NUEVA habilitada, las otras siete deshabilitadas,
  persistencia tras F5 y reinicio. Después volvió WRITE_ENABLED a 0.
- La tanda v2 fue publicada según el usuario; al comenzar la auditoría del
  16/10/2026 ambos repositorios estaban limpios. No se verificó Git remoto hoy.

**NO repetir DDL, migraciones, aprovisionamiento, bootstrap, 48 GRANT ni siete GRANT
nuevos. No retirar roles amplios.** Los SQL históricos se conservan sin reescritura
como evidencia. Sus comentarios de propuesta pertenecen al momento de preparación;
este documento y la confirmación del usuario prevalecen sobre planes anteriores.

## Verificación local ejecutada por Codex

Sin SQL real ni conexiones a Azure. Se corrigieron en generador y derivados:

1. La comparación de permisos locales excluye exclusivamente CONNECT de clase 0,
   major_id=0, minor_id=0 y estado G. No excluye W, DENY, otros permisos de base,
   columnas/objetos o membresías. Los siete operativos siguen siendo exactos.
2. La variable TABLE usa declaración propia:
   `DECLARE @Rev binary(8); DECLARE @Nueva TABLE(Revision binary(8));`.

Las regresiones son estáticas; las pruebas reales de motor confirmadas por el
usuario NO se repitieron. Los scripts locales permanecen bloqueados. Los seis
scripts históricos de permisos mínimos conservan sus huellas. El manifiesto
conserva la matriz de 48 y registra los siete por separado, incluidos tres UPDATE
por columna; el refresco de fuentes es auditoría, no una concesión SQL.

Se reforzó la revalidación de cuenta/rol/sesión después de GET de preferencias y
dentro de la transacción de guardado. Una confirmación incompleta o distinta de las
opciones enviadas produce fallo y rollback; la UI no anuncia éxito si no recibe las
ocho opciones persistidas con revisión y valores correctos. Los cambios de estado,
rol, contraseña y sesiones siguen las reglas de Seguridad existentes.

## Contratos y banderas existentes

| Ruta /api/notificaciones | Efecto y control |
| --- | --- |
| GET /avisos | Solo SELECT de Alertas persistidas; ambos roles autorizados. Sin sincronización ni marcado personal. |
| GET /preferencias | Solo SELECT y verificación de modelo/empresa/cuenta. SQL_ENABLED=1 y autenticación SQL. |
| PUT /preferencias | Cuenta autenticada exclusivamente, body cerrado de ocho opciones, rowversion, transacción y applock. Además WRITE_ENABLED=1. |
| GET /personales | Contrato preparado de lista por empresa/usuario/tipos con cursor bigint, sin escritura. Además PERSONALES_ENABLED=1. |
| GET /personales/contador | Solo SELECT de no leídas de esa cuenta y empresa. Misma bandera personal. |
| PUT /personales/:id/lectura | UPDATE FechaLectura propio, revisión, 404 ajeno/inexistente, 409 obsoleto e idempotencia. Exige las tres banderas. |

Los nombres completos son HOSTFLOW_NOTIFICACIONES_SQL_ENABLED,
HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED y HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED.
Solo el literal `1` habilita; ausentes/otros valores quedan cerrados. No se agregó
otra arquitectura o bandera de lectura. HOSTFLOW_AUTH_SOURCE=sql y
HOSTFLOW_EMPRESA_ID=1 se definen en el servidor, no en body/query del cliente.

JWT ausente/inválido/revocado: 401. Sin permiso/cambio obligatorio: 403. Entradas
fuera del contrato: 400. Entrega ajena/no disponible: 404 sin confirmar su existencia.
Conflicto de revisión: 409. Bandera apagada, modelo ausente, error de conexión o
confirmación incompleta: 503 con código/mensaje cerrado. Respuestas no-store.

Las preferencias no aceptan IDs ni rol del cliente. Las entregas filtran tanto
IdUsuario autenticado como IdEmpresa del servidor; el contador tiene el mismo
alcance. No existe RLS ni membresía empresarial en Usuarios. Sigue una organización
por instalación, con principal SQL compartido y roles amplios pendientes de retiro.

## Estado funcional y activaciones posteriores

Bandeja operativa y formulario de preferencias están implementados; el guardado
real del Administrador fue validado por el usuario, no repetido por el agente.
No hay UI de bandeja personal,
productores, reparto, políticas efectivas, email/SMS/push ni entrega garantizada.
Guardar preferencias no cambia la bandeja operativa ni las reglas de negocio.

Estado de lectura a conservar: SQL_ENABLED=1, WRITE_ENABLED=0 y PERSONALES_ENABLED=0. Habilita GET
de preferencias, no la bandeja personal futura ni ninguna escritura personal.
Configuración empresarial conserva HOSTFLOW_CONFIGURACION_READ_ONLY=1.
Otra prueba de escritura exige nueva autorización expresa; no se deriva de la
validación anterior ni de las funciones puras v3 ahora preparadas. Ver
[notificaciones-v3-preparacion.md](notificaciones-v3-preparacion.md).

El contrato actual guarda el formulario COMPLETO: ocho tipos. Si no hay filas,
el primer guardado crea ocho preferencias, aunque se marque una sola opción; las
otras siete se guardan desactivadas. En guardados posteriores se actualizan las
ocho revisiones. La aprobación de la prueba debe contemplar ese efecto; si solo se
autoriza escribir una fila, detener el guardado y revisar el alcance del contrato.
No se modificó este contrato ni se añadió una API parcial para esta entrega.

Los servicios los inicia exclusivamente el usuario. Guía exacta y comandos en
`HostFlow/revision/cierre-notificaciones/PRUEBAS-WEB.md`. Codex no activó banderas,
modificó .env, inició servicios reales ni guardó preferencias en Azure.
