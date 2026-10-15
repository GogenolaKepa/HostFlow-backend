# Auditoría de permisos SQL del backend

> Auditoría histórica: el usuario confirmó después las 48 concesiones específicas, conservando los dos roles amplios. Ver [estado vigente](estado-publicacion.md). NO repetir concesiones ni retirar roles por seguir el plan histórico de este archivo.

Estado: propuesta local preparada, SIN cambios de permisos ni conexiones a Azure.
No es todavía aprobación para retirar roles. La matriz del código está cerrada;
faltan metadatos del destino y pruebas del motor con una identidad restringida.

El usuario confirmó que hostflow_app pertenece a db_datareader/db_datawriter y que
Configuración C/D terminó: Empresas y PreferenciasOperativas existen, IdEmpresa=1,
horas 15:00/10:00, Buenos Aires. No se repitió ninguna migración ni vinculación.
No se habilitó Configuración. No se alteraron los cambios pendientes anteriores.
Esta información se toma de la comprobación del usuario, no de consultas nuevas.

## Alcance y evidencia

[Matriz completa](matriz-permisos-backend.md): 19 tablas, 48 permisos por objeto,
308 referencias con archivo/línea/método, 118 llamadas SQL y 104 rutas (99 del
catálogo de negocio más 5 de autenticación). Se revisaron los 111 archivos src,
los repositorios y sus consumidores, las transacciones y las ramas de SQL dinámico
cerradas. No existe SQL en controladores; fuera de repositorios solo AuthService
consulta metadatos de preparación. Se revisaron también CLI y propuestas SQL,
que no se confunden con permisos de ejecución ordinaria de HostFlow.

El [manifiesto](../sql/proposals/permisos_minimos/modelo-permisos.json) contiene la
matriz, evidencias, rutas, huellas del código y de los seis scripts. El generador
es OFFLINE (fs/crypto y catálogo puro de rutas); no importa dotenv, app ni drivers.
No cambia src, package.json, configuraciones o autenticación. Regenerar propuestas
exige volver a revisar sus diferencias y huellas; no es una aprobación de ejecución.

La extracción estática se complementó con revisión de alias UPDATE pc/pic/tarea,
DELETE pic y UPDATE parametrizado interno de Configuración. No es un analizador
completo de T-SQL ni demuestra por sí sola los permisos efectivos de Azure.

## Matriz funcional por módulo

En TODA ruta protegida con JWT SQL se leen Usuarios y Roles para verificar cuenta,
rol activo y VersionSesion. Los permisos siguientes son adicionales a esa base.
S/I/U/D significan SELECT/INSERT/UPDATE/DELETE. La matriz por objeto es la fuente
exacta de permisos; las filas siguientes explican efectos cruzados y flujos.

