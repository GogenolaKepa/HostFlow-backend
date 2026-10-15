# Plan de integración SQL LOCAL con privilegios mínimos

Estado: PREPARADO, sin ejecución de DCL ni SQL en esta tanda. No confundir las
pruebas herméticas con una certificación del motor SQL o de Azure.

## 1. Condiciones antes de preparar fixtures

- Revisión y autorización separadas para crear/aprovisionar el entorno LOCAL.
  Ningún script de este bloque crea bases ni copia filas. La base propuesta es
  HostFlow_Test_Permisos; NO HostFlow ni Azure, NO master, NO ampliar los runners
  existentes de seguridad/configuración ni su limpieza de dos/cuatro tablas.
- Instancia local identificada: PC-Escritorio, instancia por defecto, SQL Server
  17.x Enterprise Evaluation, Windows integrado por Shared Memory (lpc:localhost).
  El cifrado local usa el mismo ODBC 18 del entorno aislado; no modifica el driver
  ni TLS de Azure. La excepción trustServerCertificate local no se traslada al backend.
- Esquema de las 19 tablas fiel al inventario administrativo y DDL revisados,
  incluidos FK/CHECK/defaults/índices/triggers relevantes. El código no incluye
  todas las migraciones históricas de negocio: no inventar un esquema reducido
  que haga pasar los tests pero no represente HostFlow. Ese DDL todavía requiere
  preparación/revisión a partir de metadatos autorizados, sin extraer datos reales.
- Marca de base HostFlowTestIsolation=hostflow-permissions-disposable-v1. Fixtures
  marcados por runId/propiedad de tabla; todos los datos deben ser ficticios.
- Principal de pruebas hostflow_test_app_minimo WITHOUT LOGIN, inicialmente nuevo,
  sin roles amplios, sin ownership ni DDL; los 48 GRANT del perfil en sus 19 tablas
  se aplican administrativamente SOLO después de autorización local de DCL.
  No usar hostflow_app real ni sus credenciales; impersonación desde Windows local.
- La creación/limpieza de esquema, principal y permisos necesita un batch local
  específico revisado. Nunca desactivar las guardas Azure de 01/03 para reutilizarlos
  en local. No hay limpieza automática de esta nueva base/principal en el runner.

## 2. Prueba preparada de permisos y bloqueos (sin filas)

Archivo: tests/integration/sql-permisos-minimos.test.js. Sin bandera se omite y no
importa un driver conectado. Una vez que exista autorización y entorno preparado,
el comando exacto desde backend en Git Bash es:

```bash
HOSTFLOW_SQL_MINIMOS_TEST_ENABLED=1 HOSTFLOW_SQL_MINIMOS_READ_APPROVED=YES_LOCAL_METADATA_AND_LOCK node --test tests/integration/sql-permisos-minimos.test.js
```

El destino está fijo en código; no se toma de .env ni de parámetros de Azure. Se
comprueban máquina, instancia, motor, versión/edición, Windows, transporte, marca
y exactamente 19 tablas. Antes del batch de impersonación se repiten las guardas.
Si algo no coincide, no ejecutar otra consulta para intentar saltar la protección.

La prueba no crea objetos ni hace GRANT/REVOKE/DENY/ALTER ROLE. Con el principal ya
preparado comprueba 76 combinaciones DML (48 deben permitir, 28 deben rechazar),
ausencia de roles amplios, prohibición de crear tablas y un sp_getapplock público
en transacción con ROLLBACK. No lee filas de negocio. No demuestra por sí sola
que los flujos funcionales o las restricciones de datos estén bien.

## 3. Regresión funcional que debe ejecutarse después, con los fixtures

Cada escenario se ejecuta mediante servicios/API locales configurados por inyección
de conexión al fixture, NUNCA cargando database.js/.env real. No arrancar servicios
permanentes desde el agente; usar servidor efímero ligado a 127.0.0.1 y cerrarlo.
No apuntar pruebas de interfaz a Azure para reemplazar esta integración.

