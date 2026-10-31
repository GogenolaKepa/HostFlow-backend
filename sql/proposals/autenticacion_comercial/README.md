# Autenticación comercial — persistencia propuesta v1

## Dictamen administrativo vigente —31/10/2026

**COMPATIBLE para instalación supervisada; ejecución todavía no autorizada.** Se recuperaron los28
bloques administrativos completos de SSMS HostFlowAdmin/dbo (VIEW DEFINITION1).
Las34 columnas, EmailNormalizado persistido, seis CHECK, diez defaults, PK/FK e
índices de Usuarios/Roles/Empresas son compatibles con el candidato. No hay triggers
en esas dependencias ni RLS dirigidas a ellas; authcom y su propietario propuesto
están ausentes. Los bloques de módulos privilegiados/firmas no devolvieron objetos.
Los permisos efectivos leídos como dbo NO son permisos de hostflow_app.

El complemento15 se completó tras la reconexión personal: diez resultados íntegros,
sin repetir los28 anteriores. App hereda solo db_datareader/db_datawriter y public;
sin filas en la consulta de permisos peligrosos. dbo conserva propietario dbo;
dependencias entrantes solo de CHECK/columna, sin módulos SQL de usuario, sinónimos
relevantes ni RLS globales. Ninguna incompatibilidad exige cambiar el DDL/DCL.
Evidencia: complemento-admin.json y CIERRE-DEFINITIVO.json del informe externo.

Se conserva **01→12→13→04→06→08**, propietario SIN LOGIN y DENY dirigido al esquema.
No cambió el DDL/DCL anterior ni se aplicó en Azure. Ambas autorizaciones separadas
deben estar aprobadas antes de empezar01, con recuperación vigente, servicios
detenidos y ventana exclusiva. El aislamiento debe comprobarse antes de reabrir.
Informe, manifiesto y plan actuales fuera de Git:
`revision/compatibilidad-admin-authcom-2026-10-31/` del workspace padre.
Los apartados siguientes conservan checkpoints históricos, no el estado vigente.

## Aislamiento administrativo preparado —31/10/2026, checkpoint posterior

Secuencia vigente propuesta: **01 →12 →13 →04 →06 →08**. El DDL de las siete
tablas no cambió.12 crea hostflow_authcom_owner SIN LOGIN con autorización DDL;
13 cambia propietario del esquema y aplica ocho DENY solo a hostflow_app, con
autorización DCL independiente.14 prepara la aceptación de propiedad/permisos.
Fuentes bloqueadas con flags0/destinosNULL; ningún paso se aplicó en Azure.

La prueba nueva SQL Server descartable acreditó denegaciones en las siete tablas,
CRUD ficticio dbo conservado, objetos futuros y excepción de GRANT de columna.
DENY de esquema solo no evita una cadena con propietario común dbo. El propietario
separado corta ese puente; NO neutraliza dbo/sysadmin, módulos EXECUTE AS OWNER o
firmados con autoridad elevada. Revisar esas rutas y permisos de impersonación
antes de habilitar. Los cuatro pools comerciales no deben ser propietarios.

Lectura administrativa Azure pendiente: al abrir una consulta nueva desde SSMS,
la conexión automática HostFlowAdmin terminó en timeout. No se ingresó SQL ni se
automatizó autenticación. Los SELECT app nuevos no reemplazan definiciones completas.
Plan/evidencia actuales en revision/cierre-bloqueadores-authcom-2026-10-31/ del
workspace padre. El apartado anterior siguiente conserva el checkpoint previo.

## Candidato de revisión Azure — cierre del31/10/2026

Preflight real completado mediante mssql/Tedious12.7.5: HostFlow/hostflow/Engine5,
hostflow_app, TLS1.2 con certificado validado, compatibilidad170. Dependencias
visibles compatibles. **Dictamen administrativo pendiente:** VIEW DEFINITION=0;
defaults/CHECK/EmailNormalizado ocultos y ausencia global de authcom/RLS no acreditada.
El timeout documentado más abajo pertenece al checkpoint anterior y fue superado.

**Condición previa al DDL:** hostflow_app tiene db_datareader y db_datawriter.
Crear tablas amplía automáticamente su alcance al esquema nuevo. Resolver esa
exposición mediante una decisión DCL específica, sin quitar permisos operativos
de dbo a ciegas; cuatro identidades nuevas no corrigen ese acceso heredado.

