# Autenticación comercial — núcleo aislado de Fase 1

Estos componentes **no están importados por app, server, controladores ni rutas**.
No habilitan recuperación, registro ni invitaciones en HostFlow operativo.
No contienen adaptador SQL, correo real, timers ni lectura de variables de entorno.

## Componentes y límites

- `credencialesTemporales.js`: 32 bytes aleatorios, base64url canónico, SHA-256 ligado al propósito; HMAC para índices privados de límites; AES-256-GCM para la outbox con AAD por ID de entrega.
- `AutenticacionComercialService`: emisión, consumo, revocación, recuperación y altas por invitación; dependencias obligatorias, sin singletons ni almacenamiento por defecto.
- `EntregaCorreoSeguridad`: una entrega por invocación, lease, clave idempotente y resultado sanitizado. El proceso que lo ejecute deberá controlar presupuesto, timeout, apagado y métricas.
- `tests/helpers/cuentasComercialesAisladas.js`: doble transaccional **solo para pruebas**. Su mutex/snapshot no acredita garantías de Azure SQL ni es persistencia de producción.

La política conservadora de esta fase recupera únicamente Operadores activos con correo previamente verificado. No se atribuye verificación a usuarios legacy por tener un email. Administradores requieren una política reforzada todavía pendiente de aprobación. Invitaciones solo crean Operadores nuevos; no alteran una identidad existente, asignan membresías ni habilitan otra empresa. Los roles se resuelven en servidor, nunca por IDs fijos ni datos del formulario.

`idEmpresa` es contexto fijo confiable de la instalación, no aislamiento multiempresa. No debe aceptarse desde body, query o JWT. Antes de integrar hay que acreditar que la instalación sigue atendiendo una sola organización; no habilitar una segunda con este núcleo.

## Uso previsto, todavía no montable por HTTP

```js
const servicio = new AutenticacionComercialService({
  repository: repositorioDurableRevisado,
  protector: protectorConClavesEnVault,
  indicePrivado: indiceConClaveIndependiente,
  origen: origenHTTPSConfiguradoPorServidor,
  idEmpresa: contextoFijoDeInstalacion.idEmpresa,
});
```

Nunca pasar un repository de memoria en producción ni reutilizar `JWT_SECRET` como clave de cifrado/HMAC. El cifrador actual recibe una clave y keyId explícitos. Rotación con lectura de claves antiguas, custodia y retiro de sobres pendientes requieren un adaptador de vault/keyring posterior.

Contratos de dominio:

| Método | Entrada y salida |
| --- | --- |
| `solicitarRecuperacion({email}, {ip})` | Siempre objeto nuevo `{status:202,mensaje}` neutral. No token/usuario/estado de entrega. |
| `invitar(actor, {nombre,email}, {ip})` | Actor autenticado con `idUsuario/versionSesion`; se relee en servidor. Misma respuesta 202 para destino existente, duplicado o cuota suprimida. |
| `confirmarRecuperacion({token,passwordNueva}, {ip})` | `{status:204}`; nunca JWT. Error genérico de enlace para inválido/vencido/usado/revocado. |
| `aceptarInvitacion({token,passwordNueva}, {ip})` | Igual contrato; identidad nueva solamente. Nombre/rol/email proceden de la invitación, no de la aceptación. |
| `revocarInvitacion(actor,id)` | Admin vigente, contexto fijo; 204 sin revelar existencia. |

`ip` debe provenir de la conexión/proxy configurado como confiable. El futuro controlador no debe tomarlo del JSON ni confiar en X-Forwarded-For arbitrario. Normalizar IPv6/equivalencias y prefijos antes de limitar abuso distribuido. Las cuotas actuales son valores iniciales revisables: ventana 15min, 20/IP, 3/destino al solicitar/invitar (cooldown 60s), 5/token al confirmar, 100 globales por tipo de operación. Son compartidas **solo si el adaptador durable cumple el contrato**. El límite de confirmación se confirma en transacción separada para que los intentos inválidos no restituyan el presupuesto por rollback.