| Módulo / flujo | Operaciones requeridas y tablas |
| --- | --- |
| Login y restauración | S Usuarios/Roles; bcrypt/JWT no escriben SQL. Login no actualiza un último acceso. |
| Usuarios y Mi cuenta | S/I/U Usuarios y S Roles; edición propia, contraseña, reset, estado y logout/revocación usan U; nunca D Usuarios ni escritura de Roles. |
| Último Administrador | S Usuarios/Roles, U Usuarios y applock transaccional; no DDL ni administración de roles SQL. |
| Propiedades | S/I/U Propiedades; S EstadosPropiedad, EstadosReserva, Reservas, Huespedes y PropiedadImagenes para estado/ocupación/listados. Detalle lee PropiedadCanales/CanalesReserva. Edición puede sincronizar canales y requerir I/U PropiedadCanales. |
| Huéspedes | S/I/U Huespedes; S Reservas/EstadosReserva para situación e historial. |
| Reservas manuales/canales | S/I/U Reservas; S Propiedades/Huespedes/EstadosPropiedad/EstadosReserva/CanalesReserva; I Huespedes al recibir un huésped externo. Cancelar cambia estado, no hace DELETE. |
| Timeline de reserva | S/I ReservaEventos; S Reservas y sus joins al comprobar contexto; los eventos no requieren U/D. |
| Mensajes | S/I/U ReservaMensajes y consulta del contexto de reserva; pueden registrar eventos por ReservaService. |
| Incidencias | S/I/U ReservaIncidencias y consulta de reserva; cambios/resolución pueden registrar eventos. |
| Observaciones | S/I/U/D ReservaObservaciones y S del contexto de reserva. API conserva restricción de editar/eliminar al Administrador. |
| Calendario (API) | S Propiedades, EstadosPropiedad, Reservas, EstadosReserva, CanalesReserva, Huespedes. El frontend consulta también Limpiezas, cuyo GET escribe. |
| Limpiezas | S Reservas, EstadosReserva, CanalesReserva, Propiedades, Huespedes, TareasLimpieza; I/U TareasLimpieza por sincronización y estado. La tabla variable @Candidatas no requiere CREATE TABLE de usuario. |
| Alertas | S ReservaIncidencias, Reservas, EstadosReserva, CanalesReserva, Propiedades, Huespedes, PropiedadCanales y Alertas; I/U Alertas para upsert, lectura/resolución y resolución automática. |
| Dashboard/Inicio | S Propiedades, EstadosPropiedad, Reservas, EstadosReserva, CanalesReserva, Huespedes; Alertas se consulta ya persistida, sin sincronizar. No DML desde sus GET actuales. |
| Reportes/históricos | S de las tablas de Dashboard; no I/U/D; autorización y filtro económico siguen en API. |
| FlowIA | S de RecomendacionRepository/DashboardRepository y flujo de Limpiezas; I/U TareasLimpieza al consultar recomendaciones. IA generativa no agrega tablas ni permisos SQL. |
| Publicación/sincronización de propiedades | S/I/U PropiedadCanales, S Propiedades/CanalesReserva; inbound aplica U Propiedades según la operación existente. |
| Imágenes | S/I/U PropiedadImagenes; S contexto Propiedades/canales. El DELETE HTTP de imagen hace baja lógica y sincroniza; no necesita D PropiedadImagenes. Principal/orden/restauración hacen UPDATE; principal usa transacción. |
| Imágenes por canal | S/I/U/D PropiedadImagenCanales y S CanalesReserva, junto con el flujo de imágenes. Se borra físicamente el vínculo después de la confirmación de eliminación o si no tiene ID externo. |
| Integraciones simuladas | Colas/eventos/solicitudes Airbnb/Booking están en memoria, no existen tablas SQL adicionales de estos proveedores en el código. Encolar/listar no persiste negocio; procesar confirma cambios vía repositorios anteriores, con sus mismos permisos. |
| Configuración | S/U Empresas y PreferenciasOperativas. GET predeterminados solo S de las dos tablas, sin devolver identidad empresarial al Operador. I inicial es administrativo y no pertenece al runtime. Revalidar editor lee Usuarios/Roles y usa applock. |

## GET con escrituras: no usarlos como smoke test de Azure

| Ruta GET (prefijo /api) | Efecto persistente |
| --- | --- |
| /reservas | Finalización de vencidas: U Reservas + I ReservaEventos cuando corresponde. |
| /reservas/:id | Mismo proceso; puede finalizar OTRAS reservas además del ID consultado. |
| /limpiezas y /limpiezas/resumen | Sincronizan I/U TareasLimpieza antes de leer. |
| /alertas y /alertas/resumen | Sincronizan I/U Alertas y resuelven automáticamente condiciones terminadas. |
| /recomendaciones | Consulta LimpiezaService.obtenerLimpiezas y ejecuta su sincronización I/U. |

HEAD reutiliza GET, con sus efectos. Las subrutas GET /reservas/:id/eventos,
/mensajes, /incidencias y /observaciones usan obtenerPorId del repositorio y no
finalizarReservasVencidas del servicio: no atribuirles esa escritura por prefijo.
GET Dashboard, reportes, perfil, usuarios, catálogos, propiedades, huéspedes y
Configuración no tienen DML en sus handlers actuales. La navegación de Calendario
puede pedir /limpiezas desde el frontend aunque /api/calendario sea solo lectura.
OPTIONS pasa por CORS antes de autenticación; no necesita permisos SQL.

