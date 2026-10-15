# Activación controlada de Configuración empresarial

> Registro histórico de preparación. C/D/E y el primer guardado fueron confirmados posteriormente por el usuario; el proceso volvió a solo lectura. Ver [estado vigente](estado-publicacion.md). NO repetir migración, vinculación, concesiones o bootstrap por publicar este documento.

## Estado y límite de esta preparación

El usuario confirmó C/D/E en Azure: servidor hostflow, base HostFlow, Empresa 1
activa, preferencias 15:00/10:00 y America/Argentina/Buenos_Aires; 48 permisos
específicos confirmados sobre 19 tablas. hostflow_app conserva db_datareader y
db_datawriter por decisión expresa. No retirarlos como parte de esta prueba.
Es evidencia informada por el usuario; el agente no volvió a consultar Azure.
Los informes anteriores conservan el estado histórico de cuando se prepararon.

Esta entrega no ejecuta SQL, inicia servicios, modifica .env, permisos, cuentas
ni datos. No repite migración, bootstrap o vinculación. La fase inicial permite
consultar Configuración y bloquea sus guardados en el backend.

## Banderas y destino

| Variable temporal del backend | Valor inicial | Efecto |
| --- | --- | --- |
| HOSTFLOW_AUTH_SOURCE | sql | Solo cuentas SQL; sin autenticación dual ni fallback mock. |
| HOSTFLOW_CONFIGURACION_ENABLED | 1 | Habilita las consultas de Configuración; sin 1 la función sigue cerrada. |
| HOSTFLOW_EMPRESA_ID | 1 | Vincula esta instancia únicamente a la empresa ya verificada. |
| HOSTFLOW_CONFIGURACION_READ_ONLY | 1 | Bloquea ambos PUT de Configuración con 503 CONFIGURACION_SOLO_LECTURA antes de usar el repositorio. |

IdEmpresa se obtiene del servidor, no del cuerpo, query, JWT ni navegador. El
código permite configurar otra clave válida en otra instalación; estos comandos
fijan exclusivamente 1 para HostFlow. No hay selección implícita de primera fila.

La guarda de lectura se evalúa también al llamar directamente a guardar() del
servicio. Con 1, vacío u otro valor inválido rechaza escrituras. Solo ausencia o
0 conservan el guardado anterior, siempre sujeto a las demás banderas y permisos.
No modificar la variable mientras se atiende tráfico. No reemplaza una cuenta
SQL de solo lectura: controla exclusivamente estos dos guardados de Configuración.
Los demás módulos conservan sus comportamientos y permisos existentes.

## Inicio manual: Git Bash (MINGW64)

Detener con Ctrl+C cualquier backend anterior desde su propia terminal antes de
iniciar el nuevo. No ejecutar dos instancias. El usuario inicia los servicios;
el agente no los inicia ni reinicia. En dos terminales, desde cada repositorio:

Backend, primero (una sola línea):

```bash
NODE_ENV=development HOST=127.0.0.1 PORT=4000 HOSTFLOW_CORS_ORIGINS=http://127.0.0.1:5173 HOSTFLOW_AUTH_SOURCE=sql HOSTFLOW_CONFIGURACION_ENABLED=1 HOSTFLOW_EMPRESA_ID=1 HOSTFLOW_CONFIGURACION_READ_ONLY=1 npm run dev
```

Frontend, después (una sola línea):

