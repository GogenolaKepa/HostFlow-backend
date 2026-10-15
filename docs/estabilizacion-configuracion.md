# Estabilización de Configuración empresarial

> Registro histórico de estabilización local. El estado posterior de Azure y las instrucciones que NO deben repetirse están en [estado vigente](estado-publicacion.md). Esta auditoría de publicación no consulta ni modifica la base.

Estado: desarrollo local preparado para revisión. No se consultó ni modificó
Azure durante esta tanda. No hubo commits, push, deploy, cambios de secretos,
cuentas reales ni autenticación. El usuario inicia sus servicios personalmente;
solo se usaron servidores efímeros de pruebas con API interceptada.

Se conservaron las bases publicadas ba1bd0ea8c2b30ddbe76e39bbbcdd863739b6557
(backend) y 11d8df35fd3b2641a8050f4fce1590ff00b7c5f0 (frontend), y los 25/15
archivos pendientes al comenzar. El inventario actualizado de TODOS los cambios
está en archivos-configuracion-empresa.json; no representa solo esta última tanda.

## Problemas corregidos y alcance

- Los borradores solo estaban protegidos dentro de Configuración. Ahora un
  registro en memoria comparte la decisión de salir entre Configuración y
  Dashboard, incluidos perfil, navegación móvil/colapsada y logout voluntario.
  Cancelar conserva valores, errores y apartado. Confirmar ejecuta una sola
  salida. Pulsar Configuración activa conserva su apartado sin pedir descarte.
- Recarga y cierre usan beforeunload nativo. El navegador controla el texto y
  puede exigir interacción previa; no se promete interceptar un cierre forzado
  del navegador/sistema. No hay almacenamiento persistente del borrador.
- Expiración, 401/revocación y 403 de cambio obligatorio desmontan la protección
  sin esperar al usuario. No se cambió App, session, Mi cuenta ni Usuarios.
- El guardado tiene exclusión inmediata por referencia para impedir duplicados,
  además de deshabilitar los controles. Se bloquean salidas mientras está en curso.
- Una respuesta 200 incompleta conserva el borrador, no muestra éxito y exige
  recargar para conocer el estado real. Puede haberse guardado del lado servidor;
  no se repite a ciegas. Lo mismo se exige ante rowversion vencida (409).
- Las respuestas empresariales validan tipos, límites, controles y correo.
  La empresa técnica inicial vacía sigue siendo válida para cargar y completar;
  guardar exige nombre comercial. No se inventan datos ni se copia al Administrador.
- Los predeterminados ahora verifican también la zona fija. Se verificaron fallos
  de red, respuesta inválida, función apagada, cierre con petición pendiente,
  reapertura de borrador y reinicio de horas editadas tras alta ficticia exitosa.
  Reservas.jsx conserva solo las cinco inserciones acotadas de la etapa anterior.
- Los botones de confirmación usan los estilos del módulo; el aviso compartido
  hereda sus tokens en Claro/Oscuro/Automático y devuelve el foco al cancelar.
- La inspección SQL propone el inventario completo de columnas, sin depender del
  nombre de una posible estructura equivalente. La base esperada se compara de
  forma binaria y con longitud exacta. DDL/vinculación rechazan transacciones
  previas; sus flags siguen apagados. La verificación incluye defaults, índices
  y marcas, además de columnas, CHECK, FK y cantidades.

No se cambian reglas operativas, permisos existentes del Operador, reservas,
canales, limpiezas, usuarios SQL, bootstrap, login, CORS ni configuración permanente.
Dashboard recibió solo conexiones de navegación al protector; App.css no cambió.

## Revisión de seguridad y SQL local

La API exige JWT y autorización antes del controlador. Operador obtiene 403 en
empresa/operativas y solo recibe horas/zona por predeterminados (reservas.crear).
Entradas desconocidas o inválidas dan 400; sesión inválida/revocada da 401; cambio
obligatorio, 403; revisión vencida, 409; persistencia no activada, 503 sin tocar SQL.
Respuestas permitidas usan no-store y DTO cerrados. No se acepta IdEmpresa del
cliente ni se infiere del usuario. SELECT/UPDATE se parametrizan y filtran por
la vinculación del servidor. El UPDATE y su relectura comparten una transacción
y el applock de seguridad; se revalidan rol, estado y VersionSesion antes de escribir.
Errores SQL se traducen sin detalles internos ni parámetros.

Se ejecutó exclusivamente HostFlow_Test_Seguridad LOCAL con Windows integrado,
Shared Memory, identidad física/instancia, marca de aislamiento y runId. El runner
mantiene cuatro tablas permitidas (Roles, Usuarios, Empresas, PreferenciasOperativas);
el runner de seguridad anterior mantiene sus dos tablas originales. Cada petición
valida el destino. Limpieza transaccional solo sobre objetos del runId e IDs
acreditados, en orden de FK. Sin crear bases ni ampliar el conjunto de borrado.

