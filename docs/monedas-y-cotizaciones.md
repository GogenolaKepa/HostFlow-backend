# Monedas y cotizaciones — núcleo local v2

Implementado y probado con fixtures; esquema nuevo NO aplicado ni validado con
SQL Server. La autorización de desarrollo no activa banderas ni autoriza Azure.
Los commits publicados anteriores se conservan; el módulo permanece sin staging.

## Precio autoritativo y legado

Con el modelo activado, `TarifasPropiedad` es la única autoridad del precio por
noche y su moneda ARS/USD. `PropiedadRepository` proyecta ese precio sobre el DTO,
con `monedaBase`, `tarifaMonetaria` y `autoridadPrecio=TARIFA_DECLARADA`.
El valor físico anterior de `Propiedades.PrecioBase` queda archivado; no se
sincronizan dos precios. Las propiedades sin declaración siguen como
`LEGACY_SIN_MONEDA`: ningún GET les asigna pesos o dólares.

La creación monetaria confirma propiedad y tarifa en una transacción. El valor
inicial de compatibilidad de PrecioBase coincide con esa primera tarifa; las
revisiones posteriores solo cambian TarifasPropiedad. El formulario anterior no
puede crear propiedades mientras la autoridad nueva está activa. La edición de
metadatos omite precio; un UPDATE legacy que intente competir con una tarifa
existente se rechaza también en SQL. El editor único está en Configuración.

Las publicaciones y sincronizaciones SIMULADAS de propiedades Booking/Airbnb
consumen el DTO autoritativo y conservan su moneda acreditada. Sin moneda no la
inventan. No hay una API productiva de canales, conversión automática, ni una
republicación provocada al revisar la tarifa en Configuración.

## Acuerdo de reserva y fijación

El contrato manual tiene moneda/importe originales, regla de pago, fuente/tipo
acordados, autor y revisión. El importe contractual es independiente del precio
por noche y de MontoEstimado. No se calcula un contrato copiando el legado ni se
registran pagos. ARS y USD pueden pactarse sin conversión; USD puede pactarse
pagadero en ARS al check-in con fuente BCRA o MANUAL explícita.

Con la integración activada, una nueva reserva manual exige el acuerdo y confirma
reserva + acuerdo + RESERVA_CREADA en la transacción de Reservas ya existente.
No hay transacciones anidadas, conexiones de singleton mutables o Requests
paralelos. Dependencias, DML, historial obligatorio y DTO se leen en esa conexión.

Revisión del acuerdo y fijación usan el recurso común
`HostFlow:Operaciones:FinalizacionReservas`, bloqueo UPDLOCK/HOLDLOCK de la
reserva y relectura de su estado. Después adquieren el recurso de seguridad
existente y revalidan cuenta/sesión/rol/permiso. La escritura del acuerdo utiliza
CAS sobre rowversion de la tabla NUEVA; no se inventa una revisión de Reservas.
Un conflicto o ausencia de fila impide commit.

Antes del check-in solo hay una estimación. Fijar exige una acción y confirmación
explícitas, fecha operativa Buenos Aires, fuente del acuerdo y tasa no posterior
al ingreso. La última publicación oficial anterior requiere aceptación propia;
MANUAL exige nuevamente la advertencia. La fuente BCRA se consulta ANTES de
la transacción, por botón, y el comando utiliza su caché vigente sin red.
MANUAL usa la configuración guardada del día, dentro de la transacción.

Se fija una sola vez fuente/tipo, valor, fecha efectiva y check-in, equivalente ARS,
autor y momento. No se reemplazan USD/importe originales. Se agrega un evento
obligatorio RESERVA_MODIFICADA con motivo monetario, evitando inventar un tipo de
historial incompatible con el catálogo. La edición normal conserva el acuerdo;
después de fijar no puede cambiar el ingreso ni su hora. Egreso puede editarse
según las reglas existentes. Cancelar es lógico, preserva snapshot e historial;
Cancelada/Finalizada no admiten nuevas revisiones o fijaciones.

Si falla cualquier paso previo al commit se intenta rollback conjunto. Commit o
rollback incierto produce 500 / OPERACION_RESULTADO_INCIERTO, exige recarga y
no reintenta. Un rollback posterior no demuestra que el commit no ocurrió.
CAS impide repetir una fijación; no hay idempotencia durable del alta ante un
nuevo envío deliberado después de perder una respuesta.

## API y permisos existentes

Rutas bajo `/api/monedas`; GET admite HEAD sin DML ni proveedor:

| Ruta / método | Permiso | Resultado |
| --- | --- | --- |
| estado GET | propiedades.ver | Banderas/fuentes; no SQL |
| configuracion GET / PUT | configuracion.ver / modificar | Configuración con CAS |
| consultar-bcra POST | configuracion.modificar | Consulta explícita, sin DML |
| tarifas GET / PUT :id | propiedades.ver / gestionar | Tarifa original y CAS |
| propiedades POST | propiedades.gestionar | Propiedad + tarifa, 201 |
| reservas/:id/acuerdo GET / PUT | reservas.importes | Lectura / revisión explícita |
| reservas/:id/fijacion POST | reservas.importes | Snapshot único |
| resumen GET | reportes.economia | Contratos agrupados por moneda |
| alertas GET | alertas.ver | Avisos derivados de lectura |