| Escenario | Verificaciones sobre datos ficticios |
| --- | --- |
| Login/GET me | Usuario/rol activo, bcrypt, firma, JWT revocado, rol no asignable y 401; ninguna escritura de login. |
| Administración y Mi cuenta | Crear/editar/cambiar rol/estado, reset, cambio propio, revocación, rowversion, cambio obligatorio; sin DELETE Usuarios. |
| Último Administrador | Dos operaciones concurrentes sobre fixtures; queda al menos un Admin activo. Denegar applock en simulación produce rollback, nunca continuación sin protección. |
| Propiedades | Alta/edición/baja por estado; consulta con imágenes y ocupación; catálogos no se escriben. |
| Huéspedes | Alta/edición, duplicados, historial; no borrado físico. |
| Reservas | Alta manual, cambios/cancelación y conflictos; catálogos solo lectura. Conservar reglas de canal, estado y horarios. |
| GET Reservas | Vencida Confirmada pasa a Finalizada una vez; evento persistido, sin duplicados; GET por ID puede finalizar otra vencida. |
| Timeline/mensajes/incidencias | Evento/anotación/mensaje esperado realmente insertado; actualizar/resolver permitido; no ocultar fallo por un 200 tolerante del servicio. |
| Observaciones | Admin puede eliminar fixture; Operador recibe 403 antes de repositorio. No eliminar notas ajenas al fixture. |
| Limpiezas | GET y resumen insertan/actualizan tareas y resuelven su estado; idem al repetir, sin ampliar horizonte/reglas. |
| Alertas | GET/resumen detectan, crean/actualizan y resuelven condiciones terminadas; sin DELETE. |
| Dashboard/reportes/calendario | Lecturas del motor con sus joins; snapshot antes/después demuestra ausencia de DML del endpoint. El GET adicional de Limpiezas de la pantalla Calendario se prueba por separado. |
| FlowIA | Limpiezas sincroniza; recomendaciones comerciales/economía solo para Admin, proyección anidada para Operador; IA externa simulada, sin red. |
| Canales Airbnb/Booking | Encolar/listar es memoria; procesar alta/cambio/cancelación persiste por repositorios, crea huésped externo si corresponde y registra eventos. |
| Propiedad/canal e imágenes | Publicar/sincronizar/error/confirmación; baja lógica de imagen y selección principal transaccional; D solo sobre PropiedadImagenCanales cuando corresponde, jamás D PropiedadImagenes. |
| Configuración | Leer/editar empresa/horarios, predeterminados del Operador sin datos empresariales, bloqueo obligatorio/revocado, rowversion/409/rollback; I Empresas/Preferencias denegado. |
| Negativos del proceso SQL | Escrituras en Roles/CanalesReserva/Estados*, D Usuarios/Reservas/Propiedades, I Empresas/Preferencias, DDL y permisos sobre tablas no incluidas deben fallar (error SQL de permisos). |
| Fallos parciales | Registrar errores de permisos en eventos/canales y hacer fallar el test aunque la operación principal retorne 200; no declarar regresión aprobada con escrituras secundarias omitidas. |

Las acciones concurrentes y secuencias con colas en memoria deben reiniciarse entre
casos. Los datos iniciales de roles/catálogos provienen de fixtures ficticios que
mantienen los nombres de dominio, nunca de filas extraídas de Azure. No usar IDs
reales de reservas/propiedades/cuentas como atajo.

## 4. Limpieza y cierre

El test de permisos/lock no cambia filas ni crea objetos, y libera conexión y
bloqueo al terminar. Para futuros tests funcionales, limpiar SOLO fixtures cuyo
runId/object_id/propiedad estén acreditados. Si falta evidencia, detener limpieza;
no añadir tablas al DROP del runner anterior ni borrar usuarios operativos.
Una limpieza de la base/principal de pruebas requiere otra autorización y script
específico revisado. No se proporciona DROP DATABASE ni borrado global automático.

Registrar permisos positivos/negativos y resultados por escenario, sin passwords,
hashes, tokens ni filas privadas. Solo tras esa regresión y la inspección Azure
puede marcarse PruebasLocalesAprobadas=1 en una copia autorizada del retiro de roles.
