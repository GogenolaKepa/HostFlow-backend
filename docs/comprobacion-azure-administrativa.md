# Resolver el bloqueo de migracion: cuenta administrativa y PITR

Solo lecturas. No ejecutar migracion, bootstrap, GRANT, restauracion ni cambiar
configuracion. Usar un acceso administrativo SQL EXISTENTE; no ampliar permisos
de la cuenta de HostFlow. Una cuenta con acceso al Portal no necesariamente tiene
permisos administrativos dentro de SQL.

## Azure Portal: opcion directa

1. Abrir la base **HostFlow** del recurso/servidor aprobado. Comprobar el recurso
   en la pagina de la base antes de abrir una consulta.
2. Abrir **Editor de consultas (version preliminar)**. Autenticarse con la cuenta
   administrativa SQL existente o Microsoft Entra si ese acceso ya esta configurado.
   Introducir credenciales solo en Portal, nunca en chat, archivos o .env.
3. Copiar el contenido completo de cada archivo siguiente y ejecutarlo POR
   SEPARADO, en este orden. No copiar otros scripts SQL ni habilitar flags.

| Archivo relativo a backend | Que verificar |
| --- | --- |
| sql/proposals/seguridad_etapas_3_4/06_destino_azure_solo_lectura.sql | HostFlow, servidor aprobado, motor 5, collation SQL_Latin1_General_CP1_CI_AS, VIEW DEFINITION=1, transacciones=0 e implicitas=0 |
| sql/proposals/seguridad_etapas_3_4/03_comprobacion_administrativa_solo_lectura.sql | Inventario completo sin Usuarios ni equivalente de autenticacion; Roles existente y los tres nombres activos |
| sql/proposals/seguridad_etapas_3_4/07_permisos_migracion_solo_lectura.sql | VerEsquema, CrearTabla, AlterarEsquemaDbo, ReferenciarRoles y LeerRoles = 1; claves IdRol/Nombre unicas habilitadas |

06: si el destino no coincide o VIEW DEFINITION=0, detenerse. 03: la ausencia
solo es concluyente con visibilidad completa; revisar tambien objetos de otro
nombre/esquema con columnas de autenticacion. No compartir todo el inventario.
Los registros esperados de Roles son Administrador (1), Propietario (2), Operador
(3), todos Activo=1. No corregirlos automaticamente si difieren.

07: basta que los cinco permisos indicados sean 1; no es necesario pertenecer
a db_owner/db_ddladmin si los derechos efectivos ya existen. Los permisos de
Usuarios antes de crearla no acreditan su operacion futura. No ejecutar GRANT.
La conexion administrativa es para migrar; no se transferira al backend.

Si Portal rechaza el acceso, no modificar autenticacion/firewall/permisos como
parte de esta comprobacion. Usar SSMS con el acceso existente o informar el error
sin incluir credenciales. El bloqueo se resuelve con una identidad ya autorizada.

## SSMS: alternativa

1. Conectar al servidor Azure aprobado, con autenticacion existente. Usar
   **Encrypt obligatorio** y **Trust server certificate desmarcado**.
2. Seleccionar HostFlow en la conexion/selector de base. Abrir Nueva consulta.
3. Abrir/copiar 06, 03 y 07 y ejecutar cada archivo separadamente, comprobando
   las condiciones de la tabla anterior. No envolverlos en una transaccion.

## Confirmar recuperacion PITR sin restaurar

1. En la pagina de HostFlow en Portal, abrir **Restaurar** solo para consultar
   los puntos disponibles. NO pulsar Crear ni Revisar y crear. Anotar fecha/hora
   mas antigua y mas reciente que permite seleccionar, con zona horaria.
2. En el servidor logico, **Copias de seguridad / Backups > Directivas de
   retencion**, consultar la retencion a corto plazo de HostFlow. No editarla.
   El nombre de estas opciones puede variar con la interfaz del Portal.
3. Confirmar que un responsable con permisos Azure de restauracion puede hacer
   PITR dentro de esa ventana. Los permisos SQL de la migracion no acreditan
   permisos de restauracion en Azure. Un boton inaccesible no demuestra ausencia
   de backups; pedir la comprobacion al responsable ya autorizado.

La conexion del backend no pudo consultar sys.dm_database_backups. No se infiere
retencion ni disponibilidad a partir del comportamiento por defecto del servicio.
Esa vista, aunque se pueda leer, no prueba por si sola la cadena restaurable o
los derechos para restaurar. No probar restauracion en esta etapa: crea otra base.

Antes de migrar, acordar ventana y registrar una referencia UTC anterior a la
operacion dentro del intervalo recuperable confirmado. PITR restaura a una BASE
NUEVA; no reemplazar HostFlow ni perder operaciones posteriores por rutina.

## Respuesta minima para cerrar el bloqueo

Compartir solamente:

- Destino correcto y motor 5; collation; VIEW DEFINITION=1.
- Ausencia confirmada de Usuarios/equivalentes en inventario completo.
- Roles/nombres/estados esperados.
- Los cinco permisos de migracion indicados = 1.
- Retencion corta, ventana PITR (zona horaria) y responsable con acceso para restaurar.

No enviar contraseñas, hashes, cadenas, IDs de suscripcion ni inventarios privados.
Si un valor no coincide, indicar ese valor; no cambiar nada para hacerlo coincidir.
Con resultados satisfactorios: autorizar publicacion preparada y migracion exacta
en el orden acordado; INSERT del primer Admin y corte SQL siguen separados.

Fuentes: [Editor de consultas](https://learn.microsoft.com/en-us/azure/azure-sql/database/query-editor),
[PITR en Azure](https://learn.microsoft.com/en-us/azure/azure-sql/database/recovery-using-backups?view=azuresql),
[backups y retencion](https://learn.microsoft.com/en-us/azure/azure-sql/database/automated-backups-overview?view=azuresql).
