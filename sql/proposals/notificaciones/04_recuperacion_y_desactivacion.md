# Plan de recuperación y desactivación — NO EJECUTADO

Nada de esta carpeta se ejecuta al iniciar o probar HostFlow. No ejecutar archivos en lote. No repetir Usuarios, Empresas, PreferenciasOperativas, bootstrap ni los 48 GRANT existentes.

El DDL propuesto usa una única transacción para cuatro tablas, índices y marcas: un fallo revierte todo. Ante resultado de commit incierto, inspeccionar metadatos antes de repetir; nunca borrar objetos existentes para reintentar.

Si falla una futura activación, el usuario detiene su servicio y lo inicia sin `HOSTFLOW_NOTIFICACIONES_SQL_ENABLED=1`, `HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED=1` ni `HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED=1`. No cambiar autenticación, credenciales o .env; conservar `HOSTFLOW_CONFIGURACION_READ_ONLY=1`. La bandeja de avisos persistidos sigue leyendo Alertas; las preferencias muestran activación pendiente. El agente no inicia/reinicia servicios.

No hay rollback destructivo automático, DROP, eliminación de filas, limpieza de tablas ajenas ni modificación de Alertas. Si existieran preferencias/notificaciones reales, conservarlas y diagnosticar. Recuperación PITR y cualquier borrado o DCL exigen aprobación administrativa independiente.

Antes de aplicar el modelo: inspección administrativa autorizada, ausencia de equivalentes y revisión de claves reales, PITR/ventana, aprobación de tipos, destinatarios y retención, revisión DDL completa, permisos mínimos y pruebas del motor en una base local descartable autorizada. Hoy solo hay pruebas sin motor. Los valores y tipos aquí son una propuesta, no esquema confirmado de Azure.

El principal conserva temporalmente roles amplios y heredaría permisos sobre tablas nuevas. No asumir que esto satisface el mínimo privilegio. Los seis derechos nuevos de los contratos preparados NO están en los 48 ya concedidos. Actualizar auditoría, prueba del perfil restringido y scripts de transición antes de retirar roles o activar esta persistencia. No conceder permisos generales, DELETE o DDL al backend.

El modelo propuesto actual es v2; v1 nunca se ejecutó y queda preservado en el snapshot de revisión. No aplicar v2 sobre objetos v1: se rechaza toda preexistencia. Hay contratos backend de bandeja/contador/lectura preparados y apagados; NO hay interfaz personal, productores, asignación de destinatarios, políticas efectivas ni purga. No prometer entrega por aplicar el DDL. La preferencia guardada solo será efectiva cuando se integren productores autorizados y se acuerden sus reglas. No habilitar generación por GET.
# Corrección preventiva y validación posterior

Consultar `docs/validacion-notificaciones-sql-v2.md` desde la raíz backend para
la secuencia A–F, las siete entradas directas y las copias locales descartables.
La corrección de prioridad a nvarchar(16) no autoriza una migración: el DDL sigue
bloqueado. El script 06 solo inspecciona concesiones y membresías; no retira roles.
No hay DROP ni limpieza automática nueva. Si un commit DDL es incierto, primero
inspeccionar; nunca repetir el script original ni eliminar objetos por reflejo.