**Canal temporal pendiente:** la respuesta de dominio es neutral, pero su duración incluye una búsqueda de cuenta y puede diferir. No publicar `solicitarRecuperacion` directamente como handler HTTP. Antes se necesita ingreso durable asíncrono que encole solicitudes válidas de forma uniforme, responda 202 antes de buscar usuarios, mida posibles diferencias de latencia y procese con límites compartidos. No resolver con sleeps ni prometer tiempo constante. Las fallas de almacenamiento también necesitan política uniforme y métricas sin PII. Añadir límites de borde/ingreso y de aceptación para proteger cola, cifrado y bcrypt; el límite del núcleo no sustituye esas capas.

## Puerto transaccional obligatorio

`repository.transaccion(callback)` entrega `tx`, garantiza commit único y rollback completo, y propaga fallos. **No debe reintentar callbacks automáticamente**, especialmente ante commit incierto. Todo método siguiente actúa dentro de esa misma conexión/transacción. Lecturas devuelven copias, no referencias mutables al almacenamiento.

| Método tx | Garantía exigida al futuro adaptador |
| --- | --- |
| `empresaActiva(id)` | Booleano, contexto fijo vigente. No infiere pertenencia de usuarios ni primera empresa disponible. |
| `usuario(id)` / `buscarUsuario(email)` | Proyección vigente compatible con `esUsuarioHabilitado`: id, email normalizado, estado, rol/rolActivo, debeCambiarPassword, versionSesion; para reset también passwordHash y contacto verificado. Bloquear/revalidar según la operación. |
| `rolActivo(nombre)` | Resolver nombre asignable activo desde Roles; no asumir IDs. |
| `admitir({proposito,ahora,ip,destino,ventanaMs,maxIp,maxDestino,maxGlobal,cooldownMs})` | Comprobar/actualizar contadores compartidos atómicamente, devolver booleano; índices HMAC sin IP/email claros. Controlar cardinalidad y purgar ventanas vencidas. |
| `invitacionPendiente(email,idEmpresa,ahora)` | Duplicados protegidos también frente a emisiones simultáneas; no basta una consulta sin bloqueo. |
| `insertarDesafio(d)` | Hash único; propósito cerrado; fechas UTC; estado inicial nulo; snapshot de identidad/contacto o invitador. Nunca token claro. |
| `desafio(hash,proposito)` | Recuperar desafío y preparar bloqueo consistente para consumir; revalidar siempre caducidad, empresa, revocación y consumo. |
| `consumir(id,ahora)` | UPDATE condicionado: vigente, no consumido/revocado; exactamente una fila cambia. Devuelve **true** solo si ganó. |
| `revocarRecuperaciones(usuarioId,ahora)` | Invalidar todos los reset pendientes del usuario; no revocar el ya consumido ni otras finalidades. |
| `revocarInvitacion(id,idEmpresa,ahora)` | Solo invitación del contexto fijo; nunca cambiar desafíos de reset. |
| `restablecerPassword(datos)` | CAS por versión vigente; cambiar hash y flag obligatorio, incrementar VersionSesion exactamente una vez. Devuelve **true** solo si cambió una fila. Conservar rol, estado, contacto y demás datos. |
| `crearInvitado(datos)` | Unicidad global de email normalizado; resolver Operador activo en SQL. Crear cuenta nueva y contacto verificado en la misma transacción, conservar actor de alta. Devolver ID positivo real. No crear empresa ni membresía. |
| `encolar({id,desafioId,expiraEn,sobre})` | Outbox durable con payload cifrado; parte del commit de emisión/reset/aceptación, nunca envío de red dentro de la transacción. |
| `auditar(evento)` | Registro durable en el mismo commit, sin token, password, cuerpo de correo ni error crudo. |

Unificar el orden de locks y compartir el recurso de seguridad vigente `HostFlow:Seguridad:AdministradoresActivos` con las operaciones de cuentas actuales. Proteger los rangos de email/invitaciones y los desafíos con locks/índices adecuados. Evitar anidar `UsuarioService`/`UsuarioRepository.transaccionSeguridad` como una segunda transacción independiente. El hash bcrypt se calcula fuera del bloqueo y el desafío/contacto/actor se **vuelven a comprobar dentro** antes de consumir.