Orden y fuentes DDL se mantienen **01 →04 →06 →08**, sin cambios de DDL en esta
revisión. Los archivos siguen bloqueados y ninguno fue ejecutado en Azure.
03/05 precisan los cuatro perfiles; cuentas necesita INSERT Outbox, no SELECT/UPDATE.
El montaje comprueba SELECT por columna de Usuarios/Roles/Empresas, sin exigir
lectura de tabla completa; EmailNormalizado es obligatorio y PasswordHash solo
pertenece al perfil cuentas. Regresión focalizada de cableado aprobada.
09 agrega visibilidad/collation/dependencias/FK por columna;11 compara cantidades
de estructura y marcas, complementando el detalle02/09. Referencia estática:
**7 tablas /57 columnas /14 índices /10 FK /27 CHECK /3 defaults /4 marcas**.
Igualar cantidades no sustituye comparar las definiciones completas.

El driver operativo Tedious funciona para SELECT de Azure y coincide con la
interfaz inyectable del adaptador. **No** acredita consumo, rollback o permisos
comerciales Node→SQL; la prueba local integrada sigue bloqueada por Windows.
No usar HostFlowAdmin ni hostflow_app como los cuatro pools de producción.

Plan, huellas del candidato, preflight y clasificación de publicación en
`revision/preparacion-migracion-authcom-2026-10-31/` del workspace padre, fuera de Git.
No activar HTTP/workers/correo ni interpretar este candidato como autorización.

## Estado actual: resiliencia08 preparada, 31/10/2026

Orden DDL: **01 → 04 → 06 → 08**. 07 es mantenimiento separado y ahora requiere08;
09 es solo lectura. No se ejecutó nada de esto en Azure. La combinación agrega
**siete tablas**: las cinco de01, Ingresos de04 e IngresoFallos de08. Se agregan
leases/Intentos a Ingresos y flags/códigos de cuarentena a Outbox.

El ingreso reserva un lease durable de120s antes del procesamiento; después,
desafío/outbox/auditoría/consumo se confirman en una única transacción que revalida
ese lease. Máximo3 claims incluso ante caídas. Backoff solo después de rollback
confirmado; commit incierto pausa y cierra el montaje. Cuarentena conserva sobres
y permite continuar con otras entradas. 07 no borra cuarentena ni resultados
inciertos. Su retención/liberación requiere revisión administrativa independiente.

Solo el perfil ingreso-http evita el applock de gestión de usuarios. Los workers
y las confirmaciones lo mantienen. El worker de ingreso no selecciona PasswordHash;
la factoría exige mínimos y rechaza privilegios excesivos. Supervisor explícito,
sin inicio automático, sin solapamiento y con cierre que espera operaciones en vuelo.

Validación nueva de motor (no repite los siete casos del corte anterior):

```bash
HOSTFLOW_AUTHCOM_RESILIENCIA_SQL_TEST=1 HOSTFLOW_SQL_TEST_WRITE_APPROVED=YES_LOCAL_DISPOSABLE \
  node --test tests/integration/sql-resiliencia-comercial.test.js
```

El recorrido Node→SQL nativo sigue bloqueado por Application Control. La alternativa
SqlClient.NET pudo leer identidad, pero su harness encontró ExecutionPolicy que
prohíbe scripts. No se eludió; prototipo no validado fuera de Git en revision/.
El preflight09 Azure preparado intentó usar la configuración autorizada existente,
pero terminó en timeout de conexión: no acredita compatibilidad Azure actual.

Los apartados siguientes describen la base de Fase2 y el corte anterior; sus
garantías de producción siguen sujetas a los límites/validaciones de este estado.

Estado: preparada localmente, **NO migrada ni activada**. No conectar al servicio operativo.
Fase 1 conservada. No se modifica Usuarios/Roles/Empresas al aplicar el DDL propuesto,
no hay backfill de correos verificados, permisos aplicados ni endpoints nuevos.

## Artefactos

- `01_modelo_bloqueado.sql`: esquema nuevo authcom y cinco tablas en una transacción.
  Guardas de autorización/inventario a cero, destino explícito, transacciones previas,
  visibilidad y tipos de dependencias. Aborta si el esquema ya existe. No es un
  migrador idempotente: nunca completa una instalación parcial a ciegas.
