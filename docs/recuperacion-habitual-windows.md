# Recuperación habitual desde Windows — preparada, todavía no activada

Se reutilizan Node, Azure SQL, Resend, Pages, el Tunnel y la custodia existentes.
No se contrató alojamiento. El piloto público ya acreditado y sus recibos 2/2 se
conservan: este modo no los reinicia, renombra ni utiliza. No ejecutar nuevamente
el piloto para activar este modo.

## Política pendiente de aprobación operativa

Solo Operadores activos, con contacto vigente/verificado e ID incluido en una
lista privada aprobada. Empresa fija 1; nunca confiar en IDs enviados por cliente.
Administradores, invitaciones, registro, Google, planes y pagos quedan fuera.
Un correo desconocido o no autorizado recibe la misma respuesta neutral 202.
El enlace dura 15 minutos, viaja en el fragmento y se consume una vez; se conserva
la invalidación de sesiones y el aviso de seguridad del código acreditado.

Propuesta explícita, no activada: por 24 horas, máximo 6 intentos por cuenta y
destino, hasta 3 de recuperación y 3 de aviso; máximo global 100 en total. Las
cuotas cuentan **intentos**, incluidos reintentos conocidos, no entregas. Si hay
errores del proveedor, podrían no completarse tres recorridos. Avisos y otros
destinos no quedan detrás de una recuperación sin cupo: se omiten únicamente en
la pasada actual, sin cambiar la fila ni reintegrar cuotas; lectura acotada a 200.

Persistencia en `authcom.Cuotas`, namespaces `correo-habitual-total-v1`,
`correo-habitual-recuperacion-v1` y `correo-habitual-aviso-v1`; claves HMAC sin
emails. Reserva exacta de outbox y ambas admisiones en la misma transacción
SERIALIZABLE, con el applock existente. Rechazo de cuota revierte también lease e
intento. Reiniciar no devuelve cupo; vence naturalmente. Se mantienen además
cuotas de solicitudes/validación/confirmación e IP existentes. No hay migración,
principal nuevo ni ampliación de permisos. Los namespaces requieren aprobación
de esta política operativa: no son una vía para continuar el piloto agotado.

## Inicio cotidiano, después de autorizar y acreditar la primera activación

Cuenta requerida: `PC-ESCRITORIO\Kepa`. Configuración privada nueva y sin secretos:
`C:\Users\Kepa\AppData\Local\HostFlow\RecuperacionHabitualV1\configuracion.json`.
La plantilla incluida en el expediente está bloqueada y no inicia servicios.
No se creó esa configuración operativa ni se accedió a secretos durante la
preparación. Para la primera activación hay que aprobar los IDs y límites y
confirmar PITR/restauración, exclusividad, remitente y disponibilidad personal.

Requisito local encontrado, sin cambios de permisos: el archivo de credencial
`C:\Users\Kepa\.cloudflared\03a9247c-8e33-45f3-8964-518d9333bca3.json` tiene
propietario Kepa y permisos heredados para Kepa, SYSTEM y Administradores de
Windows. No se detectaron permisos para usuarios comunes, pero no cumple la
regla estricta usada por este lanzador: ACL sin herencia, únicamente Kepa y
SYSTEM. Hace falta autorizar ese ajuste local **solo de ACL del archivo**,
conservando contenido/propietario y guardando la ACL anterior; no rotar la
credencial ni cambiar Cloudflare. El arranque lo rechaza antes de pedir maestro,
abrir SQL o crear la sesión. Esa modificación no se ejecutó en esta tarea.

Desde la carpeta backend, solo tras esa autorización:

```powershell
& 'D:\Node\node.exe' .\scripts\prepararRecuperacionHabitual.js --operadores '3' --confirmacion OPERADORES_LIMITES_Y_ACTIVACION_HABITUAL_APROBADOS --preparar
```

`3` es una propuesta para comenzar con la cuenta ya acreditada, no una
autorización nueva. Para incorporar otro Operador se requiere aprobar su ID y
verificar su contacto/rol. El preparador rehúsa sobrescribir configuraciones.

Después, abrir `scripts\windows\IniciarHostFlow.cmd`. Pedirá el maestro operativo
por entrada oculta una vez. No copiarlo al chat, entorno, argumentos o accesos
directos. La custodia abre los mismos crypto/SQL/Resend y exige RECUPERACION.
Los cuatro perfiles y TLS estricto se conservan. Preflight dirigido solo SELECT
antes de iniciar: usuarios autorizados, trabajos pendientes, leases y cuarentenas.
Una cola ajena, incierta o demasiado grande bloquea, sin limpiarla ni reenviarla.

