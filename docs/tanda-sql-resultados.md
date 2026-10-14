# Ejecucion SQL local y preparacion de Azure (14/10/2026)

Registro histórico del ciclo local. La puesta en marcha posterior en Azure y
las dos cuentas reales verificadas están en `cierre-seguridad.md`. No repetir
estas operaciones locales o el bootstrap/migración Azure para cerrar seguridad.

Este informe corresponde al ciclo LOCAL. La inspeccion Azure posterior de solo
lectura y su bloqueo administrativo estan en inspeccion-azure-resultados.md.

Estado final: ciclo SQL REAL completado satisfactoriamente. Este informe reemplaza
el estado anterior de preparacion sin escrituras. Azure NO fue conectado ni
modificado; autenticacion mock por defecto en desarrollo, .env intactos.

## Entorno y autorizaciones ejecutadas

SQL Server local PC-Escritorio, instancia predeterminada, version 17.0.1000.7,
Enterprise Evaluation (64-bit), EngineEdition 3, Windows/NTLM, Shared memory,
lpc:localhost y ODBC Driver 18. Identidad Windows existente sysadmin. No cambios
de protocolos, permisos, logins, servicios ni autenticacion del servidor.

Se ejecutaron las autorizaciones A/B/C/D: crear exclusivamente
HostFlow_Test_Seguridad, inspeccionar vacia, agregar su marca, ejecutar fixtures/
pruebas ficticias y limpiar objetos de la misma ejecucion acreditados. Sin
DROP DATABASE, limpieza manual, bootstrap CLI real ni operaciones de negocio.
El bootstrap ejercitado es UsuarioService contra datos ficticios de la fixture,
no la creacion de una cuenta real ni el CLI privado de Azure.

Comandos de creacion/marcado ejecutados desde backend:

~~~powershell
node scripts/prepararSQLLocal.js --create --write-authorized
node scripts/prepararSQLLocal.js --inspect
node scripts/prepararSQLLocal.js --mark --write-authorized
node scripts/prepararSQLLocal.js --inspect
~~~

Creacion: pool Request/batch sin Transaction, guardas del mismo batch antes de
CREATE para servidor/motor/Windows/Shared Memory/master, ausencia de la base,
@@TRANCOUNT=0 e IMPLICIT_TRANSACTIONS OFF. master y su collation no se alteraron.
Marcar: propiedad nueva, sin reemplazar propiedades existentes.

Las variables HOSTFLOW_SQL_TEST_AUTH=windows, HOSTFLOW_SQL_TEST_SERVER=localhost,
HOSTFLOW_SQL_TEST_DATABASE=HostFlow_Test_Seguridad, HOSTFLOW_SQL_TEST_ENABLED=1 y
HOSTFLOW_SQL_TEST_WRITE_APPROVED=YES_LOCAL_DISPOSABLE se establecieron SOLO en
cada proceso aislado que ejecuto npm.cmd run test:sql. No se cambio
HOSTFLOW_AUTH_SOURCE ni se importo config/database.js en ese runner.

## Resultados reales y fallos encontrados

Cada cifra de node:test incluye el caso contenedor: la suite final tiene 16
subpruebas mas el contenedor. No sumar repeticiones como casos nuevos.

| Ejecucion SQL real | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| Suite original revisada | 6 | 0 | 0 |
| Suite ampliada, antes de corregir diagnosticos | 14 | 3 | 0 |
| Tras corregir tamaño datetime2 y lectura de errores precedentes | 12 | 5 | 0 |
| Suite final, mssql 12.7.5 | 17 | 0 | 0 |
| Repeticion final por defecto intermitente del driver | 17 | 0 | 0 |

Las dos ejecuciones intermedias fallidas NO se ocultan. El contenedor falla si
falla una subprueba. Tras CADA ejecucion fallida se inspecciono la base y se
confirmaron tablas/objetos vacios antes de reintentar. La limpieza automatica
tambien funciono despues de las aserciones fallidas; no se hizo limpieza manual.

