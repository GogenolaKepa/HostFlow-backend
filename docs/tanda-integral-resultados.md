# Tanda autónoma: resultados y continuidad

> Informe histórico. FlowIA fue refinado después como drawer modal; el usuario aprobó su aspecto y confirmó el primer guardado empresarial y el retorno a solo lectura. Consultar [estado vigente](estado-publicacion.md) y el informe frontend de FlowIA. Las pruebas/huellas de esta tanda se conservan como registro, sin sustituir la revisión final.

Las prioridades 1, 2 y 3 quedaron implementadas y aprobadas en pruebas aisladas
antes de avanzar a mejoras secundarias. No hubo consultas/conexiones del agente
a Azure, escrituras SQL reales/locales, migraciones, bootstrap, cambios de permisos,
credenciales, .env, commits, push, deploy ni arranque de servicios de desarrollo.
Los procesos temporales de prueba se cerraron; no se detuvieron servicios del usuario.

## Resultado por etapa

| Etapa | Estado y alcance comprobado |
| --- | --- |
| 0 | Completada: ambos repositorios main, remotos GitHub esperados, registro inicial de 43 archivos pendientes backend y 20 frontend. Huellas anteriores conservadas. |
| 1 | Completada: ficha de Huéspedes en modal accesible, sin mover el listado. |
| 2 | Completada: FlowIA dispone de áreas propias en el layout, tanto cerrado como expandido. |
| 3 | Completada: Configuración muestra estado real de conexión/lectura y cierra edición sin depender solo del botón. |
| 4 | Cobertura ampliada, parcial: circuito visual completo y regresiones de servicios; no auditoría exhaustiva de cada operación/SQL. Defecto de fechas corregido. |
| 5 | Cobertura ampliada, parcial: alta, modificación, cancelación, duplicados, reproceso y conflictos en reservas de ambos canales. No se amplió toda la regresión de procesamiento de propiedades/imágenes. |
| 6 | Completada en alcance acotado: PDF diferido, build comparado y exportación probada. Sin refactor masivo de Dashboard/App.css. |
| 7 | Revisión estática completada: collation corregida en propuestas, guardas conservadas; validación de motor/retiro de roles pendientes de autorización. |
| 8 | Propuesta técnica preparada; sin implementación o migración de Notificaciones. |
| 9 | Completada para pruebas aplicables sin Azure; resultados concretos abajo. |

## Modal de Huéspedes

DetalleHuesped abre inmediatamente un diálogo nativo con nombre accesible y carga
visible. Consulta exclusivamente GET /huespedes/:id, cuyo servicio lee huésped e
historial directamente del repositorio, sin finalizar reservas ni sincronizar.
El modal presenta identidad, correo, teléfono, documento, nacionalidad, origen,
situación e historial que ya devuelve la API. No solicita datos de otros módulos.

El historial muestra propiedad, canal, estadía, estado y Ver reserva con el mismo
callback/sessionStorage existente. El importe aparece únicamente con el permiso
reservas.importes y un valor informado/válido, nunca como cero inventado por ausencia.
El Operador no lo ve incluso si el doble de prueba entrega importes inesperados.
Las protecciones económicas del backend permanecen independientes.

Hay estados específicos de inexistente (404), error/reintento, respuesta incompleta,
historial vacío y cancelación de la solicitud al cerrar. Una respuesta tardía no
reabre la ficha. El formulario de edición del listado se conserva al abrir/cerrar.
El listado actual no recibió filtros o paginación nuevos; su estado y scroll no
se reinicializan. El historial extenso desplaza dentro del diálogo y conserva
visible el cierre. Escape cierra; Tab/Shift+Tab circulan por controles visibles y
habilitados; se restaura foco sin desplazar al botón de origen. El bloqueo de scroll
compartido cuenta diálogos anidados. Se conserva el espacio del scrollbar para
evitar que las filas cambien de altura y se mueva la posición al abrir/cerrar.

## FlowIA y layout compartido

workspace.css define áreas para contenido, panel del asistente y barra inferior.
El botón conserva su identidad visual pero ya no flota encima de formularios.
En escritorio el panel ocupa una columna propia; en tablet/móvil ocupa una fila
con altura limitada y scroll interno. La barra inferior tiene espacio real,
incluidas safe areas; no hay márgenes nuevos repetidos por pantalla ni !important.
El contenido principal es el contenedor de scroll y puede enfocarse por teclado;
PageDown también se verificó en el listado largo. Los tres desplazamientos de
Propiedades que usaban window.scrollTo se adaptaron a ese contenedor, sin cambiar
reglas de propiedades. La sidebar conserva su área expandida/colapsada y menú móvil.

