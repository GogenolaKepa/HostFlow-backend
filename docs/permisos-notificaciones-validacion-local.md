# Validación local de los siete permisos de Notificaciones v2

**Actualización de cierre:** el usuario confirmó 8/8 positivos y 18/18 negativos
aprobados, rollback y fixtures intactos. Los siete derechos nuevos de Azure ya
están concedidos/verificados: 55/55 + CONNECT conocido, roles amplios conservados.
El generador incorpora las correcciones SSMS de CONNECT y DECLARE TABLE con
regresiones estáticas. No repetir preparación, pruebas SQL ni GRANT; el contenido
restante es el procedimiento histórico. Ver [estado vigente](estado-notificaciones-v2.md).

Estado: **preparado offline, sin ejecutar SQL, DCL, conexiones o creación de usuarios**.
El usuario confirmó las cuatro tablas creadas/verificadas en Azure, 25/25 pruebas
locales de esquema, 48 GRANT históricos confirmados, siete nuevos faltantes y ambos
roles amplios conservados. El texto de los cinco GRANT no fue ejecutado. No repetir
DDL, migraciones, vinculación, pruebas de esquema ni concesiones históricas.

## Archivos preparados

`sql/proposals/notificaciones_permisos_local/`:

- `01_preparar_perfil_bloqueado.sql`: PrepararPerfil=0. Tras autorización expresa,
  crea esquema HF_Notificaciones_PermisosV2, seis tablas ficticias vacías y usuario
  HF_Notificaciones_PruebaV2 WITHOUT LOGIN, sin contraseña ni roles. Concede SOLO
  las siete entradas propuestas sobre las copias, en una transacción. Marca esquema
  y principal como propios. Rechaza cualquier preexistencia; no modifica hostflow_app.
- `02_probar_permisos_bloqueado.sql`: ProbarPermisos=0. Otra autorización permite
  sembrar datos ficticios en clones dentro de una transacción, impersonar al usuario
  con EXECUTE AS USER y ejecutar ocho grupos positivos y 18 negativos. Revierte todos
  los datos. No contiene DCL ni aprovisionamiento.
- `perfil-permisos-v2.json`: matriz explícita de 48 históricos + siete nuevos,
  estados declarados por el usuario y huellas de DDL/cuerpo clonado/texto GRANT Azure.

Generador offline: `scripts/prepararPermisosNotificacionesLocal.js --preparar`.
Solo lee/escribe archivos, no abre conexiones ni ejecuta SQL. No está incorporado
a dev/start/test ni a hooks npm. Las pruebas estáticas llaman su función de generación
en memoria y comparan las propuestas guardadas; nunca ejecutan SQL/DCL.

## Preservar los fixtures ya aprobados

Un rollback no deshace el avance de IDENTITY. Por eso NO se insertan filas en las
seis tablas dbo originales: se crea un esquema de pruebas separado DENTRO de
HostFlow_Test_Notificaciones_V2, sin crear otra base. El cuerpo DDL de las cuatro
tablas es idéntico al revisado, sustituyendo exclusivamente el esquema en tablas,
FK y marcas. Los dos padres son mínimos ficticios, sin credenciales ni datos reales.
La fidelidad de la sustitución y sus huellas se comprueban estáticamente.

No se usa SELECT INTO: se conservan CHECK, PK, UNIQUE, FK, defaults, identity,
rowversion, índices y marcas de las cuatro tablas. Ambos esquemas pertenecen a dbo;
los permisos son por objeto/columna, no por esquema. La identidad restringida no
recibe permisos sobre ningún objeto dbo. Así se comprueba la semántica real del
motor para el perfil propuesto sin escribir sobre los fixtures originales.

Se valida antes/después el estado original: padres ficticios IDs 1/2, cuatro tablas
nuevas vacías, todas las marcas y contadores IDENTITY originales. Solo los clones
reciben DML; sus filas se revierten aun ante fallos. El @@DBTS global y los IDENTITY
de los clones pueden avanzar: no se intenta restaurarlos ni se modifican rowversion
de filas originales. Es una limitación normal del motor, no persistencia de datos.

## Qué demuestra cada control

| Control | Evidencia preparada |
| --- | --- |
| SELECT e INSERT de preferencias | Operaciones reales, INSERT exige una fila |
| UPDATE autorizado | Habilitada, FechaActualizacion y combinación con OUTPUT rowversion |
| UPDATE prohibido | IdUsuario, Tipo y combinación de campo permitido/prohibido |
| SELECT eventos/destinatarios | Conteo del fixture propio |
| Marcar lectura | UPDATE con JOIN, predicados propios y rowversion, exige una fila |
| Otras columnas de entrega | UPDATE IdUsuario, IdNotificacion y FechaRecepcion rechazados |
| INSERT eventos/destinatarios | Intentos reales rechazados |
| Políticas | SELECT, INSERT, UPDATE y DELETE rechazados |
| DELETE | Rechazado en las seis tablas propias |
| Administración/exceso | Catálogo directo exacto siete G, sin delegación/membresías/propiedad; permisos efectivos de DB/objetos/columnas |