Defectos y correcciones:

1. Expectativa de mi nueva prueba: datetime2(0) se habia comprobado como 8 bytes;
   los metadatos devolvieron 6. Se corrigio la expectativa sin cambiar el modelo;
   [Microsoft documenta 6 bytes para precision menor a 3](https://learn.microsoft.com/en-us/sql/t-sql/data-types/datetime2-transact-sql?view=sql-server-ver17).
2. mssql 12.7.2, adaptador msnodesqlv8: el mensaje 3621 de terminacion podia
   adelantarse al error SQL real y perderlo. FK/CHECK rechazaban la escritura,
   pero el diagnostico perdia 547; un duplicado llego a convertirse en 503 por
   perder 2601/2627. Se confirmo el defecto leyendo el adaptador instalado.
   Se actualizo SOLO mssql a version exacta 12.7.5, npm --ignore-scripts;
   [la release corrige esos errores y commit/rollback](https://github.com/tediousjs/node-mssql/releases/tag/v12.7.5).
   msnodesqlv8 sigue 5.6.0 devDependency, Tedious sigue default en produccion.
3. La traduccion segura de errores ahora inspecciona codigos numericos tambien
   en precedingErrors/originalError, acotada y resistente a ciclos. Nunca usa
   mensajes/parametros para responder. Incluye regresion hermetica. No se
   acepto 3621 como sustituto de una infraccion: las pruebas exigen 547 o los
   codigos de unicidad reales, y EMAIL_DUPLICADO en el servicio.
4. --inspect ahora devuelve collation, marca y numero de objetos inesperados,
   valida tambien el destino del batch y proyecta solo metadatos permitidos.

No se modificaron constraints, bloqueos, reglas de negocio ni guardas para
forzar resultados. La migracion fuente 01_modelo_roles_usuarios.sql no cambio.

## Cobertura REAL SQL Server

- DDL Roles ficticia, Usuarios desde copia local de la propuesta; 15 columnas,
  tipos/tamaños/nullabilidad, calculada persistida, PK e indices. Tres FKs y cinco
  CHECK habilitados/confiables; sin cascadas. Rechazo real de valores invalidos.
- Unicidad del correo normalizado mediante INSERT directo, mayusculas,
  espacios y cuentas inactivas. rowversion cambia y versiones antiguas no pisan
  datos. No se guardaron en archivos ni imprimieron contraseñas, hashes o JWT;
  SQL almaceno solo hashes bcrypt ficticios, eliminados con las tablas de prueba.
- Dos bootstrap simultaneos crean exactamente un Administrador ficticio; bcrypt
  cost 12 verificado; login correcto/incorrecto; password actual incorrecta;
  cambio obligatorio bloquea middleware de negocio y servicio hasta completar.
- Cambio de password, logout, estado, correo/rol y reset revocan JWT contra SQL;
  reset obliga nuevo cambio. Token mock no autentica en el AuthService SQL
  inyectado. La configuracion global de HostFlow no se activo en SQL.
- Alta Operador, activacion/desactivacion, cambios de correo/rol y reset.
  Propietario no asignable ni autenticable. Rol Operador temporalmente inactivo
  en una transaccion de fixture rechaza sesion/login y se restaura por rollback.
- sp_getapplock real: 0 inmediato, 1 tras espera confirmada en sys.dm_tran_locks,
  -1 sin espera y timeout real de 10 s. El repositorio rechaza ese retorno sin
  ejecutar el callback; libera/rollback y puede operar despues.
- Rollback revierte INSERT de cuenta ficticia tras un error deliberado.
- Dos ediciones simultaneas con la misma revision: un exito y REVISION_VENCIDA,
  datos finales consistentes. Dos desactivaciones simultaneas de administradores:
  un exito y exactamente un Admin activo; tampoco puede degradarse/desactivarse
  ese ultimo Admin despues. Bloqueo/transaccion compartidos por todas las cuentas.

No se simularon -2/-3/-999 de applock en el motor. Retornos ausentes/malformados,
commit perdido, fallos DDL/indices y pertenencia incierta siguen cubiertos con
dobles hermeticos; no se declaran ejecutados realmente.

## Limpieza y estado final acreditado

Ultima inspeccion de solo lectura, posterior a la ultima suite:

~~~json
{"base":"HostFlow_Test_Seguridad","collation":"SQL_Latin1_General_CP1_CI_AS","marca":"hostflow-security-disposable-v1","objetosInesperados":0,"tablas":[],"objetos":[]}
~~~

La base y su marca se CONSERVAN. Roles/Usuarios de cada ejecucion se marcaron
con HostFlowTestRun UUIDv4 dentro de sus transacciones. Limpieza automaticamente
revalida identidad/base/marca/propietario, verifica nuevamente en la transaccion
y elimina solo Usuarios y despues Roles. No se adoptaron residuos ni se hicieron
DROP de objetos preexistentes/desconocidos. No hubo resultados inciertos de red.

La base sigue de uso exclusivo. Estas marcas no protegen contra un sysadmin que
las falsifique o un proceso externo que altere objetos deliberadamente.

## Regresion posterior

| Verificacion | Resultado |
| --- | --- |
| Backend npm.cmd test, hermeticas/API aislada | 101 aprobadas, 0 fallos/omitidas |
| Frontend npm.cmd test | 21 aprobadas, 0 fallos/omitidas |
| Edge real, API interceptada | 8 aprobadas, 0 fallos/omitidas |
| Frontend build | Aprobado, advertencia preexistente chunk >500 kB |
| Frontend lint | Aprobado |
| Sintaxis JavaScript backend revisado | Aprobada |
| git diff --check ambos repositorios | Aprobado |

El browser no usa backend/SQL real. Pruebas de permisos, integraciones y FlowIA
usan datos/API aislados; filtros economicos y 401/403 siguen pasando. No hay
cambios nuevos en controladores operativos, permisos ni reglas de reservas,
canales, propiedades o limpiezas. No se ejercitaron datos operativos reales.

## Archivos y siguiente paso

Inventario completo de pendientes Git: archivos-preparacion-sql.json (incluye
preparacion previa y esta ejecucion). Cambios de esta ejecucion: package.json/
lock por mssql 12.7.5; seguridadUsuarios; suite SQL ampliada; regresiones de
repositorios/inspector; prepararSQLLocal; documentos; SELECT de destino Azure y
opciones SET en propuesta de permisos. Frontend no requirio cambios nuevos.
No se agregaron .env, secretos, hashes reales ni resultados privados de Azure.
Todos los cambios quedan locales, sin commits, push ni deploy.

Modelo listo para revision y migracion controlada: no se observo un bloqueo
local de DDL/persistencia/transacciones/concurrencia. NO es certificacion Azure.
Falta validar con identidad limitada SELECT Roles, SELECT/INSERT/UPDATE Usuarios
y sys.sp_getapplock/public; identidad migradora requiere DDL/REFERENCES y
VIEW DEFINITION. No se crearon identidades ni otorgaron permisos para probarlo.

Tedious/Azure, TLS/destino, opciones SET de la conexion efectiva, bootstrap real,
corte/re-login y regresion operativa requieren la siguiente autorizacion. Los SET
del runner nativo no acreditan los defaults de otra conexion. No se retiro mock
ni se activo SQL. Evaluation temporal, localStorage, CORS/proxy/limites por
instancia y bundle siguen pendientes de revisar antes del despliegue.

Secuencia exacta y siete autorizaciones en activacion-azure-controlada.md:
1 destino/esquema solo lectura; 2 migrar Usuarios; 3 verificar metadatos/permisos;
4 bootstrap real; 5 verificar credenciales y aprobar corte SQL; 6 prueba funcional
y Operador; 7 regresion integral autorizada. El siguiente paso es Azure 1,
sin otra auditoria general ni escrituras Azure en esta tanda.