El panel es complementario, no un modal que deje inutilizable el formulario bajo
él. Al abrir enfoca Minimizar; Escape dentro del panel lo cierra y restaura el
botón. Al aparecer un diálogo o el menú móvil se minimiza y oculta sus utilidades,
conservando espacio para evitar movimientos. Se revisaron los selectores comunes
de overlays existentes. El bloqueo del contenido de fondo respeta también los
diálogos anteriores que bloqueaban solamente body.

No se alteraron recomendaciones, llamadas a IA, permisos o política de consulta:
abrir FlowIA sigue ejecutando un GET que puede sincronizar limpiezas. Las pruebas
interceptan esa API; la nueva ubicación no autoriza usarla contra datos reales.

## Configuración y solo lectura

GET empresa/operativas incluye estado:{persistencia:'sql',soloLectura:boolean},
calculado por el servidor después de la lectura válida, sujeto al mismo JWT/rol.
No hay endpoint público ni bandera VITE para habilitar guardados. El GET limitado
de predeterminados sigue entregando exclusivamente horarios/zona al Operador.
El catálogo de permisos y la autorización SQL no cambiaron.

La UI distingue Apariencia local, Configuración conectada y Solo lectura temporal.
En lectura deshabilita campos y oculta Guardar. Un contrato sin estado válido
también cierra la edición, conservando la consulta. No muestra persistencia pendiente
ante una lectura exitosa. Si la guarda cambia después de cargar un formulario,
el PUT sigue bloqueado en el servidor y el 503 cierra también los controles de UI;
el borrador se conserva hasta descartar/recargar explícitamente.

HOSTFLOW_CONFIGURACION_READ_ONLY=1 no se quitó ni cambió. No se guardaron datos
empresariales reales. Transacción, applock, revalidación del editor y rowversion
conservan sus reglas. Los GET no insertan ni actualizan. Consultar simultáneamente
con cuentas reales y autorizar el primer guardado siguen siendo pasos humanos.

## Regresiones operativas e integraciones

Se agregaron 13 casos de servicios reales con repositorios en memoria y bloqueo
explícito de cualquier acceso SQL. Cubren huésped/historial sin sincronizar,
horarios manuales, creación/timeline, validaciones, cancelación manual sin borrar,
restricciones de canal, horizonte/zona de limpiezas y rechazo de tareas canceladas,
lectura persistida de alertas y resolución de condiciones terminadas. Por canal
cubren fechas inválidas, alta, ID externo duplicado, reproceso, modificación,
cancelación y conservación de reservas externas confirmadas con conflicto.

Defecto reproducido antes de corregir: comparar new Date inválidos no rechazaba
la entrada y las fechas imposibles podían normalizarse. Tres pruebas fallaron
antes del arreglo. Ahora un helper valida formato ISO, día real, bisiesto y rango
estrictamente creciente en siete comprobaciones del servicio, conservando sus
mensajes y políticas de canal. Las fechas inválidas no crean la reserva ni marcan
como procesado el evento ficticio. Otro caso prueba límites/calendario directamente.
No se cambió la regla de admitir y advertir un conflicto confirmado externamente,
la zona horaria, horarios de canales, finalización automática, montos, estados o
procesamiento de limpiezas/alertas. No se ejecutaron los scripts HTTP antiguos que
apuntan al puerto 4000 y podrían alcanzar el backend real del usuario.

Las pruebas en memoria no acreditan unicidad/concurrencia del motor ni atomicidad
de todos los flujos operativos. No se crearon fixtures SQL nuevos. Sigue pendiente
ampliar cobertura de propiedades/imágenes y escenarios simultáneos entre eventos.

## Rendimiento medido

| Artefacto | Antes de esta tanda | Después |
| --- | --- | --- |
| JavaScript principal minificado | 922,71 kB | 492,40 kB |
| Principal gzip | 270,39 kB | 132,71 kB |
| Advertencia de chunk >500 kB | Presente | Ausente |

jsPDF y AutoTable se importan solo al confirmar una exportación PDF. Otros formatos
y la impresión conservan su flujo. Hay bloqueo de doble envío, estado Generando
y error controlado. En navegador se comprobó que recorrer los módulos no solicita
esas bibliotecas y que exportar genera un Blob válido con cabecera %PDF y tamaño
mayor a 1000 bytes. Los datos eran ficticios y las descargas del navegador de prueba
estaban denegadas. No es un benchmark de tiempos contra producción ni un ahorro de
tamaño total de todas las funciones: es carga inicial diferida.

## SQL y próximo módulo