## Transacciones, metadatos y applock

Los repositorios de Usuarios y Configuración usan el mismo recurso
HostFlow:Seguridad:AdministradoresActivos, LockMode=Exclusive,
LockOwner=Transaction, DbPrincipal=public. El principal ya es miembro implícito de
public; no necesita db_owner ni cambiar DbPrincipal. Se requiere poder ejecutar
sys.sp_getapplock, y se verifica con HAS_PERMS_BY_NAME y una prueba local real
preparada. No se concede EXECUTE general ni se agrega un GRANT redundante al
procedimiento: esos roles de datos no son la fuente de su ejecución.
La documentación de [sp_getapplock](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-getapplock-transact-sql)
describe public y que Transaction exige una transacción activa. Commit/rollback
liberan el bloqueo; los errores negativos se gestionan con rollback.

BEGIN/COMMIT/ROLLBACK no necesitan un GRANT de administración: se autorizan las
operaciones contenidas. HOLDLOCK/UPDLOCK no requieren db_owner; Usuarios ya tiene
U además de S y Roles usa HOLDLOCK con S. OUTPUT INSERTED/DELETED y predicados
quedan cubiertos por S, además del permiso de escritura. Variables de tabla,
SCOPE_IDENTITY, funciones de fecha y metadatos no justifican DDL global, REFERENCES
de runtime ni VIEW DEFINITION general. La inspección administrativa sí necesita
visibilidad completa. Los derechos SELECT/UPDATE de las tablas nuevas permiten
su visibilidad de metadatos y comprobación de las marcas del modelo.

CLI bootstrap solo usa derechos de Usuarios/Roles/applock ya incluidos; NO debe
repetirse. Migraciones, vinculación y preparación local son operaciones separadas
de administradores; nunca añadir CREATE TABLE/ALTER/CREATE USER al runtime para
que esos scripts funcionen. No se modificaron esos CLI ni los runners anteriores.

## Riesgos que faltan comprobar en el destino

