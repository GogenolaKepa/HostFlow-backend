# Perfiles comerciales: contrato ejecutable, todavía inactivo

El candidato original01–15 no cambia.16/17 y la alternativa18 requieren revisión y
autorizaciones nuevas. Ningún script se importa en el arranque. No usar HostFlowAdmin
como runtime. Las cuatro identidades deben ser distintas, sin roles generales,
CONTROL/ALTER/IMPERSONATE/DELETE ni permisos desconocidos. NULL no equivale a denegado.

| Perfil/pool | Operación real y adaptador | Permiso mínimo17 |
| --- | --- | --- |
| ingresoHttp | IngresoRecuperacionService.limitar/solicitar → admitir/encolarIngreso | SELECT/INSERT/UPDATE Cuotas; INSERT Ingresos. Sin lectura de Usuarios ni creación de cuentas. |
| workerIngreso | reservarIngreso/leerIngresoReservado/finalizarIngreso/registrarFalloIngreso; procesarSolicitudRecuperacion | SELECT/UPDATE Ingresos; SELECT/INSERT/UPDATE IngresoFallos y Desafios; SELECT Contactos; INSERT Outbox/Auditoria; SELECT/INSERT/UPDATE Cuotas. |
| cuentas | validar/confirmar recuperación y aceptar invitación; invitar/listar/revocar con Admin revalidado | SELECT/INSERT Contactos; SELECT/INSERT/UPDATE Desafios; INSERT Outbox/Auditoria; SELECT/INSERT/UPDATE Cuotas. Usuarios: SELECT de las columnas del contrato, INSERT y UPDATE solo de las seis columnas de credenciales/sesión. |
| correo | reservarEntrega/entregaVigente/finalizarEntrega/admitir | SELECT/UPDATE Outbox; SELECT Desafios; SELECT/INSERT/UPDATE Cuotas. Sin INSERT/UPDATE/DELETE de Usuarios. |

SELECT de Usuarios para cuentas/workerIngreso: IdUsuario, Nombre, Email,
EmailNormalizado, IdRol, Estado, DebeCambiarPassword, VersionSesion, VersionRegistro.
Solo cuentas añade PasswordHash para comparar contraseña previa. Ambos leen
Roles(IdRol,Nombre,Activo) y Empresas(IdEmpresa,Activo). No SELECT de tablas completas.
UPDATE cuentas: PasswordHash, DebeCambiarPassword, VersionSesion, FechaCambioPassword,
FechaActualizacion, IdUsuarioActualizacion. La consulta compartida
FronteraSqlComercial rechaza UPDATE sobre otras columnas y DELETE; rechaza metadatos
ausentes. Ingreso/workers rechazan cualquier UPDATE de Usuarios y acceso a hashes.

Todos necesitan CONNECT, VIEW DEFINITION de authcom/Usuarios/Roles/Empresas y del
propietario sin login para acreditar negativos. sp_getapplock usa public, verificado
mediante ejecución en aceptación; no se conceden permisos de master. El bloqueo común
de cuentas sigue siendo HostFlow:Seguridad:AdministradoresActivos. El ingreso público
no toma ese applock ni busca una cuenta durante HTTP.

El diagnóstico de permiso faltante expone solo perfil, objeto estático, permiso y
denegado/no-acreditado. Nunca publicar errores del driver, principal, email, SQL,
claves o tokens. El montaje aborta y cierra pools si un permiso no se acredita.

## Alternativa18: eliminar INSERT directo de cuentas

SQL18 instala authcom.CrearOperadorInvitado WITH EXECUTE AS OWNER y retira únicamente
el GRANT INSERT que17 había concedido a cuentas; añade EXECUTE solo a cuentas.
El propietario es el dedicado SIN LOGIN de authcom, no dbo; recibe INSERT Usuarios
y SELECT acotado de Usuarios/Roles/Empresas. No recibe roles, CONTROL dbo ni UPDATE.
Se rechazan módulos authcom previos y privilegios adicionales del propietario
(CONNECT no concede acceso autenticable a un usuario WITHOUT LOGIN).

El módulo no acepta rol, email, nombre o actor del caller: los obtiene de una
invitación consumida en una transacción viva con el applock común. Revalida empresa1,
Administrador activo/VersionSesion, rol Operador activo, vigencia y duplicados.
Crea cuenta Operador, contacto y auditoría INVITACION_ACEPTADA dentro de la transacción
del caller. No hace COMMIT autónomo; un fallo posterior de outbox revierte todo.
El adaptador optativo evita duplicar esa auditoría y enlaza desafío/consumo.

Para usarlo después de la aceptación: sql.altaOperadorRestringida=true en la
composición explícita del servidor. Esto exige marca authcom-operador-v1, EXECUTE=1
e INSERT directo=0. Sin18 conservar false; no activar true por una bandera frontend.

**Límite importante:** esto restringe el alta, no convierte el principal cuentas en
una sandbox para ejecutar SQL arbitrario. Con17 todavía puede leer hashes y cambiar
credenciales de Usuarios; los filtros de recuperación Operador están en el servicio.
Una credencial cuentas comprometida conserva ese riesgo. No afirmar aislamiento
total de Administradores ni ofrecer recuperación Admin. Una frontera SQL completa
de recuperación requeriría otra propuesta específica y aceptación, fuera de18.
Tampoco se separó administración de invitaciones y confirmaciones en dos pools:
se preservó el contrato actual de cuatro identidades, con autorización por servidor.

## Aceptación antes de HTTP

1. Identidad exacta de cada pool, TLS validado, marcas/modelo, transacciones y permisos.
2. Positivos de17 y negativos de runtime: lector/escritor general=0; correo/ingreso
   INSERT Usuarios=0; UPDATE ajeno=0; ALTER/CONTROL/IMPERSONATE/DELETE=0, ningún NULL.
3. Si18 se aprueba: EXECUTE solo cuentas; INSERT directo cuentas=0; intento de rol
   Administrador rechazado; repetición y rollback de alta/contacto/auditoría probados.
4. Repetir esos contratos mediante Node/Tedious y las identidades finales. El ensayo
   SQLCMD con usuarios WITHOUT LOGIN no acredita autenticación Entra ni TDS real.
5. Sin contactos verificados, dominio/secretos, workers supervisados, HTTPS/proxy y
   permiso de activación: capacidades comerciales cerradas, login tradicional intacto.

Ante instalación parcial: detenerse, conservar resultados/objetos y no completar a
ciegas ni desinstalar. No reabrir servicios hasta aceptar aislamiento y permisos.
