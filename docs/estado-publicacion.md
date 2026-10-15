# Estado vigente de la entrega acumulada

Este documento actualiza la lectura de los informes históricos de Configuración, estabilización y permisos. Publicar estos archivos NO autoriza ejecutar SQL, activar funciones, cambiar variables, reiniciar servicios o desplegar.

## Estado informado por el usuario

Configuración empresarial ya tiene sus dos tablas, una empresa activa vinculada por `HOSTFLOW_EMPRESA_ID=1` y preferencias iniciales 15:00/10:00, America/Argentina/Buenos_Aires. El primer guardado empresarial real y su recuperación mediante «Recargar datos» fueron confirmados por el usuario. No se reproduce el contenido comercial en este documento.

El usuario confirmó el reinicio con `HOSTFLOW_CONFIGURACION_READ_ONLY=1`. También confirmó 48 permisos específicos sobre 19 tablas y la conservación temporal de db_datareader/db_datawriter. Este estado procede del usuario; no de nuevas consultas del agente a Azure.

## NO volver a ejecutar estos pasos

| Archivo o procedimiento | Estado y restricción |
| --- | --- |
| `sql/proposals/seguridad_etapas_3_4/01_modelo_roles_usuarios.sql` | La tabla Usuarios ya fue migrada. NO repetir para publicar. Roles se conserva. |
| `scripts/bootstrapAdministrador.js` / `sql/proposals/seguridad_etapas_3_4/04_bootstrap_administrador_parametrizado.sql` | El primer Administrador ya existe y funciona. NO ejecutar bootstrap nuevamente ni insertar otra cuenta inicial. |
| `sql/proposals/configuracion_empresa/01_modelo_empresa_preferencias.sql` | Etapa C completada por el usuario. Empresas/PreferenciasOperativas existen. NO volver a crear el modelo. |
| `sql/proposals/configuracion_empresa/02_vinculacion_inicial_pendiente.sql` | Etapa D completada; empresa 1 ya vinculada. NO insertar otra empresa o preferencias. |
| `sql/proposals/permisos_minimos/01_conceder_minimos_bloqueado.sql` | Etapa E informada y verificada por el usuario: 48/48/0. NO volver a conceder por publicar. La copia administrativa externa ejecutada no se recibió: el archivo local conserva su revisión bloqueada y no acredita identidad byte a byte con aquella copia. |
| `sql/proposals/configuracion_empresa/04_permisos_propuestos_solo_lectura.sql` | Solo genera texto; los permisos nuevos ya están incluidos en los 48. NO ejecutar el texto como una concesión adicional. |

Las migraciones operativas antiguas de `sql/migrations` no son una tarea de esta publicación. No ejecutarlas en lote ni inferir su estado de aplicación por su presencia en Git. Todos los SQL de propuesta conservan sus bytes y guardas; no se cambian a «habilitados» para reflejar que un administrador completó una operación externa.

## Permisos mínimos: transición todavía pendiente

`03_retirar_roles_bloqueado.sql` y `04_recuperacion_roles_bloqueada.sql` siguen deshabilitados. Flags de retiro, inspección, pruebas, ventana y recuperación en 0; servidor/ID/SID esperados sin completar. Requieren autorizaciones independientes, identidad administrativa y comprobaciones transaccionales. El backend ordinario no recibe permisos de administración.

No hay pruebas del motor que acrediten aquí la operación completa sin roles amplios. Mantener el plan existente y la sesión administrativa independiente para esa futura transición; NO retirar ni restaurar roles con esta entrega. El generador de propuestas es offline y tampoco debe ejecutarse para «instalar» HostFlow.

## Contrato actual y límites

- Autenticación: `HOSTFLOW_AUTH_SOURCE` ausente conserva mock en desarrollo; SQL requiere selección explícita, sin fallback. Producción exige SQL y secreto privado válido. Ninguna variable se cambia al publicar.
- Configuración permanece cerrada sin `HOSTFLOW_CONFIGURACION_ENABLED=1` y un IdEmpresa válido del servidor. No se admite destino empresarial del cliente.
- Con `HOSTFLOW_CONFIGURACION_READ_ONLY=1`, GET permite consulta autorizada y PUT responde 503 antes de acceder al repositorio empresarial. Un valor inválido también bloquea. **Omitir esa variable o usar 0 permite guardar si las demás condiciones están habilitadas**: conservar explícitamente 1 durante la fase de lectura actual.
- JWT ausente/inválido: 401; Operador en empresa/operativas: 403; solo recibe horarios predeterminados por la ruta limitada. El Administrador conserva los permisos previos.
- Guardados habilitados y autorizados: transacción, applock, revalidación del editor y versión de sesión, rowversion binario y 409 ante conflicto. Solo UPDATE de Empresas O PreferenciasOperativas según formulario, con auditoría del actor. Sin INSERT empresarial desde la API.
- Fechas: valida ISO, día real y egreso posterior; conserva políticas de canales, conflictos externos y estados. No se reprocesaron eventos reales.
- GET de reservas, limpiezas, alertas y recomendaciones puede escribir; Calendario también consulta Limpiezas. No utilizarlos como pruebas de lectura de publicación.

## Arranque, pruebas y publicación

`npm run dev`/`npm start` llaman al servidor y a comprobaciones SQL de preparación exclusivamente de lectura. No importan ni ejecutan migraciones, vinculación, bootstrap o scripts administrativos. No existen pre/post hooks que los ejecuten.

`npm test` ejecuta solo `tests/*.test.js`, con SQL bloqueado o inyectado. Los runners de `tests/integration` están fuera de ese patrón y requieren sus banderas y destinos locales acreditados. **No ejecutar** `test:sql`, `test:sql:configuracion`, bootstrap, preparación SQL ni los antiguos `test:inbound`, `test:channels`, `test:properties` en esta publicación: estos últimos usan HTTP y pueden alcanzar el servicio operativo.

Validación final: 157 pruebas backend herméticas aprobadas, sintaxis de 149 JS correcta y diff sin errores de whitespace. No hay script build/lint propio del backend; el análisis adicional con Oxlint mantiene advertencias previas, sin errores. La batería frontend y navegador se detalla en su documento equivalente.

Los inventarios de tandas anteriores son históricos: sus huellas no son una lista actual de staging. La lista exacta y huellas revisadas para esta publicación se preparan fuera del repositorio, en `revision/auditoria-publicacion`. No incluyen resultados privados de Azure, SID reales, credenciales o cadenas de conexión.

Nota heredada: existen 24 imágenes de `uploads/propiedades` ya versionadas en HEAD, sin cambios en esta entrega. No son incorporaciones nuevas; no se inspeccionaron ni se eliminaron. Su política de privacidad/almacenamiento y los ejemplos históricos de mockData deben revisarse por separado si se desea sanear todo el historial. No usar staging global de carpetas de uploads.
