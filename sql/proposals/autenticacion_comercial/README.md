# Autenticación comercial — persistencia propuesta v1

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

Lease de 120s, máximo tres intentos, reintento a 60s, asignación condicionada en SQL.
Reloj SQL para lease/expiración. Sobres expirados/revocados/consumidos y agotados
sin lease activo se descartan; tras entrega/agotar intentos se elimina el sobre.
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
   que solo las cinco tablas nuevas y marca aparezcan; definir manifiesto de
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
