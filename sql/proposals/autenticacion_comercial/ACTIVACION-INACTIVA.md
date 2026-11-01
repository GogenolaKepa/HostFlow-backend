# Montaje comercial preparado — todavía inactivo

La instalación Azure original 01→12→13→04→06→08 ya fue aceptada: NO repetirla.
Sus fuentes bloqueadas se conservan sin cambios. La integración del producto está
cableada, pero deshabilitada por defecto. Nada comercial se activa con npm run dev.

## Identidades: otra autorización, posterior a aceptar la instalación

16 propone cuatro usuarios Entra mediante nombre y objectId explícitos, con todos
los parámetros vacíos y tres aprobaciones a0. No genera contraseñas, consulta Entra
ni inventa identidades. SID/TYPE evita la consulta al directorio, por lo que un
administrador debe verificar personalmente cada objectId y el tenant antes de usarlo.
No prueba que esa identidad pueda autenticarse. [Sintaxis de Microsoft](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-user-transact-sql).

17 requiere usuarios recién preparados, marcas de perfil, propietario separado y
ocho DENY de aislamiento. Rechaza roles/grants/propiedades previos; concede mínimos
por tabla/columna y visibilidad de metadatos para comprobar negativos sin interpretar
NULL como denegación. No cambia hostflow_app, no concede DELETE ni roles generales.
No intenta GRANT sobre sp_getapplock ni modifica master: se acredita el bloqueo de
public en la aceptación; si no está disponible, detener la activación.

Se conserva la separación de03/05: ingresoHttp (cola pública), workerIngreso
(procesamiento), cuentas (confirmación y administración de invitaciones) y correo.
La administración exige además Administrador/usuarios.crear en el servidor.
INSERT Usuarios sigue teniendo autoridad SQL más amplia que Operador; el servicio
limita el rol. Aceptar ese límite antes de aprovisionar. No se añadió un quinto pool.

16 es una opción Entra sin secretos versionados. Si se elige autenticación SQL,
el alta de usuarios/contraseñas requiere otro procedimiento seguro autorizado;
no sustituir TYPE E ni pegar passwords en el archivo. Runtime admite ambas opciones.

## Conexiones y cierre

PoolsComercialesPreparados recibe driver mssql/Tedious e identidades explícitas.
Nunca lee .env/database.js. Usa cuatro pools, destino Azure fijo, TLS validado y
errores sanitizados. obtenerCredencial es un callback futuro de un gestor seguro,
no implementado con archivos ni memoria de producción. Para SQL devuelve user/password;
para Entra, token/expiraEn. No registrar esos objetos. Tokens Entra deben renovarse
reconstruyendo el runtime antes de caducar; no hay renovación automática acreditada.

RuntimeComercialPreparado reutiliza el ensamblado existente, verifica modelos y
permisos, cierra conexiones ante fallo parcial y no inicia workers al preparar.
consultar() devuelve solo estado agregado de pools y supervisor. desactivar()
cierra lógicamente el acceso; cerrar() espera el worker/operación y cierra pools.
Si el cierre falla, informar CIERRE_INCOMPLETO e inspeccionar; no declarar apagado.

Diagnóstico offline actual, sin conexiones ni secretos, desde backend:

```bash
node scripts/preflightAuthComercial.js --offline
```

No carga .env. Por defecto informa inactivo. Con configuración pública explícita
puede detectar datos incompletos, pero nunca certifica SQL/correo ni activa nada.
Los nombres de los cuatro principales usan HOSTFLOW_AUTHCOM_{INGRESO,
WORKER_INGRESO,CUENTAS,CORREO}_PRINCIPAL y HOSTFLOW_AUTHCOM_SQL_AUTH=sql|entra.
El resto del parser existente usa HOSTFLOW_AUTH_COMERCIAL_ENABLED/ORIGEN/REMITENTE/
DOMINIO/LIMITE_DIARIO y el destino/empresa actuales. No definir secretos en Vite.

## Cableado incorporado, activación pendiente

1. Tras aceptar infraestructura, construir RuntimeComercialPreparado con configuración,
   cuatro identidades, callback seguro, claves de cifrado/HMAC independientes,
   proveedor, autenticador JWT existente y acreditaciones documentadas.
2. ProductoComercial/servidor.iniciar({comercial}) ya componen el runtime y pasan el
   router a crearApp, **después de CORS y antes del JWT global**. Requiere aprobacion,
   configuración válida y dependencias explícitas. Sin ellas no hay router comercial.
   Un fallo comercial deja disponible el login y expone solo estado sanitizado.
3. Iniciar explícitamente runtime.iniciarWorker() bajo supervisión. No esperar esa
   promesa para iniciar HTTP: dura hasta detener el supervisor. Capturar rechazo y
   desactivar. Capacidades/HTTP permanecen cerrados sin cuatro pools conectados y
   worker activo; HTTPS y origen se comprueban en cada petición.