- `02_verificacion_lectura.sql`: catálogo de tablas, columnas, índices, FK y CHECK;
  no consulta contactos, hashes ni contenidos de correos.
- `03_permisos_solo_texto.sql`: matriz SELECT legible; no aplica GRANT/DCL.
- `src/repositories/AutenticacionComercialSql.js`: puerto completo de Fase 1,
  inactivo por defecto. Recibe pool YA configurado, driver, base, servidor y empresa.
  No usa database.js, dotenv ni valores operativos implícitos. No importado en app.

El código/documentación local tomado como referencia es
`sql/proposals/seguridad_etapas_3_4/01_modelo_roles_usuarios.sql`,
`sql/proposals/configuracion_empresa/01_modelo_empresa_preferencias.sql`
y UsuarioRepository. **Esto no verifica el esquema vivo actual.**

## Tablas y garantías

| Estructura | Propósito |
| --- | --- |
| authcom.Contactos | Un contacto email de autenticación por usuario, versión, fecha verificada/revocada; no contactos de huéspedes. |
| authcom.Desafios | Recuperaciones e invitaciones diferenciadas por propósito. Hash binary(32) único, empresa, FK usuario/invitador, caducidad, consumo/revocación, snapshot cerrado JSON. |
| authcom.Cuotas | Contadores compartidos por operación e índice HMAC de IP/destino, además del global. No email ni IP claros. |
| authcom.Outbox | Sobre AES-GCM serializado: keyId, IV, tag, contenido cifrado; sin enlace claro. Lease, intentos, próxima entrega, expiración y vínculo a desafío. |
| authcom.Auditoria | Tipo cerrado, IDs de actor/usuario/desafío, empresa y fecha; sin texto libre, token o password. |

Se unifican invitaciones y desafíos en vez de duplicar estados/token en dos tablas.
`Documento` solo admite desde el adaptador nombre/rol/versiones/contacto; no token.
Las fechas y estados relacionales son la autoridad al leer, no valores arbitrarios
del JSON. Índice único filtrado de invitación pendiente por empresa/email.
Antes de una nueva invitación se transiciona la anterior vencida a no pendiente;
no hay GETDATE en filtros. Recuperaciones nunca usan ese índice de invitación.

El adaptador proyecta el contacto solo si coincide exactamente con el email actual
normalizado y no está revocado. No existen marcas de verificación legacy implícitas.
No se duplica la autoridad con un nuevo flag en Usuarios. La gestión futura de
verificación/cambio de contacto debe incrementar versión, revocar desafíos y
coordinarse bajo el mismo bloqueo. No se implementa todavía ese enrolamiento.

## Transacciones y compatibilidad

Una transacción SERIALIZABLE por callback; mismo pool/conexión para todas las
operaciones. Se verifica DB_NAME, ServerName y marca `authcom-v1`; un esquema
parcial o marca ausente se rechaza. La marca NO sustituye una auditoría estructural.
Se obtiene `HostFlow:Seguridad:AdministradoresActivos` con propietario Transaction,
compartido con la gestión actual de cuentas. Orden: guarda, applock, lecturas con
UPDLOCK/HOLDLOCK de usuario/contacto/desafío y escrituras. No hay transacciones
anidadas de UsuarioService ni red dentro del callback.

El núcleo Fase 1 revalida usuario, contacto, rol y autoridad del invitador después
de bcrypt. El adaptador protege el consumo con UPDATE condicionado y exactamente
una fila; el reset usa CAS de VersionSesion y la incrementa sin alterar rol/estado.
Token, password, revocación, outbox y auditoría forman un solo commit. Invitación
crea usuario Operador y contacto verificado juntos; email existente se rechaza.

Hash de token almacenado exclusivamente como binary(32); el token recuperable
solo existe cifrado para entrega. La nueva contraseña se almacena bcrypt, igual
al login actual. La invitación depende de defaults existentes de Usuarios
(Estado Activo/VersionSesion 1/fechas): deben acreditarse antes de migrar/probar.