`emailVerificadoEn` y `versionContacto` son una **proyección del contacto de autenticación verificado**, no del huésped. No existen hoy en la proyección operativa de usuarios; su ausencia bloquea reset de forma segura. La migración debe elegir una sola autoridad, preferentemente `ContactosVerificados` como la propuesta, y no mantener flags contradictorios en dos tablas. Cambiar/revocar correo incrementará su versión y revocará desafíos. No hacer backfill automático de verificación para cuentas existentes.

## Puerto de entrega

`tx.reservarEntrega({ahora,lease,leaseMs,maxIntentos})` reclama atómicamente una entrega o devuelve null. Debe excluir/purgar payloads vencidos, consumidos o revocados, respetar próximo intento, lease y máximo de intentos. `tx.finalizarEntrega({id,lease,exito,ahora,reintentoMs,maxIntentos})` compara lease vigente y devuelve booleano; elimina sobre sensible al éxito/agotar intentos y programa siguiente intento al fallo.

`proveedor.enviar({destinatario,plantilla,enlace?,evento?,idempotencyKey})` debe rechazar fallas y no escribir payloads en logs. Plantillas cerradas: recuperacion, invitacion, seguridad-cuenta. Escapar contenido, fijar remitente/dominio verificado y aplicar timeout/cotas en el adaptador real. Repetición de envío por caída después de entregar es posible: **no hay promesa de exactly-once del correo**. Un proveedor/adaptador con idempotencia duradera debe deduplicar por ID de outbox; el enlace sigue siendo de un solo uso aunque se entregue duplicado. El lease no reemplaza idempotencia. Las fallas del worker no se trasladan a respuestas públicas.

Una revocación concurrente con un envío ya iniciado puede dejar llegar un enlace inválido; el consumo transaccional debe rechazarlo. La entrega de un correo no significa que la cuenta ya haya sido recuperada. El aviso posterior de seguridad no incluye contraseña ni token.

## Esquema e integración pendientes de autorización

No se incluye ni ejecuta DDL en esta fase. Preparar una migración aditiva revisada para:

1. Desafíos de cuenta: PK aleatoria, hash binary(32) UNIQUE, propósito, FK usuario o invitación, empresa fija, versiones/contacto, expiración/consumo/revocación.
2. Invitaciones: destino normalizado, nombre, rol Operador resuelto, invitador y versión, empresa, estado. Unicidad de pendientes por email/contexto con transición explícita de expirados/revocados; no usar GETDATE en predicado de índice filtrado.
3. Contactos de autenticación verificados: destino, versión, fecha y revocación, FK usuario. Conservar usuarios/hashes/roles existentes sin atribuirles verificación ficticia.
4. Outbox cifrada: keyId, IV, tag, contenido, FK desafío nullable, expiración, estado, contador, próximo intento y lease. Retención/purga de datos sensibles definida.
5. Cuotas durables y auditoría de seguridad con índices, retención y límites de cardinalidad.

Antes de Azure: adaptador SQL y pruebas de carreras/rollback/commit incierto en motor aislado; migración revisable, respaldo/recuperación, permisos mínimos y autorización separada. No modificar el modelo de autoridad JWT ni sesiones hasta esa integración. El reset futuro revoca JWT existentes mediante VersionSesion, ya comprobada por el middleware vigente.

Después: proveedor/dominio SPF-DKIM-DMARC, vault y rotación de claves, ingreso asíncrono, feature flags cerrados, endpoints y páginas nuevas sin analytics, `no-store`, `Referrer-Policy: no-referrer`, fragmento eliminado del historial y ausencia de tokens en logs/localStorage. GET no consume: solo confirmación POST. Invitar/aceptar identidades existentes, registro público, WhatsApp y multiempresa quedan fuera de Fase 1.
