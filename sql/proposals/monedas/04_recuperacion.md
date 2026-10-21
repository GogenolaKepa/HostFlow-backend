# Activación y recuperación propuestas — sin ejecución

Modelo `hostflow-monedas-v2`, tres tablas NUEVAS. Nada de esta carpeta se ejecuta
desde dev/start/test/build. No se aplicó DDL, DCL ni se abrió SQL en esta entrega.
No repetir Usuarios, Empresas, Notificaciones, los 55 derechos históricos ni el
piloto 5/17/32/61/62/63. No retirar roles amplios.

## Secuencia separada y criterios de detención

1. **Aprobar inspección administrativa.** Revisar `00_inspeccion_bloqueada.sql`.
   Mantener su copia original bloqueada. En la sesión administrativa existente,
   acreditar servidor `hostflow`, base `HostFlow`, EngineEdition 5 y visibilidad
   completa. Revisar tipos, PK/FK, defaults/CHECK, triggers, RLS e índices de las
   dependencias. Detener ante destino distinto, metadatos ocultos, claves no int
   simples/únicas o alguna de las tres tablas ya existente. No conceder VIEW
   DEFINITION al backend para resolver una inspección administrativa.
2. **Autorizar por separado una prueba local de motor.** Se necesita una base
   descartable exclusiva y autorizada con marca de aislamiento, nunca una base
   existente con datos. Antes de crearla, revisar nombre/servidor/esquema de las
   dependencias a partir de los metadatos acreditados. Preparar una COPIA del DDL
   con guardas exclusivas de ese destino local y sus fixtures, conservando tipos,
   restricciones e índices. No cambiar EngineEdition ni destino en el original
   Azure. Esta entrega no crea esa base ni incluye un runner que la cree.
   Probar creación, valores límite decimal, todas las combinaciones NULL/CHECK,
   FK/duplicados, OUTPUT+rowversion, CAS, fijación única y su relación aritmética,
   transacciones/rollback, applocks y carreras con edición/cancelación/finalización.
   Comprobar también DCL con usuario ficticio sin roles amplios, previa autorización.
   Resultado esperado: guardar y releer textos decimales exactos; rechazar tipos,
   filas y columnas no permitidos; rollback conjunto. Detener ante cualquier fallo.
3. **Aprobar creación Azure.** Solo después de la evidencia de motor y revisión
   humana, usar una copia revisada de `01_modelo_bloqueado.sql`, completando
   `@ServidorEsperado`, `@InventarioRevisado=1` y `@Aplicar=1` manualmente. Requiere
   sesión administrativa dedicada sin transacción previa/implícita. Crea únicamente
   las tres tablas, diez FK, dos índices secundarios y tres marcas, sin backfill.
   No altera tablas operativas ni inserta monedas por inferencia. Si un objeto ya
   existe, detener: no es un actualizador de versiones ni una migración repetible.
4. **Verificar independientemente.** Revisar y autorizar `03_verificacion_solo_lectura.sql`.
   Acreditar las tres marcas v2, columnas/collation, CHECK confiables, FK habilitadas
   y sus columnas, PK/índices, defaults, triggers/RLS y ausencia de datos inesperados.
   El script consulta metadatos; revisar por separado cualquier lectura de filas.
5. **Permisos nuevos, autorización propia.** `02_permisos_texto.sql` solo genera seis
   sentencias como texto; no ejecuta GRANT. Propone SELECT/INSERT de las tres tablas
   y UPDATE limitado a 8/8/15 columnas: **37 derechos de objeto/columna nuevos**.
   No DELETE/DDL/administración ni UPDATE de identidad/empresa/autor original.
   Revisar el principal sin pedir SID privado. Extender y probar el perfil de
   mínimos y su universo antes de usar los scripts históricos congelados. Verificar
   directos con 03 y luego efectivos bajo la identidad adecuada: los roles actuales
   db_datareader/db_datawriter hacen que ausencia de GRANT directo no pruebe denegación.
6. **Lectura antes de escritura.** Con el usuario controlando los servicios y sin
   editar .env, aprobar variables temporales de su proceso: autenticación SQL,
   empresa activa del servidor y `HOSTFLOW_MONEDAS_SQL_ENABLED=1`,
   `HOSTFLOW_MONEDAS_WRITE_ENABLED=0`, `HOSTFLOW_MONEDAS_RESERVAS_ENABLED=0`.
   Verificar estado/propiedades/tarifas/configuración sin consultar proveedores al
   navegar. Después habilitar la lectura de acuerdos con `RESERVAS_ENABLED=1` y
   escritura todavía en 0. Las altas monetarias estarán bloqueadas deliberadamente.
7. **Escritura acotada aprobada.** Con una sola versión del backend y tráfico
   controlado, aprobar nuevos fixtures distintos del piloto histórico. Habilitar
   WRITE=1 y permitir escritura de configuración solo durante esa ventana
   (`HOSTFLOW_CONFIGURACION_READ_ONLY=0`). Probar propiedad+tarifa, cotización manual
   o consulta oficial explícita, reserva+acuerdo+evento, revisión/CAS, fijación en
   fecha válida, edición de egreso y cancelación lógica. Verificar cada paso tras
   recarga y SELECT dirigido antes del siguiente. No invocar comandos globales ni
   integraciones. Cualquier incertidumbre obliga a detener y releer; no reenviar.

## Desactivar sin perder la autoridad de precios o los acuerdos

La recuperación ordinaria es **WRITE=0** o el cierre global de escritura de
Configuración, conservando **SQL_ENABLED=1 y RESERVAS_ENABLED=1** una vez que
existen tarifas/acuerdos. Así continúan la lectura de la tarifa autoritativa,
el snapshot y la protección del check-in fijado. No se borra ninguna fila.

**No bajar las banderas de lectura ni volver a una versión antigua del backend
mientras sigan habilitados escritores.** Ese código volvería a interpretar
PrecioBase como vigente o dejaría de comprobar el snapshot. Para una desactivación
total, detener antes los escritores bajo control humano, conservar evidencia y
aprobar un plan de compatibilidad. No hay fallback automático del nuevo precio
al archivo legacy, sincronización de ambos valores o backfill de ARS/USD.

Un commit incierto del DDL exige inspeccionar objetos/marcas antes de repetir.
Un commit incierto de negocio exige recargar acuerdo/reserva/historial; un rollback
posterior no acredita que el commit no ocurrió. No cortar Azure o sesiones reales
para provocar esa condición. No restaurar, DROP, DELETE ni limpiar fixtures aquí.

Las invariantes de fijación son del protocolo de la aplicación y CAS. Un principal
SQL con roles amplios o escritores directos queda fuera: los CHECK no comparan con
la versión anterior y no vuelven físicamente inmutable una fila frente a DML ajeno.
Las FK independientes no acreditan pertenencia multiempresa; sigue una organización
configurada en el servidor, sin RLS o aislamiento por usuario nuevos.