Al fallar antes del commit se intenta rollback. Un error de dominio solo conserva
su código si el rollback fue confirmado. Ante commit intentado o rollback fallido,
respuesta sanitizada de resultado incierto, sin reejecución del callback. No
interpretar 503 como garantía de rollback. SQL consumido consulta también reloj UTC
del motor; emisión y cuotas usan reloj de servidor inyectado. Sincronizar relojes,
no aceptar fechas de cliente; probar desfase/retroceso. Bcrypt sigue fuera de locks.

El bloqueo global simplifica corrección pero serializa cuotas, cuentas y worker;
medir contención antes de ofrecer volumen comercial. Actores SQL que no respetan
el applock deben controlarse por permisos y ventanas; no se promete coordinación
con administradores o código legacy arbitrario. No es aislamiento multiempresa:
Usuarios sigue global y esta base solo permite una organización por instalación.

## Outbox, idempotencia y retención

Lease de 120s, máximo tres intentos, backoff60s/300s y Retry-After acotado, asignación condicionada en SQL.
Reloj SQL para lease/expiración. Sobres expirados/revocados/consumidos y agotados
sin lease activo se descartan solo cuando no representan incertidumbre; tras
aceptación del proveedor se elimina el sobre. Agotamiento/resultado incierto pasa
a cuarentena con ciphertext conservado, según08; sin purga automática.
Finalizar exige ID y lease todavía vigente. El proveedor recibe el mismo ID
idempotente; caída tras enviar puede generar repetición si el proveedor/adaptador
no deduplica. No se promete exactly-once de email. Una revocación durante envío
puede dejar llegar un enlace ya inválido; el consumo debe rechazarlo siempre.

Antes de producción: timeout/leases efectivos, rotación de claves (keyring/vault),
cuotas de coste y proveedor idempotente, retención aprobada de auditoría/identificadores
y limpieza acotada de cuotas/outbox/desafíos antiguos. No se incluyen jobs ni DELETE
automáticos. La cardinalidad de cuotas sin mantenimiento es un riesgo abierto;
no habilitar HTTP sin límites de ingreso, presupuesto global y retención.

## Secuencia de revisión y futura migración (no ejecutada)

1. Aprobar políticas: correo legacy, recuperación reforzada Admin, TTL/cuotas,
   invitaciones Operador, efecto de revocación de sesión del invitador y retención.
2. Revisar modelo con visibilidad administrativa en una operación separadamente
   autorizada. Confirmar tipos/longitudes, PK/FK, email único normalizado, collation,
   defaults de Usuarios/Roles/Empresas, compatibilidad SQL >=130, triggers, RLS,
   permisos/metadatos y marca inexistente. Las guardas del script son mínimas;
   no sustituyen esta revisión. Si hay equivalentes authcom u otro esquema, detener.
3. Ejecutar DDL primero en SQL Server aislado autorizado, con fixtures ficticios.
   No se ejecutó ningún SQL en esta fase. Probar SQL Server y versión objetivo de
   Azure SQL sin sustituir por el driver grabador.
4. Acreditar carreras de consumo/reenvío/alta duplicada/leases en dos conexiones,
   cambio concurrente de rol/contacto/sesión, fallo de auditoría/outbox, deadlock,
   rollback, corte de red durante commit, pérdida tras correo y clocks distintos.
   Debe ganar un único consumo, sin estado parcial ni fuga de error sensible.
5. Comparar estado/hashes de cuentas y login antes/después, sin backfill. Verificar
   que aparezcan solo las tablas previstas (cinco de01; siete con04/08) y sus marcas; definir manifiesto de
   permisos por identidad revisado. El script 03 no concede nada.
6. Solo entonces: nueva autorización Azure, respaldo/recuperación y ventana vigente,
   destino exacto, ejecución administrativa única, verificación 02 y grants mínimos
   expresamente aprobados. No hacer bootstrap ni recrear Usuarios/Roles.
7. Mantener adaptador deshabilitado y HTTP ausente hasta ingreso asíncrono durable,
   anti-enumeración temporal medida, límites de borde, UI segura, proveedor/dominio
   verificado y pruebas reales de aceptación autorizadas. No activar con el DDL.

## Permisos y reversibilidad

