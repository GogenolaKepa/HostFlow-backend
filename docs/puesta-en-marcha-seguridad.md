# Activacion de Seguridad SQL: etapas 3 y 4

Estado: implementación y validación de cuentas SQL completadas en desarrollo;
ver `cierre-seguridad.md`. Mock sigue siendo el valor por defecto del código,
pero el proceso local autorizado usa SQL mediante una variable temporal.
No repetir migración ni bootstrap. Los pasos de puesta en marcha se conservan
como referencia para una intervención futura, con autorización separada.
SQL local validado: 17 pruebas reales aprobadas en dos ejecuciones finales;
ver tanda-sql-resultados.md. Siguiente paso: activacion-azure-controlada.md,
con siete autorizaciones separadas. Azure sigue sin conexion ni modificaciones.
Actualizacion de estabilizacion: ver `estabilizacion-seguridad.md` y
`checklist-seguridad-manual.md`. No se autorizaron ejecuciones en Azure.
La preparacion SQL LOCAL actual usa Windows/Shared Memory; ver
`preparacion-sql-local.md`. Crear/marcar/probar esa base requiere autorizacion separada.
No hubo operaciones en Azure, migracion, cuentas reales ni deploy. El contenido
exacto de `01_modelo_roles_usuarios.sql` y su ejecucion necesitan revision y
autorizacion separada. Aprobar codigo/modelo NO autoriza pasos de escritura.

## Origen exclusivo y preparacion

`HOSTFLOW_AUTH_SOURCE` admite exclusivamente `mock` o `sql`; ausente significa
mock para conservar la aplicacion durante esta transicion. Un valor desconocido
detiene el arranque. Es una configuracion del proceso backend, no del frontend.
No se modifico .env. Cambiar el valor requiere reiniciar el proceso.

En mock se mantienen login y negocio. Mi cuenta consulta el perfil y muestra que
la gestion aun no esta habilitada; altas/ediciones/password SQL devuelven 503 sin
consultar SQL. Usuarios no aparece en navegacion. Se quitaron las credenciales
precargadas/expuestas del Login: las cuentas mock existentes siguen funcionando.

En SQL no hay fallback ni autenticacion dual. El middleware exige origen sql y
VersionSesion del JWT, ademas de HS256/expiracion e identidad. Consulta usuario,
rol activo y version vigentes en cada peticion. Tokens mock son rechazados incluso
si coinciden ID/email; tokens SQL tampoco se aceptan en mock. Caida SQL: 503.

## Permisos minimos futuros

La cuenta de app necesita SELECT dbo.Roles, SELECT/INSERT/UPDATE dbo.Usuarios
y capacidad efectiva de ejecutar sys.sp_getapplock con principal public. No
necesita DELETE Usuarios, escrituras Roles, DDL ni VIEW DEFINITION para operar.
La cuenta de migracion debe tener visibilidad completa y permisos DDL apropiados;
la de bootstrap necesita SELECT Roles/Usuarios, INSERT Usuarios y bloqueo.
Pueden ser identidades distintas y existentes. No hay scripts GRANT ni se
presupone que la cuenta actual tenga esos permisos sobre una tabla nueva.

Las conexiones deben respetar las opciones del indice calculado (ANSI_NULLS,
ANSI_PADDING, ANSI_WARNINGS, ARITHABORT, CONCAT_NULL_YIELDS_NULL,
QUOTED_IDENTIFIER ON y NUMERIC_ROUNDABORT OFF). Los defaults del driver instalado
se revisaron localmente; verificar en el motor durante la prueba autorizada.

El SELECT `05_permisos_puesta_en_marcha_solo_lectura.sql` permite comprobar estos
permisos con la conexion de app DESPUES de la migracion. Si faltan, detenerse y
acordar un ajuste minimo separado con quien administra SQL. No cambiar permisos
como parte automatica de ninguna de estas herramientas.

## Secuencia exacta, todavia NO ejecutada

1. Mantener la app actual en mock. Ejecutar las pruebas locales:

   Backend: `npm.cmd test`.
   Frontend: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.
   Opcional con Edge/Chromium instalado: `npm.cmd run test:browser`, API simulada.
   `npm.cmd run test:sql` esta omitido por defecto; habilitarlo exige base SQL
   LOCAL vacia/marcada y autorizacion independiente. No usar HostFlow/Azure.

2. Migracion/persistencia/concurrencia ya probadas en la base LOCAL autorizada.
   Revisar el SQL exacto para Azure segun activacion-azure-controlada.md.
   No instalar ni usar automaticamente un motor
   conectado a produccion. La migracion permanece en proposals, con flags de
   modelo SQL y escritura en cero. No se ejecuta desde npm ni desde server.js.

3. Obtener autorizacion explicita para aplicar la migracion a HostFlow con la
   cuenta administrativa existente. Solo entonces habilitar sus flags/aplicarla.
   Verificar los cuatro SELECT de `02_verificacion_metadatos.sql`. No crea cuentas
   ni modifica Roles. Conservar registro del destino/fecha/resultado sin secretos.

4. Con aprobacion de las comprobaciones de lectura correspondientes, verificar
   permisos de app mediante `05_permisos_puesta_en_marcha_solo_lectura.sql`.
   Mantener mock hasta resolver permisos, roles y acceso inicial.