4. main/App ya retiran el fragmento antes de React y manejan enlaces reabiertos;
   Login, Usuarios y Mi cuenta están conectados a capacidades del servidor. No se
   muestran controles comerciales si falta esa acreditación. Bearer solo en
   administración y verificación autenticada de contacto, nunca recuperación pública.
   Cliente y correo deben compartir un origen HTTPS con /api encaminada al backend.
5. Configurar proxy confiable explícito; no aceptar X-Forwarded-Proto de cualquiera.
   Validar CORS, CSP/referrer del HTML, límites del borde y tiempos anti-enumeración
   bajo carga antes de aprobar producción. Las cabeceras del router JSON no protegen
   por sí solas el HTML que entregue el hosting.

App/server/Login/Usuarios/main ya tienen puntos de inserción inactivos. No hay un
comando seguro que complete por sí solo identidad/secretos/acreditación. No habilitar
comercial con una bandera frontend. El host debe aportar proxiesComerciales con IPs
exactas del borde que reemplaza headers, o TLS directo acreditado; no trust proxy=true.
servidor.comercial.iniciarWorker() es explícito y no debe esperarse como arranque finito;
servidor.cerrarHostFlow() drena comercial antes de cerrar el listener propio.

## Verificación de contactos existentes

20 es un DDL posterior bloqueado: amplía tres CHECK para propósito contacto y su
auditoría, sin nuevas tablas ni backfill.21 es DCL separado: solo UPDATE de Email,
VersionContacto,VerificadoEn,RevocadoEn para el perfil cuentas previamente acreditado.
No cambia IdUsuario ni hostflow_app. Ambos se ensayaron solo con SQLCMD local;
no acreditan aún el recorrido Node/Tedious→motor.

Activar sql.verificacionContactos=true exige modelo20 y permisos21 comprobados.
El Operador autenticado reintroduce su contraseña; el enlace prueba su correo
actual y vuelve a exigir sesión vigente de esa misma cuenta. Consumo, contacto,
revocación de recuperaciones previas y auditoría son una transacción. El enlace
de contacto no es un token de recuperación ni de invitación. No cambia email/password.
Cambiar email/estado/sesión invalida el enlace. No hay recuperación autónoma Admin.
Un usuario legacy sin contraseña/sesión necesita un procedimiento administrativo
separado de identidad y recuperación, no auto-verificación por copiar su email.
Nuevos Operadores verifican el contacto al consumir la invitación, sin20/21.

Parada futura: cerrar ingreso externo → runtime.desactivar() → await runtime.cerrar()
→ cerrar listener propio. Conservar outbox/cuarentena y claves previas para descifrar;
no borrar datos ni reintentar resultados inciertos. SELECT10 ofrece métricas agregadas
de cola/leases/cuarentena, después de verificar identidad/modelo.07 necesita política
de retención y autorización separadas; no es reparación automática.

## Resend: infraestructura pendiente

