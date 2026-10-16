# Notificaciones v2: correcciones preventivas y validación pendiente

**Cierre posterior:** el usuario confirmó 55/55 derechos y CONNECT conocido,
25/25 pruebas estructurales y 8/8 + 18/18 de permisos aprobadas. No repetir DDL,
concesiones o pruebas SQL de los pasos siguientes. Roles amplios conservados.
Activación funcional pendiente; ver [estado vigente](estado-notificaciones-v2.md).

Actualización posterior confirmada por el usuario: DDL v2 creado y verificado en
Azure y 25/25 grupos de esquema aprobados localmente. **No repetir DDL ni esos
grupos.** Los 48 históricos están confirmados, los siete nuevos faltan y ambos
roles amplios continúan. Lo siguiente es la prueba de permisos preparada en
`permisos-notificaciones-validacion-local.md`, sin ejecución por el agente.
El resto de este documento conserva el procedimiento e informe histórico.

Entrega preparada offline. **No se ejecutó SQL, no se conectó a Azure y no hay
validación real del motor. No autoriza ejecutar los pasos siguientes.** No activar
las tres banderas de Notificaciones. Las cuatro tablas siguen siendo una propuesta.
Usuarios, Empresas, Configuración C/D y los 48 GRANT ya aplicados no se repiten.

## Cambios del contrato

`Prioridad` pasa de `nvarchar(10)` a `nvarchar(16)` y collation BIN2 explícita.
`Informativa` tiene 11 unidades UTF-16 y antes no cabía. Critica/Alta/Media/Informativa
son el catálogo personal cerrado, compartido por filtros y DTO. Los parámetros de
ambos listados usan la constante 16. NoDefinida sigue siendo exclusivamente una
presentación de severidades operativas desconocidas, nunca un valor SQL personal.
No hay productor que inserte eventos desde el backend actual.

Los filtros rechazan truncados, cambios de caso, acentos, espacios y valores
desconocidos, incluso de longitud 16; una cadena de longitud 17 tampoco es válida.
La prueba hermética comprueba enum, capacidad y parámetros; el rechazo físico por
SQL Server solo se acreditará con el script local preparado.

El DDL ahora exige el valor exacto de collation obtenido por inspección, sin cambiar
la base. Tipo, prioridad, claves de evento y referencias usan BIN2, independiente
de que la base sea CI/CS o AI/AS. Se excluyen espacios finales explícitamente
porque incluso comparaciones binarias de SQL pueden completar espacios. ReferenciaTipo
también recibió ese control. No se agrega una política de normalización de claves
de evento: son `varchar(200)` y el productor futuro deberá producir claves técnicas
ASCII canónicas de hasta 200 bytes. Tipo es `nvarchar(40)` y sus ocho códigos caben.

IdUsuario e IdEmpresa deben ser `int` nativo NOT NULL, de cuatro bytes, no calculado,
generado o cifrado, con índice único habilitado, real y no filtrado de UNA columna
clave. Se admiten PK/UQ o índice único referenciable; no basta una columna de nombre
parecido o una clave compuesta. `00` expone tipos, collation, composición de índices,
FK y CHECK de ambos padres, sin filas. Si el esquema real difiere, detenerse.

IdNotificacion/IdEntrega/ReferenciaId son bigint; la API conserva IDs personales
como strings decimales para no perder precisión JavaScript. ReferenciaId es
polimórfica: no es una FK a Reservas/Alertas/Limpiezas. El productor futuro deberá
verificar existencia, tipo y empresa antes de generar. Fechas UTC datetime2(3) son
compatibles con Date; rowversion de ocho bytes se transmite como 16 hexadecimales.

Inventario esperado: **4 tablas, 28 columnas, 4 PK, 2 UNIQUE adicionales, 9 índices
en total (incluidas PK/UNIQUE), 6 FK, 9 CHECK, 4 defaults UTC, 2 identity,
3 rowversion y 4 marcas `hostflow-notificaciones-v2`**. Las FK no tienen cascadas.
El índice de bandeja usa IdUsuario/IdEntrega DESC y existe un índice filtrado de
no leídas. El evento es único por empresa/ClaveEvento, el destinatario por
evento/usuario, y preferencias/políticas por usuario/tipo y empresa/tipo.
Obligatoria exige Habilitada; retención permite NULL o 1..3650; lectura no precede
a recepción. No se crean políticas predeterminadas ni se insertan eventos.

