# Publicación autorizada del cierre de seguridad

El titular autorizó un commit por repositorio y push a main después de la
regresión final, revisión de secretos y comprobación de trabajo remoto.
Publicar no aplica migración, ejecuta bootstrap, activa SQL permanente ni hace
deploy. Los mensajes aprobados son los siguientes.

## Backend

> Se completo la validacion de usuarios y seguridad en SQL Server

Incluye la inyección del driver y el ciclo SQL local aislado con marcas,
limpieza acreditada y guardas; mssql 12.7.5, errores seguros, pruebas,
consultas de inspección y procedimientos documentados. Los scripts de escritura
permanecen bloqueados y fuera del arranque automático.

La corrección final separa obtenerAlertasPersistidas de obtenerAlertas:
Dashboard lee registros existentes, sin sincronizar. El Centro de alertas
sigue sincronizando antes de consultar, con las mismas reglas, filtros y
repositorios. Inicio muestra «Alertas registradas» hasta la siguiente
sincronización del Centro. No se alteró SQL, reservas, canales ni limpiezas.

Evidencia: 110 pruebas herméticas backend; cuatro nuevas recorren el controlador,
servicios y repositorios reales con SQL simulado, rechazan DML/sincronización
al ingresar y prueban permisos/DTOs de ambos roles. Las 17 SQL locales reales
aprobadas antes no se repitieron. La validación de cuentas en Azure es anterior
al ajuste de navegación y fue realizada por el titular sin compartir secretos.

## Frontend

> Se mejoro la gestion de usuarios y se restauro la navegacion de HostFlow

Incluye Usuarios/Mi cuenta con perfil, tabla responsive, filtros, paginación,
diálogos y confirmaciones accesibles, controles de contraseña y estilos comunes
preparados para temas. Conserva permisos, payloads, cambio obligatorio y
revocación. También incluye aviso/reintento de Dashboard, contrato de permisos
y herramienta manual segura fuera del build.

Se retiró la bandera de inicio en Mi cuenta y su modo especial de pruebas:
login, cambio obligatorio completado y recarga abren Inicio para Admin/Operador.
El perfil lateral abre Mi cuenta; Usuarios está restringido al Administrador.

Evidencia: 24 pruebas frontend, 13 de navegador (12 escenarios y contenedor),
build y lint aprobados. Persisten los avisos de tamaño de bundle. No se
utilizaron las cuentas reales para crear/editar/desactivar/resetear en pruebas.

## Contenido y controles de publicación

Inventario exacto: archivos-preparacion-sql.json, 37 backend y 14 frontend.
Estado/límites: cierre-seguridad.md. Revisar exactamente esta lista y el index,
sintaxis y diff --check; excluir .env, dependencias, dist, ZIP, metadatos crudos,
resultados privados, capturas y batch Azure con destino literal.

La migración original mantiene su hash y flags 0: no volver a ejecutarla.
Mock sigue siendo el valor por defecto en desarrollo, y únicamente el proceso
local autorizado usa SQL temporal. El arranque no aplica migraciones ni crea
usuarios. Las herramientas manuales no son entrypoints de producción.

Fetch de ambos origin/main sin divergencia antes de preparar los commits.
Reconfirmar el remoto y los archivos preparados antes del push, sin force ni
sobrescrituras. Confirmar ambos push y HEAD remoto antes de informar publicación.
Este documento no automatiza ninguna operación Git o SQL.