```bash
VITE_API_URL=http://127.0.0.1:4000/api npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Abrir http://127.0.0.1:5173. Se mantiene la conexión Azure ya existente; no copiar
credenciales a estos comandos. Las variables anteriores aplican solo al comando y
sus procesos hijos, sin exportarlas ni modificar archivos. La URL API y CORS
apuntan al mismo origen de prueba local, sin exponer el servidor en la red local.
Si los puertos están ocupados, resolver la instancia anterior; strictPort evita
que Vite cambie de puerto silenciosamente. No usar sintaxis $env: de PowerShell
dentro de Git Bash. Las variables del proceso tienen prioridad sobre dotenv.

El arranque SQL comprueba base HostFlow, permisos de seguridad, Administrador
activo y ambos roles asignables mediante SELECT. No migra ni crea usuarios y no
vuelve a mock ante un fallo. El mensaje de arranque por sí solo no acredita las
tablas empresariales: los GET de Configuración verifican sus dos marcas del modelo
y la existencia/actividad de la empresa y sus preferencias.

## Fase de lectura: prueba privada del usuario

1. Usar dos perfiles de navegador o una ventana normal y otra privada para las
   cuentas SQL ya existentes. Introducir las credenciales personalmente. No
   compartir tokens, capturas de datos reales ni respuestas de login.
2. Entrar con Administrador, abrir Configuración → Datos de empresa. Debe cargar
   sin error; los campos iniciales vacíos son válidos para lectura, no obligan a
   guardar. Abrir Preferencias operativas: 15:00, 10:00 y zona Buenos Aires fija.
   Usar «Recargar datos» sin editar y comprobar que vuelve el mismo contenido.
3. No cambiar campos ni confirmar guardados en esta fase. Los controles de edición
   del Administrador conservan su aspecto; la guarda es del servidor. Incluso un
   PUT directo de Administrador sería rechazado con 503 sin acceder a las tablas
   de Configuración. No hace falta enviarlo a Azure: ya se acredita en la prueba
   API hermética. No confundir ese 503 esperado con un error de conexión.
4. Con Operador, Configuración permite Apariencia. Datos de empresa y Preferencias
   operativas no aparecen; Usuarios tampoco. La lectura limitada de horarios
   predeterminados sí está autorizada, sin identidad empresarial ni revisión.
   No abrir Reservas para comprobarlo: ese módulo puede sincronizar datos.
5. Informar solo éxito/error y códigos HTTP, sin contenido empresarial privado.
   En una ventana ya autenticada que dé 401, revisar vencimiento/servicio antes
   de tocar datos. No modificar usuarios ni contraseñas para diagnosticarlo.

El dashboard inicial actual consulta /dashboard/resumen y /dashboard/historico:
sus handlers no escriben. FlowIA no consulta hasta que se abre. Evitar Reservas
(/reservas y /reservas/:id finalizan vencidas), Limpiezas (I/U TareasLimpieza),
Alertas (I/U Alertas), Calendario (el frontend también pide Limpiezas) y FlowIA
(/recomendaciones sincroniza limpiezas). HEAD puede ejecutar el mismo GET.
No probar operaciones de propiedades, huéspedes, canales o integraciones.
No usar «Cerrar sesión» durante la fase estricta sin escrituras de cuentas:
el logout revoca la sesión actualizando VersionSesion en Usuarios. Mantener las
ventanas separadas y cerrarlas al terminar, sin guardar cambios de perfil.

### Permisos que deben conservarse

| Acción | Administrador, lectura temporal | Operador |
| --- | --- | --- |
| GET empresa y operativas | 200, contenido y revisión | 403 |
| PUT empresa y operativas | 503 por guarda; 200 solo tras autorización y retiro de guarda | 403 |
| GET predeterminados-reserva | 200, solo horarios/zona | 200, solo horarios/zona |
| Configuración en sidebar / Apariencia | Disponible | Disponible |
| Datos de empresa / Preferencias operativas en interfaz | Disponibles | Ocultas |

Sin JWT válido: 401 antes del controlador. Las restricciones por rol y cambio
obligatorio siguen antes del servicio: la guarda no convierte un 401/403 en 503.

## Comprobación SQL preparada, no ejecutada

[00_comprobacion_solo_lectura.sql](../sql/proposals/configuracion_empresa_activacion/00_comprobacion_solo_lectura.sql)
contiene solo SELECT. Primero ejecutar únicamente identidad, confirmar el servidor
hostflow, HostFlow y EngineEdition=5; detenerse ante cualquier discrepancia. Las
restantes consultas cuentan filas, revisan empresa activa, horarios, zona, fechas,
rowversion, marcas y permisos. No devuelven contactos ni valores comerciales,
filas de Usuarios ni datos operativos. La ejecución necesita autorización separada;
no se conecta ni ejecuta automáticamente desde Node.

Resultado inicial esperado: una empresa total, una activa con IdEmpresa=1, una
preferencia total vinculada a 1, los horarios/zone indicados y dos marcas exactas
hostflow-configuracion-empresa-v1. Cuatro permisos efectivos de SELECT/UPDATE=1.
Los permisos de una sesión administrativa no prueban los del backend. Ya existe
la confirmación independiente de 48/48 del usuario; no repetir GRANT para probarlo.
Si se autoriza ejecutar antes/después de la fase de lectura, las revisiones y
fechas de estas dos filas deben permanecer iguales. No publicar estos resultados
en Git ni interpretar rowversion como contador de cantidad de ediciones.

## Fase de guardado: PENDIENTE de autorización explícita

No ejecutar esta fase como parte de la prueba de lectura. Primero acordar qué
campo/tabla se va a guardar, valor previo, valor nuevo y confirmación personal.
No inventar datos comerciales ni modificar horarios reales para simular pruebas.
La concurrencia ya se prueba con fixtures; no provocar conflictos escribiendo
varias veces sobre la empresa real sin una autorización adicional.

Una vez autorizada una escritura concreta: el usuario detiene el backend con
Ctrl+C e inicia el MISMO comando de arriba sustituyendo únicamente
HOSTFLOW_CONFIGURACION_READ_ONLY=1 por HOSTFLOW_CONFIGURACION_READ_ONLY=0. No
cambiar ninguna otra variable ni quitar autenticación SQL. Recargar el formulario
para obtener la revisión vigente y confirmar personalmente un único guardado.
Después recargar y verificar el valor autorizado y la nueva revisión. No crear
reservas para demostrar la persistencia de preferencias. Volver al comando de
lectura con =1 al terminar si todavía se desea mantener los guardados bloqueados.

El único UPDATE de cada guardado afecta dbo.Empresas O dbo.PreferenciasOperativas,
según el formulario, con IdEmpresa del servidor y VersionRegistro esperado. Incluye
FechaActualizacion UTC e IdUsuarioActualizacion. No escribe Usuarios para auditar:
solo lo consulta junto a Roles al revalidar el editor. Usa transacción y applock de
seguridad; versión vencida produce 409 y rollback, nunca sobrescritura silenciosa.
No altera usuarios, reservas, propiedades, huéspedes, limpiezas, alertas o canales.
Los horarios se propondrán en futuras altas manuales, no cambian reservas ni
sincronizaciones existentes; abrir esas altas tampoco forma parte de esta prueba.

## Detención y recuperación funcional

Ante fallo de conexión, destino, marca o permisos, no reaprovisionar ni dar derechos
amplios adicionales. Conservar datos y reportar solo el código/mensaje seguro.
Un conflicto requiere recargar y revisar antes de guardar otra vez. Ante una
confirmación ambigua no reenviar: verificar la lectura primero. Para suspender
Configuración, reiniciar personalmente con HOSTFLOW_CONFIGURACION_ENABLED=0,
conservando HOSTFLOW_AUTH_SOURCE=sql. No borrar filas/tablas ni revertir otros datos.

Quedan pendientes la autorización del primer guardado, la validación real de la
lectura por ambos roles y, separadamente, el retiro controlado de roles SQL amplios.
No se requieren cambios permanentes, migraciones ni elevación de permisos para
esta activación temporal.

## Comprobaciones locales de esta entrega

- Dependencias instaladas de ambos repositorios: npm ls --depth=0 sin faltantes.
- Backend: 142 pruebas herméticas aprobadas (139 anteriores y tres nuevas).
  Se acredita GET permitido en modo lectura, los dos PUT bloqueados antes de
  lecturas/transacciones de Configuración, 401/403 conservados y manejo seguro de
  códigos de activación. Se mantienen las pruebas de destino y concurrencia.
- Frontend: 41 pruebas aprobadas, build y lint correctos. Persiste únicamente el
  aviso previo de bundle mayor a 500 kB. No se modificó código del frontend.
- Lint de los cinco archivos JS de esta corrección, sintaxis y git diff --check
  correctos. No se repitieron pruebas SQL ni pruebas operativas reales.
- El filtro global de errores 5xx ahora reconoce seis códigos de Configuración,
  siempre con mensajes constantes y descartando extras. Antes los convertía en
  ERROR_INTERNO y ocultaba incluso el estado de activación pendiente.
- Se actualizaron solo las tres huellas fuente correspondientes a la guarda,
  el servicio y ese filtro en modelo-permisos.json. Las 118 llamadas SQL, matriz,
  referencias y seis scripts administrativos no cambiaron. Los cinco SQL originales
  de Configuración conservan sus huellas; el nuevo SELECT está en carpeta aparte.

La validación real de Azure de esta fase queda pendiente de que el usuario inicie
manualmente los servicios y compruebe la lectura. No se declara probada a partir
de estos dobles aislados. No hubo conexiones Azure, escrituras SQL, commits,
push, deploy o cambios en .env durante esta preparación.