`03` compara las 28 columnas (tipo nativo, nulabilidad, identity, scale, longitud,
collation), cantidades, marcas y confianza de restricciones. Emite columnas de FK,
acciones referenciales, defaults, CHECK e índices con orden/filtros para revisión.
**Contar objetos no demuestra que sus definiciones sean equivalentes**: comparar
esas salidas con `01` sigue siendo requisito humano. Ya no informa permisos de
tablas mediante HAS_PERMS_BY_NAME de una sesión administrativa.

## Permisos nuevos: comprobación separada

`06_verificacion_permisos_directos_bloqueada.sql` se añadió sin reemplazar 00–05.
Está cerrado con Verificar=0, servidor/principal NULL. Exige Azure HostFlow exacto
y una identidad administrativa existente con CONTROL/VIEW DEFINITION, distinta de
hostflow_app; no pide conceder esas capacidades al backend, no impersona y no
consulta SID, hashes, cuentas o datos de negocio.

| Objeto | Concesión directa propuesta | Alcance |
| --- | --- | --- |
| PreferenciasNotificacionUsuario | SELECT, INSERT | Objeto |
| PreferenciasNotificacionUsuario | UPDATE | Solo Habilitada y FechaActualizacion |
| Notificaciones | SELECT | Objeto |
| NotificacionDestinatarios | SELECT | Objeto |
| NotificacionDestinatarios | UPDATE | Solo FechaLectura |
| PoliticasNotificacionEmpresa | Ninguna | Sin consumidor actual |

Son seis pares tabla/operación y **siete entradas de catálogo: cuatro de objeto y
tres de columna**. `02` solo devuelve cinco instrucciones GRANT como texto, nunca
las ejecuta. INSERT de eventos/destinatarios, DELETE y UPDATE global no se proponen.

`06` cruza sys.database_permissions del principal exacto con estas siete entradas
y los 48 derechos históricos congelados. G confirma; W (delegación), D, R,
faltantes y adicionales requieren revisión. CONNECT directo u otra excepción
también aparece como adicional: no se borra ni se aprueba automáticamente. El
universo completo no oculta una concesión de base/esquema/columna fuera de lo previsto.
Informa roles directos/heredados y permisos explícitos de public/roles por separado.

**Hoy los roles amplios continúan**: su membresía esperada es db_datareader=1 y
db_datawriter=1. Antes de conceder los nuevos derechos puede haber 48 confirmados
y siete faltantes aunque el acceso efectivo funcione. Después deben confirmarse
los 55 sin delegación y ninguna concesión adicional no revisada. Esto nunca prueba
ausencia de permisos efectivos sobrantes: los roles fijos no se enumeran completos
en sys.database_permissions. No retirar roles ni ejecutar los seis scripts de
mínimos históricos: esperan el universo anterior. Su actualización/retiro sigue
siendo una entrega y autorización separadas.

Las transacciones y el applock compartido de seguridad mantienen sus requisitos
existentes; no se agregan derechos de administración, EXECUTE general o cambios de
DbPrincipal. La validación del perfil restringido por columna en el motor sigue
pendiente; generar texto y leer catálogos no la sustituye.

## A — Inspección Azure, solo después de autorización de lectura

1. Sesión administrativa existente en SSMS/Portal; seleccionar HostFlow. No usar
   endpoints ni la conexión de producción para pruebas de fixtures.
2. Copiar `sql/proposals/notificaciones/00_inspeccion_solo_lectura.sql` a un editor
   privado. Completar SOLO ServidorEsperado con el nombre técnico exacto confirmado.
   Ejecutar el batch completo cuando se autorice; el original queda con NULL.
3. Esperado: motor 5, base HostFlow exacta, servidor conocido, visibilidad completa;
   padres int/unique compatibles; ningún objeto/equivalente de las cuatro tablas;
   revisar CHECK/FK, triggers/RLS y dependencias. Anotar collation real. Verificar
   PITR y ventana en Azure Portal sin iniciar restauraciones.
4. Detener ante destino/collation desconocidos, inventario incompleto, equivalentes,
   dependencias no revisadas, tipos/claves incompatibles o ausencia de recuperación
   operativa acordada. No conceder permisos al backend para realizar la inspección.

## B — Motor LOCAL descartable, autorización distinta

No reutilizar HostFlow, HostFlow_Test_Seguridad ni otras bases existentes. El destino
nuevo fijo es **HostFlow_Test_Notificaciones_V2**, motor 3/major 17, PC-Escritorio,
Windows integrado y Shared Memory. Estos valores proceden de la inspección local
histórica, no de una conexión nueva. Si cambiaron, detener y revisar las copias.

En SSMS conectar a `lpc:localhost`, autenticación Windows, inicialmente master.
Se puede comprobar la identidad con este SELECT solo cuando se autorice lectura
local; no se ejecutó en esta entrega:

