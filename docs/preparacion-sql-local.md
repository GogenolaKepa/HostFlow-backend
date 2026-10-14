# Preparacion local SQL Server: tanda del 14/10/2026

Estado actualizado: con autorizacion expresa se creo y marco la base LOCAL
HostFlow_Test_Seguridad y se completo el ciclo real de fixtures/migracion/pruebas/
limpieza. Suite final: 17 aprobadas, repetida satisfactoriamente; base conservada,
sin tablas residuales. Ver tanda-sql-resultados.md para ejecuciones y correcciones.
Azure, bootstrap CLI real, permisos/protocolos, .env, commits/push/deploy intactos.
Este documento conserva el procedimiento; no autoriza nuevas escrituras.

## Estado y dependencia

Repositorios limpios al iniciar, main, backend b70111fee692e4ef863f9febb8abe5d42208cd7b
y frontend 2013b1a5e839a2e0432ced74a4876fe849c3a308. No habia cambios que preservar.
Node 24.18.0, npm 11.16.0, mssql 12.7.5, Tedious 20.0.0, bcryptjs 2.4.3.

Se agrego msnodesqlv8 **5.6.0**, version exacta, exclusivamente devDependency,
del registro oficial npm y proyecto TimelordUK/node-sqlserver-v8, Apache-2.0.
Lockfile conserva integridad y versiones exactas. Transitivas nuevas:
node-addon-api 8.9.2 y node-gyp-build 4.8.4. Durante la ejecucion real se actualizo
solo mssql 12.7.2 a 12.7.5 para corregir perdida de errores en el adaptador nativo,
con --ignore-scripts. No se instalaron herramientas globales o servicios.

El paquete requiere Node >=18 y contiene binario N-API win32-x64. Cargo en el
Node actual. npm informo instalador node-gyp-build pendiente de allow-scripts;
NO se aprobaron/desactivaron esos controles, no se compilo ni se forzo instalacion:
el prebuild incluido funciona sin ejecutar ese instalador. En otra plataforma
debe comprobarse disponibilidad del prebuild, sin forzar ni cambiar politica.

