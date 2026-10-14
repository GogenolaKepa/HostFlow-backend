# Cierre funcional de seguridad y cuentas

## Estado confirmado

La migración de dbo.Usuarios fue ejecutada y verificada por el titular desde
Azure Portal. No se repitió. Roles conserva Administrador, Propietario y Operador;
solo Administrador y Operador son asignables y pueden autenticarse.

El primer Administrador se creó con el CLI privado y fue verificado antes del
corte. El backend real usa SQL mediante una variable temporal de su proceso:
HOSTFLOW_AUTH_SOURCE=sql. .env y variables permanentes permanecen intactos.
El código sigue usando mock por defecto en desarrollo; producción exige SQL
explícito. No existe autenticación dual ni fallback silencioso a mock.

El arranque solo comprueba destino, permisos, roles y Administrador activo.
No ejecuta migraciones, bootstrap ni escrituras SQL automáticas. Los originales
SQL conservan sus bloqueos de autorización. No repetir migración ni bootstrap
ahora que existen cuentas persistentes.

## Comprobaciones reales en Azure

El titular ingresó personalmente todas las credenciales y confirmó:

- Administrador: login, cambio obligatorio, Mi cuenta y Gestión de usuarios.
- Alta desde la interfaz de una única cuenta Operador diferenciada.
- Operador en un perfil separado: login, cambio obligatorio y Mi cuenta;
  Usuarios no aparece.
- Ambas páginas manuales aprobaron: sesión SQL sin cambio pendiente, permisos
  administrativos/económicos correctos, 401 sin autenticación, Usuarios/Roles
  403 para Operador y 200 para Administrador.
- Reportes e histórico: HTTP 200 y ausencia de campos económicos, incluidos
  objetos anidados, para Operador. No se imprimieron las filas ni sus valores.
- La sesión Administrador sigue válida después del alta y cambio de contraseña
  del Operador; ambos perfiles conservan sesiones independientes.

Un SELECT agregado posterior, con destino HostFlow/Azure SQL Database y TLS
validado antes de consultar, confirmó dos cuentas, un Administrador activo,
un Operador activo y cero cambios obligatorios pendientes. No consultó nombres,
correos, contraseñas, hashes, tokens ni datos operativos.

Las escrituras de cuentas fueron realizadas por el titular: bootstrap,
contraseñas propias y alta Operador. El agente no modificó al Administrador ni
intentó desactivar/degradar el último Administrador en Azure.

## Navegación y efectos de consultas

Se retiró la restricción temporal del menú a cuentas. El menú normal y FlowIA
están disponibles según los permisos; Usuarios permanece exclusivo de Admin.
Mi cuenta sigue en el perfil inferior y Cerrar sesión está separado.
Se retiró la opción temporal de inicio en Mi cuenta. Ambos roles abren Inicio,
también después del cambio obligatorio y al recargar. El titular confirmó los
menús normales; las regresiones nuevas verifican el inicio definitivo.
Dashboard lee alertas persistidas sin sincronizar: conserva filtro de activas,
orden y límite de cuatro. La interfaz indica «Alertas registradas». Una condición
nueva o resuelta se refleja después de sincronizar el Centro de alertas, que
conserva su comportamiento previo. No se desactivó ningún proceso del Centro.

GET que pueden escribir, revisados en código y NO ejecutados como regresión
contra Azure:

| Endpoint | Efecto existente |
| --- | --- |
| /api/reservas | Finaliza reservas vencidas y registra eventos. |
| /api/limpiezas y /api/limpiezas/resumen | Sincroniza tareas, altas/actualizaciones/cancelaciones. |
| /api/alertas y /api/alertas/resumen | Sincroniza o resuelve alertas operativas. |
| /api/recomendaciones | FlowIA consulta limpiezas con sincronización; puede consultar el proveedor IA. |