Se captura el universo de columnas como administrador ANTES de impersonar, para no
confundir metadatos ocultos con ausencia de permisos. Se verifica UPDATE en TODAS
las columnas, incluso identity/rowversion, sin intentar una escritura inválida por
el tipo de esas columnas. Las negativas DML solo aprueban por errores 229/230 de
permisos: un error de FK, CHECK, UNIQUE o columna generada no acredita autorización.
Los batches dinámicos contienen únicamente literales cerrados generados offline;
no aceptan SQL externo ni datos del cliente. Permiten capturar denegaciones de
compilación en un ámbito inferior al TRY/CATCH, bajo la identidad restringida.

Una cuenta WITHOUT LOGIN prueba permisos de base mediante impersonación; no prueba
conectividad/autenticación por contraseña. La prueba tampoco demuestra entrega,
productores, políticas efectivas o todo el perfil de las 19 tablas operativas.

## Pasos exactos pendientes de autorización

1. Revisar ambos SQL completos y el JSON. No ejecutar en lote ni cambiar originales.
   En SSMS usar Windows integrado, servidor `lpc:localhost`, base
   `HostFlow_Test_Notificaciones_V2`, sesión administrativa dedicada/autocommit.
   Guardas exigidas: PC-Escritorio, EngineEdition=3, major=17, Shared memory,
   NTLM/KERBEROS, collation SQL_Latin1_General_CP1_CI_AS y marca
   hostflow-notifications-disposable-v2; ambas marcas padre y cuatro marcas v2.
   No usar Portal Azure, TCP, otra base ni usuarios/contraseñas reales.
2. **Solicitar autorización de preparación local**: esquema, seis tablas copiadas,
   usuario WITHOUT LOGIN y siete GRANT ficticios. Solo después abrir una copia de
   `01`, cambiar exclusivamente PrepararPerfil=1 y ejecutar batch COMPLETO. Esperado:
   seis tablas propias vacías, dos marcas de pertenencia (esquema/usuario), cero
   membresías y siete G exactos. No volver a ejecutar si el resultado es incierto:
   inspeccionar primero. Los originales continúan bloqueados.
3. **Solicitar autorización de prueba DML local**. En copia de `02`, cambiar solo
   ProbarPermisos=1. Ejecutar batch completo en la misma base/instancia administrativa.
   Esperado: PositivasAprobadas=8/8 y NegativasAprobadas=18/18, sin datos persistidos
   en los seis clones; tablas, marcas e identity dbo intactos. En éxito o error se
   ejecuta REVERT y ROLLBACK; ante cancelación/interrupción, cerrar la sesión dedicada
   y revisar de forma administrativa antes de volver a intentar.
4. Detener ante cualquier guarda, fallo de permisos positivo, negativa aceptada,
   error que no sea 229/230, datos/marcas inesperados o identidad no restaurada.
   No agregar roles, permisos generales, DENY o derechos de padres para arreglarlo.
   Corregir el defecto y revisar la propuesta antes de repetir.
5. Guardar solo conteos/resultados técnicos no sensibles. No eliminar usuario,
   esquema o tablas automáticamente; se conservan para revisión. Su eliminación
   requiere autorización posterior y acreditar de nuevo sus marcas/inventario.
6. Solo con evidencia 8/8 + 18/18 aprobada: revisar las cinco líneas generadas por
   el `02` de Azure y solicitar autorización administrativa SEPARADA para conceder
   sus siete entradas a hostflow_app. No repetir DDL ni los 48 históricos. Repetir
   `06_verificacion_permisos_directos_bloqueada.sql` bajo autorización de lectura:
   55 confirmados (48+7), sin delegación/adicionales no revisados. Conservar ambos
   roles amplios y las banderas de Notificaciones apagadas hasta otra aprobación.

La matriz de 48 y los seis scripts históricos de retiro/recuperación se conservan
intactos. El JSON nuevo agrega una vista explícita de 55 entradas sin convertir
los UPDATE por columna en concesiones globales. Mientras existan db_datareader y
db_datawriter, los derechos efectivos siguen siendo mayores; una concesión directa
faltante no implica una denegación efectiva en Azure. La identidad ficticia solo
tiene los siete nuevos, sin los 48 históricos, para aislar esa evidencia.