Elegir un subdominio propio de correo transaccional, aprobar cuenta/dominio y copiar
los valores DNS exactos de Resend con el responsable DNS. Verificar SPF/DKIM y acordar
DMARC antes de endurecerlo; no inventar registros ni alterar un SPF existente a ciegas.
Remitente/origen fijos, tracking desactivado para enlaces de cuenta, API key de envío
con mínimo alcance en gestor seguro. [Dominios verificados](https://resend.com/docs/dashboard/domains/introduction).

El adaptador ya cubre timeout (incluido gestor de secreto), mismo ID/payload, errores,
presupuesto e integración con outbox. La ventana local de23h conserva margen frente
a las24h de idempotencia del proveedor. No reenviar después de incertidumbre sin
inspección. [Idempotencia oficial](https://resend.com/docs/dashboard/emails/idempotency-keys).

API aceptada no equivale a entrega en bandeja. EntregaCorreoSeguridad ya permite
conectar EventosCorreoSql: HMAC de destino antes del POST, supresión, correlación
del ID aceptado y pausa sin reenvío si no se acredita el vínculo. Requiere19 y DCL
de eventos aparte, aún pendientes. No se creó webhook público: necesitará
cuerpo crudo, firma verificada, control de replay y persistencia adecuada revisada;
ninguna migración adicional está autorizada. El primer piloto puede observarse de
forma supervisada en proveedor/bandeja, sin declarar resuelto el manejo de rebotes.
[Verificación de webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests).

El enrolamiento de contactos legacy y la recuperación reforzada Admin no están
habilitados. No marcar correos históricos como verificados ni crear registro público.

## Complemento local de cierre (31/10/2026)

La matriz concreta, sus límites y la alternativa18 se encuentran en
[MATRIZ-PERFILES-Y-ACEPTACION.md](MATRIZ-PERFILES-Y-ACEPTACION.md).
18 no se incorpora a01–15 ni16/17 automáticamente: necesita DDL y DCL propios.

La entrega revalida lease/desafío tras descifrar y, en Resend, otra vez después de
obtener el secreto y antes de iniciar el transporte. Previene envíos que quedaron
obsoletos durante esas esperas. No vuelve atómicos SQL y una red externa: una
revocación posterior a la última comprobación no puede retirar un correo en vuelo;
el enlace se vuelve a validar al confirmar y nunca otorga una sesión por sí mismo.
Antes de todo POST el worker común registra RESULTADO_INCIERTO bajo lease, incluso
sin eventos opcionales. La finalización conocida sustituye esa marca; ante caída,
vencimiento o revocación no se elimina el sobre como si no se hubiera enviado.
La ampliación utiliza CodigoFallo de08 ya instalado, sin DDL nuevo.
Un resultado incierto previo conserva su evidencia. Estado interno entregada de la
outbox significa aceptación API en el contrato actual, NO llegada a bandeja.

EventosCorreoPreparados verifica cuerpo crudo, firma HMAC-SHA256 de Svix, fecha de
intento (±300s) y claves vigente/anterior; proyecta solo ID de evento, ID proveedor,
tipo, fecha y huella SHA256 de los bytes firmados. No existe endpoint ni esquema
durable de eventos instalado en Azure. El
receptor permanece inactivo y exige un puerto SQL durable antes de procesar.
[Contrato oficial Resend](https://resend.com/docs/webhooks/verify-webhooks-requests),
[algoritmo y vector Svix](https://docs.svix.com/receiving/verifying-payloads/how-manual).

La continuación preparó19_eventos_correo_bloqueados.sql y EventosCorreoSql, siempre
inactivos.19 añade CorreoMensajes/CorreoEventos/CorreoBloqueos, no modifica las siete
tablas originales ni concede permisos. El adaptador comparte el puerto transaccional
existente, exige su marca y almacena eventos sin correlación; no adivina qué outbox
corresponde a una aceptación incierta. Vincular la misma aceptación drena lotes100
de pendientes. Huella incompatible para el mismo ID se rechaza. Supresión es monotónica:
un delivered posterior no reactiva un destino con queja/rebote. No hay reenvío por evento.

Pendiente antes de abrir un webhook: aprobación/instalación19, DCL mínima propia,
correlación real con el ID devuelto por Resend (y conciliación supervisada si no se
recibió respuesta), invocación explícita del sender antes de enviar y al aceptar,
retención y aceptación Node/Tedious. Una marca declarativa del puerto no acredita
esas propiedades. La prueba SQL local validó el SQL exacto de aplicación y restricciones;
no acredita el recorrido íntegro de registrar/vincular mediante el driver contra motor.

Permisos adicionales propuestos, SIN GRANT aplicado: sender SELECT/INSERT/UPDATE
CorreoMensajes, SELECT/UPDATE CorreoEventos, SELECT/INSERT CorreoBloqueos; receptor
SELECT/UPDATE CorreoMensajes, SELECT/INSERT/UPDATE CorreoEventos, SELECT/INSERT
CorreoBloqueos. Receptor no recibe Outbox, Contactos ni Usuarios. Necesita identidad
propia aprovisionada/autorizada; no reutilizar hostflow_app o HostFlowAdmin. Mantener
la lectura de marca y transacción serializable/applock del puerto existente.
Destino debe provenir de HMAC de email normalizado con clave estable gestionada,
no hash simple. Cambiar esa clave requiere conciliación de bloqueos: no rotarla como
si fuera una clave de cifrado de outbox. No existe desbloqueo automático.

Falta recepción HTTP (raw body antes de express.json, límite y firma, 2xx solo tras
commit durable, 503 sanitizado ante incertidumbre, sin reenviar SQL/email a ciegas).
No se montó esa ruta ni se añadió otra identidad al runtime actual de cuatro pools.
Queja/rebote permanente debe bloquear nuevos envíos al contacto sin reactivarse por
un evento delivered viejo; delivery_delayed no debe generar otro correo por su cuenta.
No almacenar cuerpo, destinatarios ni asunto en el registro de eventos. El hash del
evento puede servir para detectar un mismo ID con contenido incompatible. No borrar
deduplicación antes de vencer la ventana de reintentos/replay aprobada.
[Tipos de evento](https://resend.com/docs/webhooks/event-types).

El comportamiento temporal se midió solo en HTTP aislado con cola ficticia, jitter,
concurrencia y cuotas. No demuestra latencia de Azure, correo, proxy o producción.
La integración Node/Tedious se ensayó con clases reales mssql para parámetros y
rollback, pero conexión física doblada. La instancia local Windows-only no ofrece
una credencial TDS autorizada para este recorrido. No usar un driver bloqueado,
cambiar Windows o SQL Server ni crear logins sin autorización nueva.
