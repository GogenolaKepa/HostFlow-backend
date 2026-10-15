# Configuración empresarial: implementación local pendiente de activar en Azure

> Diseño y procedimiento históricos. Ver [estado vigente](estado-publicacion.md): C/D/E y el primer guardado ya se completaron según el usuario. NO repetir creación de tablas, vinculación, bootstrap o concesiones al publicar.

## Arquitectura encontrada y alcance

Base de trabajo: backend ba1bd0ea8c2b30ddbe76e39bbbcdd863739b6557 y frontend
11d8df35fd3b2641a8050f4fce1590ff00b7c5f0. Ambos estaban limpios.

El código usa Express con autenticación/rol/cambio obligatorio antes de los
controladores, repositorios mssql y conexión Azure con TLS y certificado validado.
Usuarios/Roles mantienen el modelo de seguridad aprobado. Los modelos y consultas
de Propiedades no incluyen IdEmpresa, propietario ni horarios propios. Dirección
y ciudad de una propiedad describen el inmueble, no la empresa. El rol Propietario
no representa una organización ni permite inferir datos de empresa.

Reservas guarda fecha y hora; el formulario de alta manual propone 15:00/10:00.
La limpieza automática parte del checkout y de la siguiente reserva, con zona
America/Argentina/Buenos_Aires y horizonte de 365 días. No se modificaron esas
reglas, reservas existentes, ediciones, canales, conflictos, servicios operativos,
datos económicos, usuarios ni autenticación. El usuario aprobó conservar la zona
horaria fija y no editable durante esta etapa.

No hay un repositorio/configuración empresarial reutilizable en el código.
La existencia de tablas SQL equivalentes empresariales en Azure NO se comprobó
en esta tanda: no hubo conexiones a Azure. Antes de aprobar la nueva migración
hay que revisar 00_metadatos_solo_lectura.sql con inventario completo y suficiente
visibilidad. Si existe una estructura equivalente, adaptar la propuesta; no
crear una segunda fuente de información. Ningún script se ejecuta al iniciar.

## Empresa y aislamiento

Se proponen dbo.Empresas (15 columnas) y dbo.PreferenciasOperativas (8 columnas).
Empresa tiene identidad técnica, datos opcionales, Activo, fechas UTC, auditoría
de la cuenta que editó y rowversion. Preferencias tiene PK/FK IdEmpresa: una fila
por empresa, horarios time(0), zona fija, fechas, auditoría y rowversion. Hay dos
PK, tres FK sin cascadas y cuatro CHECK. Los PK soportan las búsquedas por empresa;
no hace falta un índice global ni alterar tablas existentes.

La empresa inicial puede estar en borrador, sin datos empresariales inventados;
NombreComercial es NULL hasta que el Administrador lo complete. Guardar desde la
API exige nombre comercial no vacío. El contacto no se toma del email del Admin.
La vinculación inicial no asigna ni cambia cuentas existentes.

Los repositorios SIEMPRE reciben IdEmpresa desde el contexto del servidor, nunca
desde cliente, query, JWT o localStorage. No se selecciona la primera empresa ni
hay IdEmpresa=1 implícito. Las consultas y UPDATE incluyen esa clave. Un cliente
que intenta enviar IdEmpresa, Activo o Actor obtiene 400. La API no lista empresas.

HOSTFLOW_EMPRESA_ID vincula esta instalación de UNA organización. Administrador
administra ese negocio; no es Superadministrador de plataforma. La configuración
está preparada con claves por empresa, pero la aplicación todavía NO es multitenant:
usuarios, reservas y propiedades actuales son de una sola organización. Antes de
habilitar varias empresas en una instalación compartida serán necesarias membresías
SQL de usuarios, contexto derivado de la sesión y aislamiento de todas las tablas,
rutas y gestión de cuentas. No basta con agregar un selector de empresa al cliente.
Tampoco compartir estas cuentas/bases entre instalaciones de negocios diferentes
sin incorporar primero dichas membresías e imponer su aislamiento.

## API, permisos y concurrencia