db_datareader permite leer todas las tablas/vistas de usuario y db_datawriter
modificar/insertar/borrar en todas las tablas de usuario, también nuevas. No basta
buscar GRANT directos: los derechos de roles fijos no se enumeran todos en
sys.database_permissions ([Microsoft: roles de base](https://learn.microsoft.com/en-us/sql/relational-databases/security/authentication-access/database-level-roles)).

- Obtener snapshot de ID y SID de hostflow_app, membresías DIRECTAS y heredadas,
  derechos de public, GRANT/DENY de base/esquema/objeto/columna, delegación y propiedad.
  No cambiar identidades ni credenciales. Los SID son identificadores de seguridad,
  no contraseñas; los resultados privados no deben publicarse en Git.
- Triggers, RLS, enmascaramiento, columnas calculadas, funciones, sinónimos y dependencias entre
  objetos pueden exigir revisión adicional. Un trigger con contexto distinto,
  SQL dinámico, dependencia entre bases o definición no visible impide dar por
  cerrada la matriz solo desde JavaScript. Inspección 00 no devuelve cuerpos de
  módulos, passwords/hashes o filas; definición oculta requiere revisión privada.
- Los 48 permisos son mínimos POR OBJETO para este backend. No son permisos por
  columna/fila. Un fallo de autorización de Express o inyección seguiría siendo
  sensible, sobre todo en Usuarios. Se conservan SQL parametrizado, JWT, roles,
  filtros económicos y validación; no se implementa autenticación SQL por usuario final.
- No retirar roles antes de conceder y verificar: podría fallar el login y quedar
  sin acceso al panel. Eventos de reserva se registran con tolerancia a fallos:
  un 200 HTTP no demuestra que el timeline se haya escrito. Probar las filas de
  auditoría y los vínculos, no solo el status, en fixtures locales.
- Capturar posibles tablas no utilizadas por este checkout. La inspección no debe
  conceder permisos a todas para evitar decidir; la nueva aplicación no necesita
  derechos por herencia sobre tablas futuras o ajenas.

## Scripts preparados, no ejecutados

Carpeta: sql/proposals/permisos_minimos. Nunca ejecutar toda la carpeta en lote.

| Script | Uso y límites |
| --- | --- |
| 00_inspeccion_administrativa_solo_lectura.sql | Solo SELECT/CTE de metadatos. No efectos persistentes, sin leer datos de negocio. Aún requiere autorización de lectura. |
| 01_conceder_minimos_bloqueado.sql | 19 GRANT por objeto para 48 permisos, transaccional. No retira roles ni escribe filas. Conceder=0, InspeccionAprobada=0. |
| 02_verificar_concesiones_solo_lectura.sql | Comprobar concesiones directas G, sin delegación, membresías y DENY. Usa una variable de tabla local para la matriz; no escribe tablas persistentes. No prueba el perfil final con los roles amplios activos. |
| 03_retirar_roles_bloqueado.sql | Exige 48 GRANT directos, exactamente las dos membresías conocidas, ausencia de DENY relevante y propiedad revisada. RetirarRoles=0, pruebas/ventana=0. Retira ambos roles en UNA transacción, impersona al principal y comprueba el universo de tablas capturado antes como admin, exceso DDL/base/esquema y CONNECT/applock. Hace REVERT y rollback si algo no coincide. |
| 04_recuperacion_roles_bloqueada.sql | Solo recuperación excepcional autorizada: restaura las dos membresías previamente acreditadas; no revoca GRANT nuevos ni modifica datos. RecuperarRoles=0 y SnapshotPrevioConfirmado=0. Reintroduce exceso temporal, no es solución final. |
| 05_verificacion_conexion_backend_solo_lectura.sql | Solo funciones de identidad, roles y permisos. Ejecutar con conexión nueva REAL del backend; como admin no sirve. Verifica 48 permisos y negativos clave, sin endpoints o filas. |

Todos los scripts de DCL exigen servidor EXACTO (binario/longitud), HostFlow y
EngineEdition=5, PrincipalIdEsperado y SidEsperado confirmados, identidad
administrativa existente distinta de hostflow_app con CONTROL DATABASE y sesión
dedicada autocommit. Destino/ID/SID siguen NULL. No se pide dar CONTROL al backend.
No existe SQL dinámico ni nombres de objetos tomados del cliente. El retiro se
detiene ante membresías inesperadas; no intenta corregir permisos adicionales,
propiedades, DENY o public automáticamente.

La comprobación transaccional usa EXECUTE AS USER y REVERT para evaluar la identidad
correcta, no los derechos de la sesión administrativa
([Microsoft: EXECUTE AS](https://learn.microsoft.com/en-us/sql/t-sql/statements/execute-as-transact-sql)).
No cubre la autenticación de la conexión/login; por eso el paso 05 con conexión
real nueva también es obligatorio. Conservar una sesión administrativa independiente.

## Pruebas preparadas y resultados

Ejecutado en esta tanda: seis pruebas herméticas nuevas. Comparan la matriz con
las consultas fuente y huellas, prueban los bloqueos administrativos, simulan la
política mínima y capturan consultas generadas por repositorios reales de
finalización, limpiezas, borrado de observación/vínculo, baja lógica de imagen y
Configuración. Al quitar un permiso esencial, las operaciones capturadas fallan.
No hay SQL, GRANT, ALTER ROLE, drivers conectados ni datos persistidos en esas pruebas.

La suite completa backend incorpora estas seis (139 en total). La validación
real del motor con el perfil restringido NO se da por aprobada. No se ejecutaron
los seis tests SQL de Configuración otra vez ni sus escrituras de fixtures.

Prueba SQL futura: tests/integration/sql-permisos-minimos.test.js, deshabilitada
por defecto. Solo podría conectarse a la instancia local Windows ya identificada,
Shared Memory y HostFlow_Test_Permisos con marca hostflow-permissions-disposable-v1.
No lee .env, no admite passwords SQL, no crea ni limpia objetos, no concede permisos.
Exige 19 tablas exactas y un principal de pruebas ya preparado, sin roles amplios.
Comprueba 76 combinaciones S/I/U/D (48 permitidas, 28 prohibidas), negativos de DDL
y un applock público en transacción propia que revierte. No llama módulos operativos.

No existe todavía autorización para crear esa base/principal o concederle permisos.
No ampliar ni reutilizar el borrado del runner HostFlow_Test_Seguridad: este sigue
limitado a sus dos/cuatro tablas. El plan detallado de regresión SQL REAL está en
[plan-pruebas-permisos-sql.md](plan-pruebas-permisos-sql.md). Requiere un esquema
local fiel a los metadatos revisados, datos exclusivamente ficticios y autorización
específica de preparación local. No prometer cobertura funcional por comprobar
HAS_PERMS_BY_NAME solamente: después debe ejecutarse cada flujo con esos fixtures.

## Transición exacta, con autorizaciones separadas

1. Autorizar únicamente 00 en una conexión administrativa existente al destino
   HostFlow. Guardar snapshot privado de permisos/membresías, servidor, ID/SID y
   dependencias. No ejecutarlo con hostflow_app esperando inventario completo.
   Confirmar PITR/ventana de recuperación desde Azure Portal sin restaurar.
2. Resolver discrepancias (DENY, herencias, propiedad, triggers/RLS/dependencias).
   Revisar matriz, código congelado y seis SQL, con las huellas del manifiesto.
   Si aparece otro consumidor autorizado de hostflow_app, incluirlo en la auditoría
   antes de aplicar el perfil: este informe cubre el backend de este workspace.
3. Autorizar por separado preparación de fixture/principal LOCAL y concesiones
   de prueba. Ejecutar el test de perfil del motor y regresión funcional local del
   plan, con ambos roles de aplicación, sin Azure. Guardar resultados no sensibles.
4. Autorizar SOLO concesiones aditivas 01 en Azure. Usar copia revisada con
   Conceder/InspeccionAprobada=1 y servidor/ID/SID privados verificados. Original
   permanece bloqueado. Ejecutar batch completo; fallo revierte sus GRANT. Los
   roles amplios continúan, así que no debería perderse acceso por este paso.
5. Autorizar/verificar 02 y 05. Las 48 concesiones directas deben estar en estado G,
   no WITH GRANT OPTION. Login actual sigue funcionando, pero eso aún no demuestra
   el perfil sin roles. No activar Configuración ni probar GET mutantes en Azure.
6. Autorizar por separado la ventana y 03. El usuario controla el apagado/reinicio
   de sus servicios; no atender tráfico durante el cambio. Mantener admin independiente.
   Completar flags de pruebas/ventana aprobadas y destino/ID/SID en copia revisada.
   Ejecutar batch completo sin transacción externa. Retira SOLO db_datareader y
   db_datawriter directos y verifica antes de commit. Cualquier mismatch revierte
   ambas bajas automáticamente. Si la salida de commit es incierta, inspeccionar
   membresías/permisos antes de repetir; no ejecutar 04 por reflejo.
7. Autorizar 05 con conexión NUEVA del backend: principal/destino correctos, roles
   amplios=0, 48 derechos=1, negativos=0, CONNECT/EXECUTE applock=1. No endpoints de
   negocio. Después autorizar un login privado y GET seguros (Mi cuenta/Usuarios,
   metadatos), conservando Administrador/Operador. Los flujos mutantes se acreditan
   localmente; cualquier prueba operacional Azure necesita autorización aparte.
8. Si hay un defecto después de commit, detener tráfico y diagnosticar primero.
   Autorizar 04 SOLO si es necesario restablecer el perfil previo. Confirmar el
   snapshot de ambas membresías y mismo ID/SID/servidor; no restaurar contraseñas,
   datos, reservas o esquemas. Reiniciar conexión y verificar con 05. Resolver el
   defecto y programar un nuevo retiro; no dejar roles amplios como estado final.
9. La activación temporal de Configuración sigue siendo otra autorización posterior.
   C/D ya completadas NO se vuelven a ejecutar. No cambiar .env ni flags por esta auditoría.

No se requiere REVOKE/DENY de tablas como sustituto del retiro de roles: podría
anular operaciones legítimas. Tampoco se modifica public ni roles SQL existentes
de forma general. No hay commits, push, deploy o cambios en frontend en esta tanda.
