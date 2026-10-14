# Activacion controlada de seguridad en Azure

## Estado posterior: puesta en marcha completada en desarrollo

La migración ya fue ejecutada por el titular, el primer Administrador fue
creado/verificado y ambas cuentas (Administrador y Operador) completaron su
cambio obligatorio. La sesión local autorizada utiliza SQL temporalmente.
Consultar `cierre-seguridad.md` para la evidencia actual y límites.
NO repetir migración ni bootstrap. Los pasos siguientes se conservan como
procedimiento histórico, no como operaciones pendientes o autorización nueva.
No se certificó PITR desde el acceso del agente; confirmarlo con el titular
antes del despliegue o una futura intervención de datos.

## Registro histórico de preparación

Actualizado el 14/10/2026. La inspeccion de Azure YA se ejecuto, solo lectura,
con la identidad del backend; ver `inspeccion-azure-resultados.md`. Falta la
comprobacion administrativa y PITR, descrita en `comprobacion-azure-administrativa.md`.
Migracion/bootstrap/activacion NO ejecutados. SQL local validado con 17 pruebas
reales aprobadas; ver `tanda-sql-resultados.md`. HostFlow sigue en mock por defecto
en desarrollo. No hay migracion, bootstrap ni activacion automatica.

## Destino e identidades pendientes

La base HostFlow y su servidor coincidente con la conexion existente quedaron
confirmados en Azure SQL Database (EngineEdition 5), TLS/certificado y driver.
La app no tiene permisos para migrar ni ver todo el esquema. Falta verificar la
identidad migradora/administrativa y PITR. No se imprimieron secretos ni se abrio
ninguna conexion Azure durante la tanda LOCAL; la inspeccion posterior fue de
solo lectura. No inferir el destino por el nombre
de base solamente. Los marcadores de servidor de este documento NO son valores
ejecutables ni contraseñas que deban compartirse.

Usar Azure Portal o SSMS con conexiones existentes y autorizadas. Cifrado y
validacion de certificado obligatorios; nunca copiar TrustServerCertificate del
runner local a Azure. No conceder sysadmin/db_owner a la aplicacion.

## Azure 1: autorizar lectura de destino y esquema

Con la identidad administrativa y la base seleccionada HostFlow, abrir y ejecutar
POR SEPARADO, solo despues de aprobar esas lecturas:

1. `sql/proposals/seguridad_etapas_3_4/06_destino_azure_solo_lectura.sql`.
2. `sql/proposals/seguridad_etapas_3_4/03_comprobacion_administrativa_solo_lectura.sql`.
3. `sql/proposals/seguridad_etapas_3_4/07_permisos_migracion_solo_lectura.sql`.

02_verificacion_metadatos.sql ya confirmo Roles con la app. La comprobacion
pendiente concreta es la administrativa 06/03/07, sin ampliar permisos de app.

Son SELECT de contexto/metadatos, excepto el catalogo no sensible IdRol/Nombre/
Activo de Roles. No leer cuentas, hashes ni datos operativos. Contrastar servidor
con el recurso y conexion aprobados en Portal. Requiere VIEW DEFINITION=1 para el
inventario completo, sin transacciones abiertas/implicitas. Confirmar ausencia de
Usuarios/equivalentes y estructura/clave unica IdRol de Roles. Roles activos:
Administrador, Propietario, Operador. No cambiar sus filas ni permisos.

Si se prefiere sqlcmd con autenticacion SQL existente, el patron futuro es:

```powershell
sqlcmd -S $servidorAzureAprobado -d HostFlow -U $identidadAzureAprobada -N -b -i sql/proposals/seguridad_etapas_3_4/06_destino_azure_solo_lectura.sql
```