| Ruta | Permiso | Administrador | Operador |
| --- | --- | --- | --- |
| GET /api/configuracion/empresa | configuracion.ver | Sí | 403 |
| PUT /api/configuracion/empresa | configuracion.modificar | Sí | 403 |
| GET /api/configuracion/operativas | configuracion.ver | Sí | 403 |
| PUT /api/configuracion/operativas | configuracion.modificar | Sí | 403 |
| GET /api/configuracion/predeterminados-reserva | reservas.crear | Sí | Sí: solo horarios/zona |

Sin JWT válido se obtiene 401. Sesión revocada/inactiva y cambio obligatorio
conservan las protecciones existentes. Los dos permisos nuevos son solo Admin;
la lista anterior de permisos del Operador no cambió. Ninguna consulta nueva GET
sincroniza, inserta ni actualiza datos. Las respuestas son no-store.

El guardado usa SQL parametrizado, una lista cerrada de campos, revisión binary(8)
y una transacción. Comparte el applock de seguridad existente para revalidar el
actor, su rol, estado y VersionSesion mientras no puede ser demovido concurrentemente.
El UPDATE usa OUTPUT para acreditar el cambio incluso con NOCOUNT. Revisión vencida
da 409, no pisa otra edición y hace rollback. Fallos no devuelven errores del driver.

## Preferencias que realmente se aplican

Los horarios se consultan únicamente al abrir el alta MANUAL de una reserva y se
proponen en los campos no editados. Una respuesta tardía no pisa horas cambiadas
por la persona. Cerrar/reabrir conserva horas de un borrador modificado; después
de registrar una nueva reserva se reinicia ese borrador. Si no hay persistencia,
se conservan los horarios del formulario y se informa que no se pudieron consultar
los predeterminados. No hay nuevos fallbacks en el backend de reservas.

No se usan estos predeterminados para editar reservas, aceptar propuestas Airbnb,
sincronizar Booking ni reprogramar limpiezas. Zona y limpieza son información
de las reglas actuales, sin interruptores falsos. En el futuro, horarios propios
de una propiedad necesitarán su modelo y una precedencia explícita aprobada.

## Interfaz

Datos de empresa incluye nombre comercial, razón social, correo, teléfono, país,
provincia/región, ciudad, dirección e información adicional. Preferencias permite
los dos horarios. Hay carga/reintento, validación inline, confirmación de guardado,
éxito únicamente tras respuesta completa, borrador conservado ante fallos,
recarga/descartar confirmados y advertencia al cambiar secciones con cambios.
Las advertencias de borrador cubren subsecciones, módulos, perfil, menú móvil,
sidebar colapsada y cierre de sesión voluntario. Cancelar conserva campos y errores;
confirmar continúa la acción. Pulsar Configuración activa no reinicia su apartado.
Recargar/cerrar pestaña usa el aviso nativo del navegador (texto y disponibilidad
dependen de este). No se persiste el borrador ni se bloquean 401, vencimiento o
cambio obligatorio. El registro se libera al desmontar cada formulario.
Los conflictos y confirmaciones de guardado incompletas requieren recarga; nunca
se muestran como éxito. Apariencia se extrajo a un componente sin cambiar
el controlador central, tokens ni preferencia local. Configuración no crece dentro
de App.css; los estilos nuevos viven en settings.css. Dashboard solo conecta las
salidas a un protector de borradores compartido, sin refactorización del módulo.

## Activación real: cada escritura requiere aprobación separada

1. Revisar los SELECT de 00_metadatos_solo_lectura.sql y autorizar su ejecución
   para descartar equivalentes y verificar Usuarios/requisitos de migración.
2. Aprobar el contenido de 01_modelo_empresa_preferencias.sql, verificar el destino
   Azure exacto y la recuperación PITR previamente disponible. El archivo permanece
   bloqueado: Aplicar=0, InventarioRevisado=0, destino NULL. Solo una copia revisada
   y autorizada puede habilitar esas declaraciones. Ejecutar desde una identidad
   administrativa, nunca elevando los permisos del backend.
3. Verificar columnas/PK/FK/CHECK y marca del modelo. El DDL es transaccional:
   ante fallo se revierte entero y no toca las tablas operativas. Si el commit
   quedó confirmado, inspeccionar antes de repetir; la propuesta no sobrescribe.