```sql
SELECT SERVERPROPERTY('ServerName') AS Servidor,
 SERVERPROPERTY('MachineName') AS Equipo, SERVERPROPERTY('EngineEdition') AS Motor,
 SERVERPROPERTY('ProductMajorVersion') AS VersionMayor, DB_NAME() AS Base,
 CONNECTIONPROPERTY('net_transport') AS Transporte,
 CONNECTIONPROPERTY('auth_scheme') AS Autenticacion,
 DB_ID(N'HostFlow_Test_Notificaciones_V2') AS BasePreexistente;
```

Preparación offline de copias, desde backend (no conecta ni ejecuta SQL):

```powershell
node scripts/prepararNotificacionesLocal.js --preparar
```

Genera en `HostFlow/revision/correcciones-sql-v2/local`:

También copia byte a byte `00_crear_base_bloqueado.sql`; no lo ejecuta.

1. `01_fixture_padres_bloqueado.sql`: CrearFixture=0, dos padres mínimos, IDs 1/2
   ficticios y marcas de pertenencia. No contiene usuarios ni empresas reales.
2. `02_modelo_local_bloqueado.sql`: AplicarLocal=0, MISMO cuerpo de DDL y precondición
   de claves del Azure `01`; solo cambia el preámbulo por guardas locales estrictas.
3. `03_verificacion_local_solo_lectura.sql`: mismas comprobaciones estructurales,
   guardadas por instancia, base y marca locales.
4. `04_pruebas_motor_bloqueadas.sql`: ProbarLocal=0; un grupo positivo (cuatro
   prioridades, ocho tipos, relaciones y revisión obsoleta) y 24 grupos negativos
   (catálogos, longitudes 16/17, FK, UNIQUE, lectura y política). Todo DML se revierte.
5. `huellas.json`: huellas de Azure, cuerpo idéntico y copia local. No es un resultado
   de ejecución del motor. Regenerar obliga a revisar de nuevo las copias.

Secuencia exacta pendiente de autorización:

- Autorizar **crear y marcar** esta base nueva. En SSMS/master abrir
  `sql/proposals/notificaciones_local/00_crear_base_bloqueado.sql`; en una copia
  poner CrearYMarcar=1 y ejecutar todo el batch. La guarda rechaza transacción
  externa/implícita, instancia equivocada y base preexistente. CREATE DATABASE se
  ejecuta fuera de transacción explícita; la marca se agrega después. Si esta
  falla, la base podría existir sin marca: detenerse, no repetir/adoptar/borrar.
- Seleccionar la base nueva en SSMS. Autorizar fixture local; en copia del primer
  archivo generado poner CrearFixture=1 y ejecutar batch completo. Esperado: solo
  dos tablas mínimas, dos filas ficticias en cada una y dos marcas. Detener ante
  objetos/datos ajenos; no ampliar las guardas ni limpiar automáticamente.
- Autorizar DDL local; poner AplicarLocal=1 SOLO en la copia local. Esperado:
  cuatro tablas nuevas vacías con el inventario indicado. Nunca modificar engine,
  servidor o banderas del original Azure para esta prueba.
- Ejecutar la verificación local de lectura y revisar definiciones; después
  autorizar pruebas de motor y poner ProbarLocal=1 en copia. Esperado: 25 grupos
  aprobados y cero filas en las cuatro tablas nuevas al terminar.
- Cada grupo positivo/negativo usa rollback propio; no hay COMMIT de datos de prueba.
  identity/rowversion pueden avanzar pese al rollback. No hay DROP ni limpieza de
  objetos automática; conservar base y seis tablas para revisión. Una eliminación
  futura requiere autorización independiente y volver a acreditar propiedad e
  inventario completo. No usar los runners de Seguridad/Configuración para limpiar.

Los padres mínimos prueban compatibilidad de FK, no equivalencia del esquema real
de Usuarios/Empresas ni autenticación completa. El contraste administrativo del
paso A y las regresiones herméticas siguen siendo necesarios. No se ha probado
concurrencia entre conexiones, RLS, productores ni permisos SQL con este procedimiento.

## C — DDL Azure, solo tras A/B aprobadas

Autorizar exclusivamente creación de las cuatro tablas, sin seeds ni permisos.
Usar una copia revisada de `01_modelo_bloqueado.sql` con Aplicar=1,
InventarioRevisado=1, ServidorEsperado y CollationEsperada exactos del paso A.
Ejecutar el batch completo en sesión administrativa dedicada, autocommit, sin
transacción externa. Los originales siguen desactivados. No activar la aplicación.
Errores revierten la transacción del DDL; si el resultado del commit es incierto,
inspeccionar primero: no repetir ni borrar tablas como recuperación.