[revision-transicion-permisos.md](revision-transicion-permisos.md) explica el ajuste
BIN2 en las comparaciones catálogo/matriz de 01/02/03 y del generador. Se cambiaron
sus huellas deliberadamente; la matriz continúa con 19 tablas/48 operaciones/118
llamadas SQL. El manifiesto registra 112 fuentes. Ningún script se habilitó o
ejecutó. La copia V2 que aplicó el usuario no estaba adjunta como archivo local;
no se presume equivalencia de bytes. No repetir concesiones ya confirmadas.

[propuesta-notificaciones.md](propuesta-notificaciones.md) separa alertas operativas,
bandeja personal, preferencias por usuario y políticas empresariales. Incluye
entidades conceptuales, permisos, idempotencia, privacidad, fases y pruebas. No
agrega DDL, endpoints, almacenamiento ficticio ni envío externo.

## Pruebas finales reales de esta tanda

| Comprobación | Resultado |
| --- | --- |
| Backend npm test | 157/157 aprobadas, cero omitidas |
| Frontend npm test | 42/42 aprobadas, cero omitidas |
| Navegador completo con API interceptada | 27/27 aprobadas, cero omitidas, incluido contenedor |
| Navegador prioridades y PDF | 7/7 aprobadas; luego cubiertas nuevamente por la suite completa |
| Build frontend | Correcto; sin advertencia de tamaño |
| Lint frontend | Correcto, sin errores |
| Lint backend sobre archivos afectados | Sin errores; advertencia preexistente no-ex-assign en registro de eventos de ReservaService |
| Sintaxis | 149 JS backend y 26 JS frontend correctos; JSX por build/lint |
| SQL real Azure o local | NO ejecutado; no reutilizar resultados anteriores como pruebas nuevas |

La suite incluye sesiones, 401/403, revocación, cambio obligatorio, último Admin,
permisos económicos, borradores y concurrencia aislada de Configuración. El navegador
verifica login a Inicio, ambos roles, Mi cuenta, Usuarios, los tres temas y 320/390/
820/1280 px; también altura reducida de 400 px, sidebar colapsada y menú móvil.
Las capturas en revision/tanda-integral/capturas contienen exclusivamente fixtures.
Se revisaron visualmente capturas del modal, panel desktop/móvil y lectura empresarial.
No se acredita una prueba manual real con Azure ni compatibilidad probada en Safari.

## Estado de Git y archivos

Ambos repositorios continúan en main con sus HEAD previos. No se hizo fetch,
staging, commit o push; no se declara sincronización actual del remoto sin consulta.
El inventario compartible inventario-tanda-integral.json distingue archivos previos
preservados byte a byte, previos modificados dentro de esta tanda y nuevos, con
SHA-256. Incluye todos los pendientes, no solo los cambios de esta sesión.
La evidencia inicial/final completa queda además en revision/tanda-integral.
Los .env y dependencias no forman parte del inventario ni de las capturas compartibles.
Total final: 51 archivos pendientes backend y 35 frontend, incluyendo sus índices.
Los inventarios diferencian estos pendientes de los cambios nuevos de esta sesión.

## Retomar exactamente

1. Revisar informe, inventario, diffs y capturas locales. Los cambios permanecen sin
   publicar; cualquier commit/push requiere autorización nueva.
2. El usuario inicia frontend/backend personalmente con los comandos temporales de
   [activacion-configuracion-empresa.md](activacion-configuracion-empresa.md), siempre
   HOSTFLOW_AUTH_SOURCE=sql, HOSTFLOW_EMPRESA_ID=1 y READ_ONLY=1 para la prueba real.
   No editar .env, reiniciar por el agente o repetir C/D/E.
3. Probar visualmente primero Configuración en lectura. El modal de Huéspedes puede
   consultarse por su GET seguro si se autoriza; no usar Ver reserva o abrir FlowIA
   para validar contra Azure porque sus destinos pueden escribir automáticamente.
4. Autorizar por separado cualquier campo/valor empresarial a guardar. Retiro de
   roles SQL amplios y pruebas nuevas de motor también requieren autorizaciones
   independientes. Conservar los datos y las cuentas existentes.
5. Para repetir todo localmente: backend npm test; frontend npm test, npm run lint,
   npm run build y npm run test:browser. El navegador crea/cierra su proceso temporal
   y usa API interceptada; nunca ejecutar test:inbound/test:channels contra el puerto
   del servicio real. La variable de prueba HOSTFLOW_TEST_PRIORITY_ONLY=1 permite
   ejecutar solo las tres prioridades y la exportación, no la regresión completa.

Siguiente paso recomendado: revisión visual personal de las tres prioridades y
aprobación del primer guardado empresarial concreto. Después iniciar Notificaciones
con las decisiones funcionales del documento, manteniendo separada la transición
de permisos mínimos y su prueba de motor pendiente.