Ambas variables representan los valores privados confirmados localmente; no
estaban disponibles para cerrar un comando con destino literal. Omitir -P: la
herramienta solicita la contraseña. No usar SQLCMDPASSWORD, argumentos con
secretos, salida a archivos ni historial con credenciales. Alternativa: conexion
interactiva SSMS ya autorizada. No instalar ni cambiar metodos de autenticacion.
Referencia: [sqlcmd y prompt de contraseña](https://learn.microsoft.com/en-us/sql/tools/sqlcmd/sqlcmd-utility?view=sql-server-ver17).

## Azure 2: autorizar exclusivamente la migracion

Artefacto exacto: `sql/proposals/seguridad_etapas_3_4/01_modelo_roles_usuarios.sql`.
No se altero en esta tanda. Conserva @ModeloAprobado=0 y @EscrituraAutorizada=0;
los dos flags impiden ejecutar accidentalmente el archivo del repositorio.

Despues de aprobar el contenido y esta escritura, preparar una copia local
revisable para SSMS, cambiar SOLO esos dos flags a 1 y anteponer este bloque en
EL MISMO BATCH, sin GO entre este bloque y el modelo:

```sql
DECLARE @ServidorAzureAprobado nvarchar(128) = NULL;
-- Sustituir NULL solo por el ServerName confirmado y aprobado en Azure 1.
IF @ServidorAzureAprobado IS NULL
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'')
    COLLATE Latin1_General_100_BIN2 <> @ServidorAzureAprobado COLLATE Latin1_General_100_BIN2
 OR DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'HostFlow'
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0) <> 5
 THROW 51600,'Destino Azure no acreditado.',1;
IF @@TRANCOUNT <> 0 OR (@@OPTIONS & 2) <> 0
 THROW 51601,'Usar sesion sin transacciones previas ni implicitas.',1;
```

Revisar la copia completa y su hash antes de ejecutarla en la conexion aprobada.
No editar .env ni automatizar este paso. La migracion abre su propia transaccion,
XACT_ABORT ON y TRY/CATCH/ROLLBACK. Crea solo Usuarios, sus indices, defaults,
CHECK y tres FKs. Reutiliza Roles y dos FKs propias de autoria de cambios; no hay
cascadas, DML, importacion mock ni GRANT. Email normalizado persistido y unico,
rowversion para ediciones, VersionSesion para revocacion. No modificar la
collation de la base ni tablas operativas; Email tiene collation explicita.

Antes: acordar ventana y comprobar recuperacion/PITR disponible con el titular.
Si hay error o resultado incierto, inspeccionar metadatos ANTES de reintentar.
No ejecutar DROP, no reemplazar Usuarios, no asumir rollback por un timeout.

## Azure 3: autorizar verificacion y comprobar permisos

Ejecutar `02_verificacion_metadatos.sql` con la identidad administrativa.
Comparar 15 columnas, PK_Usuarios, UX_Usuarios_EmailNormalizado,
IX_Usuarios_Rol_Estado, tres FKs y cinco CHECK habilitados/confiables con el modelo.
Confirmar tambien los defaults y la columna calculada persistida en el explorador
de metadatos de SSMS. Confirmar que Roles conserva los tres registros.

Ejecutar `05_permisos_puesta_en_marcha_solo_lectura.sql` con la IDENTIDAD DEL
BACKEND y desde su conexion efectiva, no solo una sesion administrativa de SSMS.
Las opciones SET deben coincidir con las requeridas por el indice calculado.
Un administrador con sysadmin local no acredita permisos de esta identidad.

Minimos de operacion: SELECT Roles; SELECT, INSERT, UPDATE Usuarios; permiso
efectivo de sys.sp_getapplock con DbPrincipal public. Sin DELETE, DDL ni escrituras
Roles. Bootstrap: SELECT Roles/Usuarios, INSERT Usuarios y bloqueo. Migracion:
VIEW DEFINITION y DDL/REFERENCES necesarios para crear tabla, indices y FKs.
No hay script de permisos amplios; cualquier ajuste minimo requiere autorizacion
separada del administrador de Azure. Concesiones actuales sobre otras tablas
no acreditan derechos sobre Usuarios.

## Azure 4: autorizar bootstrap del primer Administrador real

Mantener la aplicacion en mock. Terminal privada interactiva, configuracion de
conexion existente al destino aprobado (no publicar valores). Desde backend:

```powershell
npm.cmd run admin:bootstrap -- --check --database HostFlow
```

Solo lectura; necesita que Usuarios exista. Si faltan roles/permisos, detenerse.
Despues de aprobar el INSERT del primer Administrador:

```powershell
npm.cmd run admin:bootstrap -- --apply --write-authorized --database HostFlow
```

Solicita confirmacion textual, nombre, correo y contraseña temporal oculta dos
veces. Bcrypt cost 12; no argumentos de password ni hash/JWT en salida. Usa el
bloqueo transaccional de la API y exige Usuarios vacia; no adopta cuentas existentes.
No usar mock ni datos de prueba. Resultado incierto: inspeccion privada autorizada
antes de reintentar; no resetear/borrar filas. No se ejecuto este CLI contra Azure.

## Azure 5: autorizar verificacion y corte de autenticacion

Primero, comprobacion de credenciales de solo lectura, sin JWT ni UPDATE:

```powershell
npm.cmd run admin:bootstrap -- --verify --database HostFlow
```

Solo despues de verificar Administrador activo, rol activo y contraseña, aprobar
el cambio de configuracion/reinicio del backend y frontend compatibles. Preparar
privadamente JWT_SECRET robusto, NODE_ENV de destino, CORS HTTPS y proxy/limites.
La produccion exige SQL explicito; no habilitar mocks en produccion.

```powershell
$env:HOSTFLOW_AUTH_SOURCE = 'sql'
npm.cmd start
```

Es un comando FUTURO, no ejecutado ahora. No modificar .env. El arranque verifica
HostFlow, permisos, roles asignables y Administrador activo; no ejecuta DDL ni
crea usuarios. Si SQL falla, no abre servidor o responde 503, sin fallback mock.
No transferir credenciales administrativas al proceso backend.

Todos los tokens mock dejan de autenticar aunque coincidan los IDs; los usuarios
deben volver a iniciar sesion. SQL valida VersionSesion y rol/estado actuales en
cada peticion. El primer login obliga a cambiar contraseña antes de negocio;
ese UPDATE debe estar incluido en la autorizacion siguiente.

## Azure 6: autorizar prueba funcional y cuentas

Autorizar expresamente cambio de contraseña propia del Administrador y alta del
Operador real. Probar Mi cuenta y Usuarios: alta, campos permitidos, cambio de rol,
activacion/desactivacion, reset, revisiones y revocacion. Probar 401/403 desde API;
el Operador no administra usuarios ni accede a informacion economica. Propietario
conservado en SQL, sin asignacion ni login. No desactivar/degradar al ultimo Admin.
No reutilizar el runner LOCAL contra Azure.

## Azure 7: autorizar regresion integral

Probar negocio en el entorno/datos expresamente acordados. Algunos GET de
dashboard, reservas, limpiezas, alertas y recomendaciones sincronizan y pueden
escribir: esta etapa NO
autoriza ejecutarlos ahora. Verificar reservas, canales, conflictos, limpiezas,
integraciones simuladas y FlowIA sin alterar reglas ni registros reales por prueba.
Registrar resultado y cierre del bloque; no declarar esos escenarios reales
validados a partir de los tests aislados actuales.

## Recuperacion y limites

Hasta verificar el primer Admin, mantener mock de desarrollo. Antes del corte,
un fallo SQL deja pendientes los pasos y conserva el acceso mock actual. Despues
del corte: diagnosticar disponibilidad/permisos, recuperar servicio/configuracion
aprobada y volver a verificar Admin. No activar mock silenciosamente, borrar
Usuarios/Roles, resetear contraseñas sin permiso ni restaurar toda la base
operativa por rutina. Si ya hay usuarios SQL, no repetir bootstrap: requiere tabla
vacia. Cualquier recuperacion de datos/cuenta necesita aprobacion especifica.

Pendientes reales: permisos limitados, TLS/destino Azure, Tedious con las opciones
efectivas, corte/reinicio, bootstrap privado y regresion de negocio autorizada.
localStorage, limites en memoria por instancia/proxy y bundle siguen documentados.
No hay bloqueo de DDL/modelo observado localmente. El bloqueo actual es la
identidad migradora/visibilidad completa y PITR, no una nueva prueba SQL local.