El GET dashboard/resumen ahora es lectura: usa obtenerAlertasPersistidas y
las consultas existentes del repositorio Dashboard, sin DML ni servicios de
sincronización. Sus refrescos no modifican Azure. Montar FlowIA cerrado no
ejecuta recomendaciones. Calendario usa su repositorio
de lectura y no el servicio que finaliza reservas. dashboard/reportes e
historico son SELECT directos; fueron los únicos datos operativos consultados
durante la comprobación de roles. Las restantes acciones de negocio no fueron
ejecutadas para simular permisos. No cambiaron reglas de reservas, canales,
propiedades, limpiezas, alertas o integraciones.

## Regresión aislada y límites de evidencia

- Backend: 110 pruebas herméticas aprobadas, sin conexión Azure ni SQL real.
  Incluyen autorización por acción/campo, DTOs económicos anidados y FlowIA,
  usuarios, bcrypt, revocación por VersionSesion, cambio obligatorio, bootstrap
  simulado y concurrencia/protección del último Administrador.
- Frontend: 24 pruebas aprobadas de sesión, cuentas, contrato de permisos y
  herramienta manual segura.
- Navegador aislado: 13 aprobadas (12 escenarios y contenedor).
  Incluye perfil accesible, móvil/colapsado, Operador, manejo de fallos y
  ingreso/recarga en Inicio de ambos roles y cambio obligatorio seguido de Inicio,
  sin consultas a otros módulos que sincronizan.
- Build y lint frontend aprobados; sintaxis de 128 archivos JS de backend y
  7 de tests frontend aprobada; git diff --check sin errores en ambos repositorios.
  Backend no tiene un script lint ni un paso de compilación.
- Las 17 pruebas SQL locales reales previamente aprobadas no se repitieron.

La protección transaccional del último Administrador y la concurrencia están
verificadas de forma hermética y en el ciclo SQL local anterior. No se ejecutó
una acción administrativa destructiva real para probarlas en Azure. La redacción
económica de Dashboard/resumen y FlowIA se verificó aisladamente; no se usaron
credenciales reales para automatizar esas consultas. FlowIA mantiene su GET
con sincronización; Inicio ahora es de lectura. Edición, desactivación y reset administrativos
tienen pruebas aisladas; en Azure esta tanda solo validó el alta del Operador.

## Publicación y pendientes

Ver publicacion-seguridad-propuesta.md y archivos-preparacion-sql.json para
mensajes y lista exacta de archivos. Commit y push autorizados por el titular
después de las verificaciones; no se autorizó deploy ni escritura SQL.
No se incluyen .env, dependencias, dist, ZIP, lotes privados de destino o
resultados crudos de Azure. Las propuestas bloqueadas son revisión, no despliegue.
Inventario del cierre: 37 archivos backend (17 modificados y 20 nuevos), 14 frontend
(6 modificados y 8 nuevos), todos coincidentes con Git. Ambos están en main y
sin archivos preparados en el index. La revisión de contenido no detectó JWT,
hashes bcrypt completos, claves privadas, tokens o valores secretos de la
conexión existente entre los cambios. No hay archivos .env versionados.

El cierre incluye el pulido visual posterior de Usuarios y Mi cuenta, con
diálogos accesibles, filtros, tabla responsive y controles de contraseña;
ver frontend/docs/pulido-visual-seguridad.md. No cambió el backend funcional
durante el pulido; la corrección posterior solo separa la lectura de alertas
en Inicio. No se realizaron escrituras reales para probar diseño o navegación.

Antes de producción: aprobar configuración SQL permanente, CORS HTTPS y proxy,
secreto JWT privado robusto, política de límites distribuida si hay varias
instancias y diseño definitivo del almacenamiento de sesión (actual localStorage).
Confirmar recuperación/PITR con el titular; el agente no acreditó su ventana
desde la identidad de app. Revisar los permisos heredados de la conexión por
separado; no se amplió ningún permiso ni se presupone privilegio mínimo global.
Las credenciales mock deben retirarse/aislarse antes del despliegue y nunca
habilitarse en producción. Persiste la advertencia de tamaño del bundle.

La validación real de negocio y cualquier escritura operativa siguen requiriendo
autorización. No comenzar Configuración ni otra funcionalidad dentro de este cierre.