Fuentes: [driver](https://github.com/TimelordUK/node-sqlserver-v8),
[node-mssql](https://github.com/tediousjs/node-mssql#msnodesqlv8),
[Shared Memory](https://learn.microsoft.com/en-us/sql/tools/sqlcmd/sqlcmd-connect-database-engine?view=sql-server-ver17).

## Cambios y auditoria

- Usuarios y Roles ahora usan el driver inyectado tambien para tipos de parametros
  y Request, no solo Transaction. Por defecto siguen con mssql/Tedious, sin cambios
  en config/database.js. No se importa msnodesqlv8 desde src. Pool y driver se
  inyectan explicitamente en el runner, sin cambio global de exports.
- Pruebas de Request rechazan tipos de otro driver. Transacciones y bloqueo del
  ultimo Administrador conservan su protocolo y reglas.
- Test de navegador frontend usa un contrato JSON versionado, con commit de origen
  y huella SHA-256. npm test compara contra catalogo real cuando estan los dos
  checkouts. Si falta backend, esa comparacion se informa OMITIDA con motivo; no
  se declara validada. El browser nunca requiere una carpeta backend.
- Un cambio del catalogo hace fallar la comparacion: revisar/actualizar expresamente
  contrato y referencia, sin descarga ni actualizacion silenciosa. Antes de publicar
  cambios de permisos, ejecutar ambos checkouts y esta comparacion. La UI productiva
  sigue consumiendo permisos del servidor, no del fixture.
- Dashboard conserva datos previos ante fallo de actualizacion, muestra advertencia
  de ultima carga correcta y permite reintentar. Al recuperar, desaparece el aviso.
- Respuestas 5xx de codigos de seguridad permitidos podian conservar extras/mensajes
  arbitrarios: ahora devuelven DTO cerrado de codigo/mensaje controlados. Errores con
  credenciales dentro de URLs tambien se protegen. Sin modificar errores de negocio.
- Limitador mantiene todos los intentos por IP, incluidos exitosos. IP compartida/NAT
  comparte cuota; trust proxy sigue false. Cada instancia/reinicio tiene su propio
  mapa. Revisar proxy confiable, cuotas y limite en gateway/compartido antes de
  desplegar varias instancias. No se agrego infraestructura distribuida.
- Se conservaron restauracion ante 503, proteccion de respuestas tardias, revocacion,
  filtros economicos y FlowIA operativo. Mocks siguen siendo default de desarrollo;
  no se habilito SQL, autenticacion dual ni escrituras operativas.

## Resultado confirmado de solo lectura

`npm.cmd run test:sql:check` abre exclusivamente **master**, Windows integrado,
ODBC 18 y **lpc:localhost**, ejecuta dos SELECT de metadatos y cierra el pool.
No carga .env, config/database, servicios operativos ni fixture. Su CLI exige
--read-only; no acepta destinos ni operaciones alternativos.

Conexion nativa confirmada: PC-Escritorio, instancia predeterminada (NULL), SQL
Server 2025 Enterprise Evaluation (64-bit), version 17.0.1000.7, EngineEdition 3,
solo Windows 1, Shared memory, NTLM. Collation master Modern_Spanish_CI_AS.
Identidad actual sysadmin/CREATE ANY DATABASE: 1. La comprobacion inicial encontro
la base ausente; ahora existe con collation y marca previstas, vacia tras limpieza.
Certificado autofirmado aceptado exclusivamente para este destino local fijo.
No se extrapola esta lectura a DDL/DML, transacciones o permisos de Azure.

## Guardas y ciclo de pruebas

Destino fijo HostFlow_Test_Seguridad, equipo/ServerName PC-Escritorio, instancia
predeterminada, edicion confirmada, motor 3/major 17, Windows y Shared Memory.
Si cambia la instalacion, revisar estas expectativas antes de usar el runner.
Se exige collation SQL_Latin1_General_CP1_CI_AS y marca HostFlowTestIsolation con
valor hostflow-security-disposable-v1. No se acepta Azure por tunel, otras bases,
TCP, SQL Authentication, objetos inesperados ni tablas preexistentes.

Cada Request query/batch protegido antepone las guardas **en el mismo comando y
conexion fisica** que la operacion, incluidos Request dentro de Transaction.
Las lecturas de preflight son adicionales, no prueba suficiente de aislamiento.
No se admiten cambios de contexto, referencias a otras bases, SQL dinamico,
execute/bulk/PreparedStatement ni procedimientos arbitrarios. Solo se admiten las
llamadas internas a sp_getapplock y sp_addextendedproperty. Opciones SET de indice calculado
se aplican al mismo comando de las pruebas autorizadas, no al comprobador readonly.
No se activan flags de escritura al cargar modulos ni al iniciar HostFlow.

Cada ejecucion tiene UUIDv4. Roles y Usuarios reciben propiedad de tabla
HostFlowTestRun con ese UUID **dentro de su propia transaccion de creacion, antes
del COMMIT**. Roles incluye los tres roles ficticios; Usuarios usa copia de la
migracion original en memoria, con guardas originales conservadas en el archivo.
Ningun usuario o dato real se importa. Ambas fases de DDL tienen rollback.

La limpieza inspecciona pertenencia y no depende de flags 'creada'. Puede limpiar
tablas marcadas incluso si se perdio la respuesta de un COMMIT. Revalida en una
transaccion, elimina Usuarios y luego Roles, conservando base/marca. Ante tabla
sin marca, propietario distinto, objeto ajeno o limpieza fallida: detiene, conserva
residuos y exige inspeccion/aprobacion manual. Otra ejecucion no adopta tablas de
un run anterior. No hay limpieza general ni DROP DATABASE.

Estos controles evitan errores de destino; no son una barrera contra un sysadmin
que modifique objetos/marcas deliberadamente. Mantener la base de uso EXCLUSIVO,
sin procesos externos o runners simultaneos. Fallo de red con resultado incierto:
inspeccionar antes de reintentar, no borrar ni reemplazar objetos supuestos.

## Procedimiento exacto y estado de ejecucion

Creacion, marcado y ciclo de prueba ya ejecutados con aprobacion. No repetir
creacion ni marcado: abortan ante base/propiedad existentes. Repetir pruebas
requiere base inspeccionada vacia y autorizacion de esa ejecucion. Limpieza manual
NO se ejecuto ni esta autorizada por la ultima consigna.

Desde backend, sin modificar .env ni HOSTFLOW_AUTH_SOURCE:

1. Revisar y aprobar `tests/integration/01_crear_base_local.sql`. El flag en el
   archivo permanece 0; el comando habilita solamente una copia en memoria cuando
   recibe --write-authorized. Crear usa master y aborta si la base ya existe:

   ```powershell
   node scripts/prepararSQLLocal.js --create --write-authorized
   ```

   Crea solo HostFlow_Test_Seguridad con SQL_Latin1_General_CP1_CI_AS. No instala
   servidor ni modifica la collation global, logins, permisos o protocolos.
   Usa Request del pool, no Transaction. Antes de CREATE rechaza @@TRANCOUNT
   distinto de cero e IMPLICIT_TRANSACTIONS ON; no abre transacciones ni cambia
   opciones de transaccion para forzar la operacion. Requisito de autocommit:
   [Microsoft CREATE DATABASE](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-database-transact-sql?view=sql-server-ver17).

2. Con la base nueva autorizada, inspeccionar metadatos sin datos de negocio:

   ```powershell
   node scripts/prepararSQLLocal.js --inspect
   ```

   La base debe estar vacia. Revisar y autorizar por separado la propiedad de
   aislamiento de `tests/integration/00_marcar_base_aislada.sql`:

   ```powershell
   node scripts/prepararSQLLocal.js --mark --write-authorized
   ```

   No sobrescribe una marca existente. Usar identidad Windows actual existente;
   no hacen falta passwords SQL, mixed mode, TCP, Browser, Agent ni nuevos GRANT.

3. Autorizar independientemente DDL/DML de fixtures, casos y limpieza. En un
   proceso privado de pruebas, sin cambiar el proceso de la app:

   ```powershell
   $env:HOSTFLOW_SQL_TEST_AUTH = 'windows'
   $env:HOSTFLOW_SQL_TEST_SERVER = 'localhost'
   $env:HOSTFLOW_SQL_TEST_DATABASE = 'HostFlow_Test_Seguridad'
   $env:HOSTFLOW_SQL_TEST_ENABLED = '1'
   $env:HOSTFLOW_SQL_TEST_WRITE_APPROVED = 'YES_LOCAL_DISPOSABLE'
   npm.cmd run test:sql
   ```

   Cerrar esa terminal al finalizar. No establecer USER/PASSWORD de pruebas.
   Los flags no sustituyen autorizacion externa. Sin habilitacion, suite OMITIDA.

4. Ante fallo: detener nuevas ejecuciones, ejecutar --inspect y revisar tablas/
   propiedad RunId. Nunca adoptar/eliminar una tabla sin marca. Si el propietario
   coincide con un run acreditado y hay aprobacion concreta de limpieza, revisar
   `tests/integration/03_limpieza_manual_revisable.sql` y usar:

   ```powershell
   node scripts/prepararSQLLocal.js --cleanup --write-authorized --run-id UUID_ACREDITADO
   ```

   UUID_ACREDITADO es un marcador para sustituir por el UUIDv4 observado, no un
   valor ejecutable. Flag 0 y RunId NULL se conservan en la propuesta. Base y marca
   se mantienen para reejecutar con base vacia. Si pertenencia no es verificable,
   preparar una recuperacion manual revisable; no forzar este comando.

Sin opciones/--help, prepararSQLLocal no conecta. Opciones desconocidas, combinadas,
duplicadas o ausencia de autorizacion abortan antes de cargar/conectar el driver.
La inspeccion solo imprime metadatos; nunca passwords, hashes o JWT de las cuentas.

## Regresion y limites pendientes

Resultados e inventario final en `tanda-sql-resultados.md` y
`archivos-preparacion-sql.json`. Pruebas hermeticas cubren identidad falsa, mezcla
de drivers, autorizacion ausente, pertenencia, DDL revertido, commit con respuesta
perdida, fallos de indices/restricciones, casos concurrentes y limpieza fallida.
Son simulaciones: no certifican rollback/bloqueos/driver DML en SQL real.

DDL, indices/FK/CHECK, bcrypt y cuentas ficticias persistidas, rowversion,
bloqueos/concurrencia, rollback y limpieza se validaron con el motor real;
ver el informe para el alcance exacto. Quedan pendientes fallos de red/commit
perdido reales y comparar permisos limitados/driver Tedious de produccion en una
etapa autorizada; pruebas sysadmin locales no los acreditan.
Evaluation es temporal; no se verifico vencimiento. Bundle frontend >500 kB.
localStorage permanece; cookies siguen siendo una decision documentada posterior.