Las seis pruebas locales (cinco casos más contenedor) verifican DDL original
adaptado únicamente en memoria, vinculación vacía/no repetible, FK/CHECK, horarios,
persistencia, aislamiento de filas, concurrencia 409, rollback real después de
UPDATE, actor revocado y Operador. Al terminar se comprueba que no quedan tablas
de usuario en la base de prueba. La segunda empresa es exclusivamente un fixture
para detectar consultas sin filtro: no habilita multiempresa en HostFlow.

La primera ejecución dentro del sandbox no pudo abrir SQL/Edge; las comprobaciones
se ejecutaron después con los permisos del entorno para esos procesos locales,
sin Full Access, sin cambiar las guardas del runner y sin conectar a Azure.
Durante el desarrollo se corrigió también la espera del evento asíncrono de cierre
de pestaña en el test; la prueba final conserva el aviso real, no lo simula.

## Verificaciones finales

| Comprobación | Resultado esperado de cierre |
| --- | --- |
| npm test backend | 133 aprobadas |
| npm test frontend | 41 aprobadas |
| npm run test:browser frontend | 21 aprobadas (20 casos + contenedor) |
| npm run test:sql:configuracion backend | 6 aprobadas (5 casos + contenedor) |
| Build/lint/sintaxis/diff --check | Sin errores; aviso previo del tamaño del bundle |

Sintaxis: 142 archivos JavaScript backend y 22 frontend; JSX comprobado por
build/lint. Lint frontend completo y archivos nuevos backend sin advertencias.
Se eliminó el throw desde finally del runner, preservando la limpieza ante errores
y su prioridad si falla: una prueba hermética verifica éxito/fallo/limpieza fallida,
y la integración real LOCAL volvió a pasar con el mismo conjunto de objetos.

Navegador Edge con perfil independiente y TODA la API interceptada; ninguna cuenta
real, petición operativa ni SQL remoto. Hay casos de los tres temas, 320/390/820/1280
px, móvil, sidebar colapsada, teclado/Escape/foco, formularios, errores y confirmaciones.
Se inspeccionaron capturas ficticias en revision/configuracion-estabilizacion,
fuera de ambos repositorios. Build sin tests/fixtures/documentos ni capturas.

## Guía de activación futura: A–G

No ejecutar estas etapas con la autorización de desarrollo local. Cada cambio
Azure necesita aprobación explícita; no elevar la identidad del backend.

### A. Inspección exclusivamente de lectura

Revisar y autorizar primero sql/proposals/configuracion_empresa/00_metadatos_solo_lectura.sql.
Ejecutarlo en una sesión administrativa existente de Azure Portal/SSMS apuntando
a HostFlow. Solo SELECT de identidad, collation, visibilidad, tablas/columnas/FK
y permisos; sin datos de negocio o de usuarios. Confirmar EngineEdition=5, servidor
exacto, VIEW DEFINITION y ausencia de estructuras empresariales equivalentes.
Si falta visibilidad o existe una equivalente, detener el DDL y ajustar el diseño.
No confundir PrincipalSesionInspeccion (administrativo) con el principal del backend.
Confirmar en Azure Portal la ventana PITR disponible y el punto de recuperación
previo; no iniciar restauraciones. Cambio en Azure: ninguno.

### B. Revisión del modelo

Aprobar el contenido exacto y la huella SHA-256 de los cinco scripts del inventario.
Revisar Empresas (15 columnas) y PreferenciasOperativas (8), dos PK, tres FK sin
cascada, cuatro CHECK y cinco defaults de fechas/activo. Usuarios solo se referencia
por IdUsuario; no se altera. NombreComercial NULL acredita el borrador técnico;
el nombre es obligatorio para guardar desde API. Horas con precisión de minutos
y zona Buenos Aires fija. Cambio en Azure: ninguno.

### C. Migración (autorización de DDL separada)

Usar 01_modelo_empresa_preferencias.sql en una copia revisada para ejecución.
Solo después de autorizar: Aplicar=1, InventarioRevisado=1, BaseEsperada=N'HostFlow'
y ServidorEsperado con el valor EXACTO confirmado en A. Mantener el original
bloqueado en Git. Ejecutar el batch completo, sin dividirlo ni envolverlo en otra
transacción, desde una sesión administrativa con VIEW DEFINITION, CREATE TABLE,
ALTER del esquema dbo y REFERENCES sobre dbo.Usuarios. No conceder eso al backend.
Solo se crean las dos tablas y sus objetos/marcas, atómicamente; no se insertan filas.
Verificar con 03_verificacion_solo_lectura.sql: columnas, PK/índices, CHECK/FK
habilitadas/confiables, defaults y dos marcas hostflow-configuracion-empresa-v1;
ambas tablas con cero filas. Ante fallo/commit incierto, inspeccionar antes de repetir.