## D — Verificación independiente

Autorizar la lectura de `03_verificacion_solo_lectura.sql`, completar servidor
en copia. Comparar todas las salidas con `01`; esperado inventario 28/4/2/9/6/9/4
columnas/PK/UNIQUE/índices/FK/CHECK/defaults, cuatro marcas, FK/CHECK confiables y
sin cascadas. Detener si falta/sobra un objeto o difiere una definición. No usar
HAS_PERMS de HostFlowAdmin para dar por aprobados derechos de hostflow_app.

## E — Nuevos permisos, otra autorización

Revisar primero `06` con Verificar=1, servidor y principal hostflow_app verificados
en copia administrativa. Ver siete faltantes aquí sería normal antes del GRANT.
Revisar/actualizar separadamente el perfil mínimo y su prueba local por columna;
conservar los 48 derechos existentes y ambos roles amplios.
Autorizar después ejecutar `02` solo para generar texto con servidor/principal
correctos; revisar las cinco líneas. Su ejecución DCL requiere otra aprobación
expresa en sesión administrativa: no hay un ejecutor automático preparado.
Repetir `06` de lectura después: siete nuevos G exactos, 48 históricos conservados,
sin delegación, adicionales no aprobados ni DENY inesperados. Confirmar roles 1/1.
Detener ante discrepancias; no introducir DENY/REVOKE ni quitar roles como arreglo.

## F — Activación gradual, cada paso con autorización humana

1. Mantener autenticación SQL existente, empresa del servidor IdEmpresa=1 y
   Configuración con su modo de solo lectura actual. No modificar .env.
2. Primera lectura personal de preferencias: SQL_ENABLED=1, WRITE_ENABLED=0,
   PERSONALES_ENABLED=0 en entorno temporal iniciado por el usuario. Esperado:
   preferencias ausentes se identifican como no persistidas, PUT bloqueado.
3. Solo tras nueva autorización: WRITE_ENABLED=1, guardar preferencias de una
   cuenta de prueba desde su sesión privada, comprobar recarga, rowversion y 409.
   El guardado no crea avisos ni modifica Alertas/Reservas/Limpiezas.
4. No activar todavía PERSONALES_ENABLED. Los contratos API están preparados,
   pero productores, destinatarios, UI personal y políticas efectivas requieren
   otra etapa. No confundir tablas vacías con una función de entrega terminada.

Comando futuro de la fase inicial de lectura en **Git Bash**, desde backend;
solo lo ejecuta el usuario cuando A–E y la activación estén autorizadas:

```bash
HOSTFLOW_AUTH_SOURCE=sql HOSTFLOW_EMPRESA_ID=1 HOSTFLOW_CONFIGURACION_ENABLED=1 HOSTFLOW_CONFIGURACION_READ_ONLY=1 HOSTFLOW_NOTIFICACIONES_SQL_ENABLED=1 HOSTFLOW_NOTIFICACIONES_WRITE_ENABLED=0 HOSTFLOW_NOTIFICACIONES_PERSONALES_ENABLED=0 npm run dev
```

No se ejecutó ese comando. En otra terminal frontend se inicia manualmente con
`npm run dev`. No son cambios de .env ni configuración permanente.

En cada paso detener ante 401/403 inesperados, 503 de modelo/permisos, contrato
incompleto o conflicto sin resolución. Reponer temporalmente las banderas nuevas
en 0 con el usuario, sin borrar tablas/filas ni cambiar credenciales. Seguir la
recuperación no destructiva de `04_recuperacion_y_desactivacion.md`.

## Límites de aislamiento

Sigue una sola organización por instalación. Usuarios no tiene membresía de
empresa; preferencias son globales a la cuenta. FK de destinatario a usuario y
evento no demuestra que pertenezcan a la misma empresa: el productor futuro debe
validarlo. El backend usa IdEmpresa del servidor y IdUsuario autenticado, con
filtros de empresa/usuario/tipo y revalidación de sesión/rowversion en transacción.
No existe RLS ni una identidad SQL por usuario final: hostflow_app comparte sus
derechos, y conservar roles amplios mantiene el exceso conocido. El DDL por sí
solo no habilita multiempresa ni protege filas frente a una consulta SQL arbitraria.

`05` es diagnóstico técnico de Alertas y NO forma parte de esta secuencia de DDL:
lee conteos/IDs/estados/fechas reales, no solo metadatos, y requiere autorización
de lectura separada. Ningún script de esta carpeta se ejecuta al iniciar o testear
HostFlow. Nunca ejecutar toda una carpeta de propuestas como un único lote.
