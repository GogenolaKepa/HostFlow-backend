# Recuperación automática de cuentas verificadas — política V2

Implementación local desde 1aaaabb, sin activar ni modificar la instalación real. Se conserva V1 solo para la configuración histórica ya acreditada; V2 no contiene IDs, caché de usuarios ni límite de cantidad de cuentas. La fábrica `crearConfiguracionAutomatica` es pura y no escribe configuración. La plantilla adjunta permanece bloqueada.

## Elegibilidad y administradores

Se autentican actualmente contra `dbo.Usuarios.PasswordHash` mediante bcrypt y el mismo login SQL/JWT de aplicación; `Administrador` es un rol de aplicación. No se encontró un segundo factor que deba eludirse. Las identidades administrativas de Azure/SQL no pertenecen a este flujo.

V2 admite Administrador y Operador activos, con rol activo, contraseña local válida y con contacto canónico verificado, vigente/no revocado y no fechado en el futuro. Se exige VersionSesion válida e incrementable, VersionContacto positiva y empresa operativa activa. No se altera rol, permisos, pertenencia, estado ni contacto para hacer elegible una cuenta. DebeCambiarPassword obliga a elegir una contraseña nueva, no es una suspensión: una cuenta activa con contacto ya verificado puede completar ese cambio mediante este mismo enlace, que invalida sesiones y satisface la obligación. Un estado desconocido de ese indicador bloquea; no se habilita una cuenta sin verificar.

El método local procede exclusivamente de `authcom.PermitePasswordLocal(IdUsuario)`, no del body, JWT, tipo de correo o supuesta identidad Google. La función retorna solo un bit, comprueba el formato bcrypt admitido por el sistema y no expone hashes. El worker conserva su prohibición de SELECT/UPDATE de PasswordHash. La propuesta requiere permiso específico al propietario sin login para leer esa columna dentro del módulo y EXECUTE de la función solo para cuentas/worker. No añade roles generales, identidades, credenciales ni acceso al negocio. Conserva los ocho DENY de hostflow_app.

No se consultó Azure durante este trabajo. El usuario3 sigue siendo la única cuenta cuya verificación real está acreditada en los expedientes. No se puede afirmar cuántos administradores/operadores adicionales tienen contacto verificado hoy. `03_ELEGIBILIDAD_SELECT.sql` prepara el conteo administrativo sin hashes, correos ni datos personales en la salida. No marca contactos como verificados ni activa cuentas.

## Futuras cuentas, Google y separación de empresas

Una invitación aceptada por SQL18 ya crea el hash local y el contacto verificado dentro de su transacción. Cuando ese alta autorizada ocurra, la cuenta entra automáticamente en V2; no se modifica SQL18, se edita una lista ni se actualiza la configuración por usuario. Las verificaciones/renovaciones/revocaciones de contacto existentes tienen efecto en la siguiente operación y se revalidan al consumir el token y antes del envío.

La rama 9ddcb53 prepara `clientes.Cuentas`/`clientes.Proveedores` con IDs UUID y espacios todavía sin EmpresaOperativaId. Es un namespace distinto; no constituye un Operador/Administrador de empresa1. Las cuentas password de ese registro tienen su recuperación propia ya preparada y solo adquieren acceso operativo mediante la futura admisión explícita. No se las une a dbo.Usuarios ni se las convierte en usuarios de empresa1 por coincidir el correo. Un futuro usuario operativo creado por el mecanismo autorizado queda cubierto por V2 sin listas.

Google-only mantiene PasswordHash=NULL y no recibe una contraseña ni una recuperación local. Google vinculado con contraseña ya existente conserva esa contraseña solo si la vinculación fue autenticada. La rama actual exige sesión y reautenticación para vincular; identifica Google por issuer+subject y rechaza el acceso por mera coincidencia de email. Contratos nuevos se probaron contra ese código con dobles, sin fusionar ni activar la rama. Si en el futuro se unifican físicamente namespaces o métodos, esa migración debe preservar esta evidencia explícita de contraseña local; no utilizar hashes ficticios como marca de cuentas Google-only.

Referencia: [Google OIDC: usar sub, no email como identidad](https://developers.google.com/identity/openid-connect/openid-connect).

## Seguridad que se conserva

Mismo circuito para ambos roles: ingreso durable neutral, token cifrado/autenticado de15minutos y un solo uso, revalidación tras bcrypt, invalidación de sesiones por VersionSesion, auditoría y aviso de seguridad. No login automático ni nuevas sesiones al recuperar. La empresa del servidor sigue fija en1, con negocio/uploads/registro/Google/invitaciones públicos bloqueados en el host habitual; ampliar recuperación no amplía acceso operativo.

Las claves y límites persistentes se mantienen (6 intentos cuenta/destino por24h,3 por clase y100 globales); no se reinician contadores ni el presupuesto histórico2/2. Reintentos de conexión serverless y encendido manual se conservan, sin keepalive o servicios nuevos.

Para evitar que un correo reasignado autorice un aviso de otra cuenta, los avisos V2 incluyen dentro del sobre cifrado ID/namespace/versiones/contacto. Se verifica el vínculo antes de reservar cuotas y otra vez antes del POST. Un aviso viejo sin vínculo no se acepta en V2. La transición exige colas vacías y mantiene las evidencias; no se reenvían ni recifran mensajes históricos.

## Instalación pendiente: permisos y SQL NO acreditados por una simulación

Los archivos SQL son propuestas bloqueadas. Sintaxis/semántica de EXECUTE AS OWNER y permisos efectivos deben comprobarse con SQL Server de laboratorio y posteriormente en una ventana Azure autorizada. Las pruebas JS con driver ficticio no acreditan ejecución real de la función ni autorizan retirar las guardas.

Referencia primaria: [CREATE FUNCTION y contexto de ejecución](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-function-transact-sql?view=azuresql-db).

Orden mínimo:

1. Revisar el commit, validar la propuesta en laboratorio autorizado y acreditar destino/TLS/PITR/exclusividad/servicios detenidos. Conservar preimágenes de configuración y permisos. La recuperación real ya acreditada no se repite.
2. Autorizar DDL exacto: crear únicamente la función revisada y su marca. Autorizar DCL por separado: SELECT(PasswordHash) únicamente al propietario sin login, EXECUTE de esa función únicamente a hostflow_auth_worker y hostflow_auth_cuentas. No cambiar sus roles ni los DENY de hostflow_app.
3. Autorizar publicación del commit local, previa lectura del remoto y avance rápido. Ninguna función nueva se activa con un push: la configuración privada sigue V1.
4. Autorizar sustitución controlada de la configuración pública privada por V2, sin tocar custodia/credenciales/presupuestos; aprobar comprobación dirigida de lectura de función/permisos y conteos, y posterior activación habitual. Un resultado desconocido bloquea. No activar V2 si falta la función/marca/permiso.
5. Cierre y reversión preparados: detener Tunnel/host/worker normalmente; restaurar configuración previa si corresponde y solo con autorización retirar la función/marca/permisos que se añadieron. No borrar usuarios ni datos. No ejecutar la reversión bloqueada directamente.

Esta preparación no implica publicación, instalación SQL ni activación. El backend operativo original y las ramas registro/Google/planes permanecen intactos.