### D. Vinculación empresarial inicial (autorización DML separada)

Después de C y de verificar que las tablas están vacías, autorizar una copia de
02_vinculacion_inicial_pendiente.sql: Aprovisionar=1 y ServidorEsperado exacto.
Sesión administrativa, sin transacción previa, con SELECT/INSERT en las tablas
nuevas y visibilidad de sus metadatos. Ejecutar el batch completo. Crea UNA empresa
técnica con datos comerciales NULL y UNA preferencia 15:00/10:00/Buenos Aires;
la existencia de una empresa impide repetir. Registrar IdEmpresaVinculada y verificar
con 03 que hay una fila en cada tabla. No crea cuentas ni asigna usuarios.

### E. Permisos (autorización separada)

Desde la conexión REAL del backend, solo lectura:

```sql
SELECT USER_NAME() AS PrincipalBackend,
 HAS_PERMS_BY_NAME(N'dbo.Empresas','OBJECT','SELECT') AS LeerEmpresa,
 HAS_PERMS_BY_NAME(N'dbo.Empresas','OBJECT','UPDATE') AS EditarEmpresa,
 HAS_PERMS_BY_NAME(N'dbo.PreferenciasOperativas','OBJECT','SELECT') AS LeerPreferencias,
 HAS_PERMS_BY_NAME(N'dbo.PreferenciasOperativas','OBJECT','UPDATE') AS EditarPreferencias;
```

Con ese principal verificado, completar 04_permisos_propuestos_solo_lectura.sql
en la sesión administrativa: solo devuelve texto de dos GRANT, con QUOTENAME.
Revisar el texto y autorizar su ejecución separada solo si faltan permisos.
El backend necesita SELECT/UPDATE en las dos tablas, además de sus permisos de
seguridad ya vigentes sobre Usuarios/Roles y applock. No INSERT, DELETE, ALTER,
db_owner, permisos de esquema generales ni cambios sobre identidades existentes.
Repetir el SELECT anterior para comprobar los permisos efectivos.

### F. Activación (autorización de configuración separada)

Verificar empresa activa y ambas filas para el ID de D. Mantener la autenticación
SQL existente. Solo tras autorización, el usuario detiene/reinicia su backend con
variables temporales. Ejemplo Git Bash, reemplazando el ID por el verificado:

```bash
HOSTFLOW_AUTH_SOURCE=sql HOSTFLOW_CONFIGURACION_ENABLED=1 HOSTFLOW_EMPRESA_ID='<ID_VERIFICADO>' npm run dev
```

No modificar .env ni variables permanentes. No reiniciar servicios desde el agente.
No ejecutar migraciones ni aprovisionamiento al arrancar. Sin bandera/ID/modelo
válidos, la función continúa cerrada y no simula persistencia.

### G. Validación funcional controlada

Administrador abre solo Configuración, completa datos reales y confirma un guardado
expresamente autorizado de las tablas NUEVAS. Recarga y verifica persistencia,
concurrencia y borradores. Operador conserva Apariencia, no ve empresa/operativas y
obtiene 403 por API administrativa; GET predeterminados solo entrega horas/zona.
No abrir módulos con GET que sincronizan Azure para probar estilos/horarios:
Reservas, Limpiezas, Alertas, Calendario y FlowIA requieren revisar sus efectos.
La alta de reserva se mantiene en pruebas interceptadas hasta autorizar escrituras
operativas reales. Verificar que no cambian usuarios ni reservas existentes.

## Recuperación y decisiones pendientes

Un error dentro de la migración/vinculación revierte la transacción propia. Si el
commit se confirmó o su estado es incierto, conservar objetos y ejecutar solo la
verificación autorizada; no repetir ni borrar automáticamente. Desactivar únicamente
HOSTFLOW_CONFIGURACION_ENABLED en el próximo inicio temporal devuelve la función
a pendiente, preservando tablas/datos y autenticación SQL. No regresar a mock como
solución. Una corrección de esquema, borrado o restauración PITR requiere aprobación.

La instalación sigue siendo de UNA organización. HOSTFLOW_EMPRESA_ID es vinculación
del servidor, no membresía de seguridad ni selector de empresas. Antes de compartir
una instalación entre negocios hacen falta membresías SQL y aislamiento completo
de usuarios/propiedades/reservas. No habilitar esa arquitectura con este bloque.

Pendientes: inspección real de equivalencias, aprobación de modelo exacto, DDL,
vinculación inicial, permisos mínimos, activación temporal y validación Azure de
las tablas nuevas. También publicación, prueba en otros navegadores y optimización
del bundle en su etapa correspondiente. Ninguno se ejecutó en esta tanda.