Se comprueba ausencia de otra instancia/puertos 4000 y 20241, ACL del `.env`,
binario Cloudflare fijado por SHA256, DNS obtenidos de Windows, TLS local con CA y
huella exactas e ingress offline. No se cambian DNS del sistema ni Cloudflare.
Se crea un certificado por sesión y un ingress de sesión nuevos en la raíz
privada, sin sobrescribir anteriores. Certificado válido 24 h: **sin ventana
artificial de 30 minutos**, pero debe cerrarse/reiniciarse normalmente antes de
su vencimiento. La API se sella un minuto antes si sigue encendida. No hay
renovación automática ni promesa de disponibilidad si PC/red/proveedor fallan.

Cloudflare se abre en su **propia ventana**, con entorno mínimo sin secretos de
Node. Un observador PowerShell original espera su salida; no usa ExecutionPolicy
Bypass, compilación nativa ni señales forzadas. Después de `/ready` y siete GET
públicos recientes y seguros, se habilitan el worker y las escrituras normales.
Antes, capacidades informa recuperación desactivada y los POST están bloqueados.
Esperar `HOSTFLOW_HABITUAL_DISPONIBLE`. Un error sella y solicita cerrar Tunnel;
no reinicia automáticamente ni declara la disponibilidad por un mock.

## Cierre diario y fallos

Abrir `scripts\windows\ApagarHostFlow.cmd` para consultar instrucciones/estado.
En la ventana **Cloudflare**, Ctrl+C una vez. Esperar `HOSTFLOW_CERRADO` en Node:
primero termina Tunnel, después se drenan HTTP/worker, cierran pools y liberan
claves en memoria. Cerrar la ventana Node solamente después. Ctrl+C en Node
primero sella los envíos y solicita cerrar la ventana Cloudflare; no la mata.
No usar X, taskkill, Stop-Process o apagar Windows mientras drena.

Un resultado incierto pausa: no reenviar ni reiniciar para "probar". Si falta
confirmación de cierre, conservar terminal y `sesion-activa.json`; el próximo
arranque se bloquea. Tras una caída, `recuperarCierreHabitual.js` solo permite
archivar ese candado con PID anterior muerto, servicios/puertos libres, ACL e
identidad válidas; requiere `--confirmacion CIERRE_ANTERIOR_VERIFICADO`. No elimina
filas, presupuestos, claves ni recibos. Diagnosticar antes cualquier incertidumbre
de correo. No declarar cerrada una sesión porque un proceso dejó de responder.

## Login, Dashboard y límites de alcance

Se conserva el login/JWT real. La lista de Operadores limita la recuperación,
no sustituye permisos de sesión. La ruta pública de este modo solo permite
auth login/me/logout, capacidades y recuperación; negocio y uploads siguen
bloqueados en Tunnel y backend. **No habilita el Dashboard público completo.**
El mensaje de inicio sin datos de negocio sigue siendo esperable en ese alcance.
El modo normal anterior y sus permisos no se alteran; no ejecutar dos hosts en
puerto 4000. Abrir negocio públicamente requiere una revisión y autorización
distintas; no se lo hizo para ocultar el mensaje del piloto.

## Evidencia y publicación

Pruebas nuevas: política/HTTP/TLS, dos operadores ficticios, cuotas con
concurrencia/reinicio/rollback en dobles de memoria, contrato SQL, orquestación,
cierre incierto y proceso Windows ficticio. **No acreditan concurrencia real de
SQL Server ni nuevas entregas reales.** La prueba pública anterior sigue válida
como evidencia histórica del circuito; este modo nuevo requiere una activación
supervisada propia tras aprobación. No tocar el presupuesto histórico 2/2.

Antes de publicar: revisar el paquete aislado contra V2 y remoto vigente, excluir
registro/Google/planes y secretos, aprobar IDs/límites/activación y publicar solo
el commit selectivo que se revise. Reversión: cerrar normalmente, conservar
configuración, colas, cuotas y evidencias; volver al código V2 revisado sin reset,
sin borrar datos ni reactivar el piloto agotado. No hay DDL que revertir.

Limitación de mantenimiento: no se hace limpieza general de outbox ajenas o
caducadas. Una política de retención y reconciliación de cuarentenas requiere
autorización independiente; no borrar sobres para desbloquear un arranque.