03 describe el puerto combinado. Para ejecución comercial conviene identidad web
y worker separadas: worker necesita solo lectura mínima de desafíos/UPDATE outbox
y bloqueo/metadatos, nunca UPDATE Usuarios. Adaptar la guarda del worker si se
separan puertos. No agregar db_owner/db_datawriter ni permisos de esquema amplios.
Auditoría de solo INSERT; ninguna nueva identidad necesita DELETE/DDL/DCL.

Rollback previo a activación: dejar el adaptador inactivo, HTTP sin montar y tablas
aditivas vacías; login existente sigue intacto. Tras uso, desactivar nuevos flujos
y worker coordinadamente, conservar desafíos/auditoría y revocar pendientes bajo
procedimiento aprobado. **No borrar tablas ni restaurar versiones de contraseña**
como rollback: una recuperación legítima ya cambió credenciales y VersionSesion.
Revocar grants posteriores requiere aprobación aparte. No se entrega un DROP
automático ni se declara reversión de datos de identidad por simple down-migration.

## Evidencia y pendientes

Las pruebas con driver de grabación verifican comandos/parametrización, mismas
transacciones, guardas, respuestas a errores, CAS, cuotas y leases. Las 25 pruebas
de dominio Fase 1 siguen pasando. No validan sintaxis T-SQL en un motor ni bloqueos,
RLS, latencia, collation, FK, defaults, triggers o durabilidad de Azure.
El adaptador es candidato de revisión, no autorización de integración operativa.
# Continuación comercial local, 31/10/2026

Las propuestas01/04 agregan seis tablas;06 agrega `Outbox.PrimerIntentoEn`
y la marca `HostFlowAuthCorreo=authcom-correo-v1`, requerida ahora por el worker.
06 exige outbox vacía; si ya tiene filas, detenerse y diseñar la transición.
07 es mantenimiento acotado, cerrado por defecto y con autorización de retención
independiente: elimina ciphertext vencido y cuotas de más de48h; conserva usuarios,
desafíos, auditoría e historial. Ningún script se ejecuta al arrancar HostFlow.

La composición `IntegracionComercialPreparada` exige dependencias explícitas,
cuatro pools de perfiles mínimos, claves independientes y acreditaciones previas;
revalida modelos/permisos en el servidor. No está importada por app/server, no
monta HTTP ni abre conexiones o timers por sí sola. El worker se pausa ante un
error de procesamiento; requiere inspeccionar el ingreso pendiente antes de
reconstruir la composición. No existe reintento ciego de resultados inciertos.

Proveedor preparado: Resend por HTTPS, inactivo, sin SDK adicional. El worker
reserva presupuesto durable (100 intentos/24h por defecto), lease de120s y hasta
tres intentos. Solo reenvía dentro de23h desde el primer intento, con UUID estable,
dejando margen a las24h de deduplicación del proveedor. La aceptación de la API
no acredita entrega en bandeja. Congelar remitente, origen y versión de plantillas
mientras haya envíos pendientes; no reutilizar un ID con un payload cambiado.

Pruebas de motor local opt-in (Git Bash):

```bash
HOSTFLOW_AUTHCOM_SQL_TEST=1 HOSTFLOW_SQL_TEST_WRITE_APPROVED=YES_LOCAL_DISPOSABLE \
  node --test tests/integration/sql-authcom-sqlcmd.test.js
```

Solo usa `lpc:localhost`, Windows integrado y `HostFlow_Test_Seguridad` vacía,
marcada y de PC-Escritorio. No crea bases; verifica propiedad de fixtures antes de
limpiarlos. La prueba `sql-autenticacion-comercial.test.js` está preparada para
los adaptadores Node, pero el driver msnodesqlv8 fue bloqueado por Application
Control en esta PC. No desactivar esa protección: resolver mediante un runtime
autorizado. Las pruebas SQLCMD acreditan motor/DDL/consultas críticas; no el recorrido
completo Node→SQL ni permisos de identidades restringidas ni Azure.
El runner de adaptadores usa `HOSTFLOW_AUTHCOM_ADAPTER_SQL_TEST=1` y la misma
aprobación de escritura local; ejecutarlo por separado del runner SQLCMD.

Plan de activación, secretos, DNS, permisos y riesgos en el informe externo de
`revision/autenticacion-comercial-cierre-2026-10-31/`. No habilitar HTTP con un flag
frontend ni interpretar estas pruebas como autorización para migrar Azure.