4. Aprobar por separado 02_vinculacion_inicial_pendiente.sql: crea UNA empresa
   técnica vacía y los horarios originales. Rechaza empresas preexistentes y
   devuelve IdEmpresaVinculada. No modificar Usuarios/Roles ni inferir datos reales.
5. Confirmar el principal real de la conexión y conceder únicamente SELECT/UPDATE
   sobre las dos tablas nuevas desde la sesión administrativa. No INSERT/DELETE,
   ALTER, db_owner ni VIEW DEFINITION general para la identidad del backend.
   Sigue usando el applock ya autorizado. 04_permisos_propuestos_solo_lectura.sql
   prepara los GRANT para un principal existente explícito, sin ejecutarlos.
6. Autorizar activación con HOSTFLOW_CONFIGURACION_ENABLED=1 y HOSTFLOW_EMPRESA_ID
   igual al ID verificado; requiere HOSTFLOW_AUTH_SOURCE=sql existente. Sin bandera
   o ID válido, modelo marcado y empresa preparada, no se puede guardar.
7. El usuario inicia/reinicia sus npm run dev personalmente; no editar .env ni
   variables permanentes. Revisar Configuración con Admin y guardar datos reales
   solo con autorización. Operador conserva Apariencia y consulta solo predeterminados.

Recuperación funcional: quitar la bandera temporal devuelve la configuración a
pendiente; no borrar filas/tablas ni revertir reservas. Los datos guardados quedan
intactos. Ante problema posterior al commit, conservar objetos, inspeccionar y
aprobar una corrección. No ejecutar DROP automático en Azure.

## Pruebas y entorno local

Se escribieron únicamente fixtures en HostFlow_Test_Seguridad, Windows integrado,
Shared Memory y marca de aislamiento existente. El runner específico permite
solo Roles/Usuarios/Empresas/PreferenciasOperativas. La prueba anterior de seguridad
conserva su allowlist original de dos tablas. Cada Request exige destino, marca y
pertenencia; solo se limpia el runId actual y los object_id previamente acreditados,
en orden de FK y con transacción. Objetos ajenos/residuales impiden continuar.

Pruebas cubren validación, API directa 401/403, cambio obligatorio/revocación,
restricción de empresa, conflictos y rollback; integración REAL local de tablas,
guardado/recuperación, concurrencia y CHECK/FK; interfaz con API interceptada en
Claro/Oscuro/Automático, 320/390/820/1280 px, errores, activación pendiente y borrador.
No hubo pruebas contra datos operativos reales ni llamadas a Azure.

Resultados de estabilización: 133 pruebas backend herméticas, 41 frontend, 21 de
navegador (API interceptada) y 6 de SQL LOCAL (cinco casos más contenedor).
Build, lint frontend y de los archivos backend nuevos, sintaxis y diff --check
correctos. Se revisan también espacios/finales de los archivos nuevos, secretos y
la exclusión de tests/fixtures en dist. Persiste el aviso previo del tamaño del bundle.
El inventario completo está en archivos-configuracion-empresa.json.

Comando local solo para la base ya marcada/vacía y con autorización de fixtures:

```powershell
$env:HOSTFLOW_SQL_TEST_ENABLED='1'
$env:HOSTFLOW_SQL_TEST_WRITE_APPROVED='YES_LOCAL_DISPOSABLE'
$env:HOSTFLOW_SQL_TEST_AUTH='windows'
$env:HOSTFLOW_SQL_TEST_SERVER='localhost'
$env:HOSTFLOW_SQL_TEST_DATABASE='HostFlow_Test_Seguridad'
npm run test:sql:configuracion
```

El agente no inicia ni reinicia los servicios de desarrollo: lo hace el usuario
personalmente. Tests de navegador usan un servidor efímero con API interceptada,
que se cierra al terminar. Capturas solo ficticias fuera de Git. Sin commit, push
ni deploy. La publicación y todo paso Azure están pendientes de autorización.

La guía A–G, los defectos corregidos, límites y verificaciones de esta tanda están
en [estabilizacion-configuracion.md](estabilizacion-configuracion.md).