5. En una terminal local privada, desde backend, usar:

   ```powershell
   npm.cmd run admin:bootstrap -- --check --database HostFlow
   ```

   Este modo verifica destino, lectura Roles/Usuarios y roles asignables; informa
   permisos de alta/bloqueo. Solo lectura: requiere que exista Usuarios. Sin
   opciones o con --help el comando no lee .env, conecta ni escribe.

6. Solicitar autorizacion separada para INSERT del primer Admin. Solo despues,
   con una conexion autorizada en el entorno privado de ese proceso, ejecutar:

   ```powershell
   npm.cmd run admin:bootstrap -- --apply --write-authorized --database HostFlow
   ```

   El flag NO sustituye la autorizacion. El comando verifica base/permisos,
   pide confirmacion textual y Nombre/email/password dos veces. Las passwords se
   introducen ocultas y no se admiten por argumentos de CLI. Bcrypt cost 12 en
   memoria, minimo 12 caracteres/maximo 72 bytes UTF-8. Parametros tipados, sin
   imprimir hash/password/token ni errores brutos de SQL.

   Usa UsuarioService/UsuarioRepository, el mismo bloqueo/transaccion que la API,
   comprueba Usuarios vacia y resuelve Administrador activo por nombre. Si existe
   CUALQUIER cuenta aborta; no reemplaza, reactiva ni resetea. Crea una cuenta
   Activo con cambio obligatorio, version 1 y actores NULL. El SQL 04 conserva
   un batch de referencia revisable; el comando comparte el repositorio de la API
   para evitar protocolos distintos, no ejecuta ese archivo automaticamente.
   Ante resultado de red incierto, comprobar estado antes de reintentar.

7. Verificar la password del primer Admin mediante un paso independiente, de
   solo lectura, antes de activar SQL:

   ```powershell
   npm.cmd run admin:bootstrap -- --verify --database HostFlow
   ```

   Pide correo/password oculta, comprueba bcrypt, cuenta/rol activos y nombre
   Administrador. No cambia la password, emite JWT ni expone hash. El flag de
   cambio obligatorio permanece activo.

8. Preparar backend y frontend nuevos juntos y aprobar el corte operativo.
   En PRODUCCION configurar previamente NODE_ENV=production,
   HOSTFLOW_CORS_ORIGINS con origenes HTTPS exactos y JWT_SECRET privado aleatorio
   de al menos 32 bytes, mediante entorno/gestor de secretos. No poner valores
   secretos literales en comandos. Produccion ahora rechaza mock por omision.
   En la terminal backend (configuracion solo de ese proceso):

   ```powershell
   $env:HOSTFLOW_AUTH_SOURCE = 'sql'
   npm.cmd start
   ```

   No altera .env. El arranque SQL exige HostFlow, permisos efectivos, los dos
   roles asignables activos y al menos un Administrador activo; si falta algo
   no abre el servidor y emite un error generico. No revive mocks.

9. Iniciar sesion con el Admin VERIFICADO. React muestra exclusivamente el cambio
   obligatorio, sin montar Dashboard ni realizar GET de negocio. Elegir otra
   password privada; la API verifica la actual y revoca tokens anteriores,
   devolviendo una nueva sesion. Este paso ES UPDATE Usuarios y debe estar
   cubierto por la autorizacion de puesta en marcha. Tampoco ejecutar pruebas
   manuales de altas/reset/estados sin autorizar sus escrituras.

10. Probar Usuarios/Mi cuenta y regresion del negocio en el entorno acordado.
    No utilizar GET operativos de produccion como prueba inocua: sincronizan y
    pueden escribir. Todos los usuarios anteriores deben volver a iniciar sesion;
    no se importan passwords ni IDs mock.

## Configuracion privada para el bootstrap

El comando lee el .env existente sin modificarlo y superpone variables del
proceso. Para usar una cuenta administrativa diferente se puede abrir una
terminal privada separada y cargar credenciales existentes en DB_USER/DB_PASSWORD
solo en ese proceso, desde un gestor de secretos o prompt seguro. Nunca poner
sus valores literales en comandos, capturas, chat, historial o archivos del repo.
DB_SERVER/DB_DATABASE deben apuntar al HostFlow aprobado. Cerrar esa terminal al
terminar; no transmitir las credenciales administrativas al servidor de la app.
Si no hay una conexion adecuada disponible, detener el paso correspondiente.

## Acceso, recuperacion y limites

La app mock conserva acceso mientras se prepara, migra y VERIFICA el Admin SQL.
El corte requiere re-login; no se promete cero interrupciones. Despues del corte
SQL indisponible responde 503 y no existe rollback automatico a cuentas demo.
Un fallo requiere recuperar el servicio SQL o una decision explicita de
recuperacion; no borrar Usuarios/Roles ni restaurar mocks silenciosamente.

Pendientes antes de deploy: retirar credenciales/codigo mock del paquete definitivo,
configurar y verificar CORS/limite login/proxy reales; reevaluar localStorage;
medir bcrypt en el destino. Ya hay guardas de produccion SQL, CORS configurable
y limite login local en memoria. Logout SQL revoca TODAS las
sesiones y la UI lo confirma; sin conexion solo se confirma cierre local.
Observaciones conservan la restriccion temporal aprobada. No hay recuperacion por
email, MFA, sesiones por dispositivo ni auditoria historica en este bloque.

No se ejecutaron migracion, --check/--verify contra Azure, --apply real, arranque
SQL ni cambio de password real. Las pruebas del comando usan conexiones dobles.