PUT acuerdo: `{revision:null|hex16, acuerdo:{moneda,importe:string,
pagoEquivalenteARS,fuenteReferencia?,confirmar:true}}`.
Fijación: `{revision,confirmar:true,cotizacionId? ,confirmarManual?,
aceptarUltimaOficial?}`. Nunca tasa, autor o empresa del cliente.
El alta manual conserva su endpoint y agrega `acuerdoMonetario` al payload.

Ambos roles conservan alta manual; el Operador puede declarar su acuerdo inicial,
como el importe inicial anterior. No recibe importes/snapshots nuevos en DTO o
historial ni puede consultar/configurar/fijar por los endpoints económicos.
Administrador conserva sus permisos actuales. No cambió el catálogo de permisos.

## Fuentes, precisión y métricas

BCRA utiliza exclusivamente el campo tipoCotizacion de la API estadística USD,
etiquetado BCRA_TIPO_COTIZACION; no se identifica como compra/venta minorista o
A3500. Fecha acreditada, hora de publicación ausente, consulta separada. Caché
de cinco minutos, solicitudes simultáneas compartidas, timeout y sin reemplazo
inventado. Banco Nación sigue no disponible; no se incorpora scraping.

Importes decimal(18,2), tasas decimal(18,8), BigInt y mitad hacia arriba. Transporte
SQL varchar parametrizado + CONVERT decimal; lecturas como texto. El proveedor
conserva el lexema JSON mediante context.source, sin pasar la tasa por Number.
Runtime comprobado: Node 24.18.0 con esa capacidad; otro runtime debe acreditarla.
No se añadieron dependencias o procesos al arranque.

Dashboard/Reportes agregan acuerdos originales por ARS/USD, periodo de ingreso y
filtros aplicados. Excluyen Cancelada/No show; desconocidos se cuentan fuera de
sumas. No suman equivalentes como otro ingreso ni llaman cobros a contratos.
SUM decimal se transporta como texto. CSV propio conserva moneda, filtros y legado
excluido; ocupación, reservas, canales y demás métricas operativas continúan.

El aviso de tarifa ARS compara equivalencia USD contra referencia de igual
fuente/tipo: tasaReferencia/tasaActual - 1, umbral absoluto exacto >=15 %.
Tiene clave estable, una tarjeta por propiedad, fuente/fecha y navegación a la
revisión. No modifica precios. Alertas y FlowIA usan el mismo GET calculado;
FlowIA lo muestra aparte de su análisis, sin entregarlo a Gemini ni cambiar su
motor/caché. No se produce Notificaciones v3. La bandeja persistida actual necesita
un tipo/productor/política revisados para incluirlo; no se fabrica una entrega.

## SQL pendiente y activación

Tres tablas aditivas v2: ConfiguracionMonetaria, TarifasPropiedad y
AcuerdosMonetariosReserva. Diez FK, dos índices secundarios, CHECK completos de
fuente/NULL/snapshot/equivalencia y marcas v2; sin backfill ni ALTER operativo.
La inspección, DDL, generación de texto DCL y verificación siguen bloqueados.

`HOSTFLOW_MONEDAS_SQL_ENABLED`, `HOSTFLOW_MONEDAS_WRITE_ENABLED` y
`HOSTFLOW_MONEDAS_RESERVAS_ENABLED` están apagados por defecto. Se exige
autenticación SQL, empresa activa del servidor y permisos existentes.
Configuración en solo lectura impide también las escrituras monetarias.
Después de crear acuerdos, desactivar solo WRITE conserva lecturas y protección:
NO apagar las banderas de lectura ni volver al backend anterior con escritores
activos. Procedimiento exacto y criterios de detención:
[04_recuperacion.md](../sql/proposals/monedas/04_recuperacion.md).

Los 48 derechos históricos, siete de Notificaciones y seis scripts congelados
se preservan. Se proponen 37 derechos nuevos (seis sentencias de texto), aún no
concedidos; actualizar el perfil congelado requiere otra autorización. Roles
amplios no acreditan mínimo privilegio efectivo. Una organización por instalación:
FK separadas no acreditan aislamiento multiempresa/usuario ni RLS nuevo.

La inmutabilidad se garantiza por los escritores cooperantes de la aplicación,
CAS y estado; no frente a DML directo de un principal con privilegios amplios.
Quedan fuera escritores externos y las ramas de canales todavía no coordinadas.
Triggers, RLS, collation, bloqueos físicos, OUTPUT y rollback reales deben probarse
con motor autorizado. No se ejecutó SQL ni se modificó el piloto histórico.

## Comprobación local

`npm test` backend: 462 aprobadas; frontend: 66; navegador completo: 89
(incluye contenedor). Build/lint frontend correctos, principal 461,38 kB.
Oxlint backend se ejecuta con el binario ya instalado en frontend, sin instalar
paquetes; sus avisos históricos se documentan en el informe externo.
No se ejecutan runners SQL o HTTP operativos antiguos.

Evidencia y comparaciones: `revision/monedas-y-cotizaciones-facultad-2026-10/jornada/`,
fuera de ambos repositorios. Estas cifras acreditan orquestación/contratos con
fixtures; no motor SQL, proveedor real ni persistencia monetaria en Azure.
