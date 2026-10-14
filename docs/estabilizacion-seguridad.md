# Estabilizacion y preparacion para usuarios reales

Estado de la fase de implementacion al 14/10/2026: cambios exclusivamente locales. No se realizaron conexiones
de pruebas a Azure, migraciones, bootstrap real, cambios de credenciales/permisos,
activacion SQL, commits, push o deploy. El desarrollo mantiene mock por defecto.

Revision de cierre para la publicacion autorizada: 52 archivos backend y 12
frontend contrastados con el inventario y origin/main sin divergencia. Se
repitieron los 79 tests backend, 19 frontend, 7 casos de navegador aislado,
build, lint, sintaxis y git diff --check, todos satisfactorios. Las adaptaciones
de los 21 archivos operativos conservan el codigo previo salvo errores/logs;
se corrigio la indentacion de once lineas nuevas. No hay .env, secretos reales,
resultados privados de Azure, archivos generados ni hooks Git activos en la
publicacion. Los commits autorizados cierran solo el codigo y la documentacion;
no autorizan ni ejecutan las pruebas SQL reales o la activacion de usuarios SQL.

## Hallazgos y correcciones

1. CORS permitia cualquier origen. Ahora configurable por HOSTFLOW_CORS_ORIGINS,
   lista separada por comas de URLs de origen completas. Sin lista, desarrollo
   permite HTTP de localhost/127.0.0.1/::1 y redes IPv4 privadas en puertos Vite
   5173-5183 y preview 4173-4183. Lista explicita sustituye esos defaults. Produccion
   exige lista explicita HTTPS. OPTIONS sigue publico; origen rechazado no ejecuta
   parsers/controladores. Clientes sin Origin conservan JWT y permisos.
2. Login no tenia limites. Ahora cuenta intentos por IP antes del parser/hash:
   100/15 minutos en desarrollo y 30/15 minutos en produccion, incluidos exitosos.
   HOSTFLOW_LOGIN_MAX permite 1-1000; HOSTFLOW_LOGIN_WINDOW_MS 1-3600000.
   Respuesta 429, Retry-After y no-store; mapa limitado a 10000 IPs con expiracion.
   No se acepta X-Forwarded-For como identidad. No se habilito trust proxy.
3. Produccion podia iniciar mocks por omision. NODE_ENV=production ahora exige
   HOSTFLOW_AUTH_SOURCE=sql, CORS HTTPS explicito y JWT_SECRET privado de al menos
   32 bytes. Valida antes de abrir el pool. Longitud no demuestra entropia: generar
   el secreto con fuente criptografica/gestor privado. No se cambio ningun secreto.
   En origen SQL AuthService ya no carga ni calcula credenciales demo; el archivo
   mock sigue disponible exclusivamente para el modo de desarrollo acordado.
4. Login SQL podia dar diferencias evidentes de trabajo bcrypt para un email
   desconocido. Usa hash aleatorio de comparacion, cost 12, ademas del mismo 401
   generico para desconocido/password incorrecta/cuenta o rol inactivos. No ofrece
   garantia absoluta contra analisis temporal; limiter complementa esta medida.
5. Se serializaban errores completos y error.message del driver en logs/respuestas.
   Logger ahora registra solo contexto seguro/codigo controlado. Protege mensajes
   antes de responder/persistir errores de canales e IA. Los errores de negocio
   seguros se conservan; los internos son genericos. Fallos SQL mal presentados
   como 400/404 pasan a 503; ultimo manejador no expone stack ni HTML de Express.
   Las 21 adaptaciones a controladores/rutas/servicios cambian exclusivamente
   tratamiento de errores/logs, no reglas ni operaciones de negocio.
6. El prompt del bootstrap podia hacer eco del resto de un pegado multilinea.
   Mantiene la ocultacion hasta la siguiente pregunta. Passwords con controles
   ASCII se rechazan, junto a los limites 12 caracteres/72 bytes UTF-8. Frontend y
   backend comparten la politica. No se registran passwords, hashes o tokens.
7. Un resultado ausente/no numerico de sp_getapplock podia continuar. Ahora solo
   admite 0 (inmediato) o 1 (tras espera); caso contrario rollback antes de operar.
   Tambien se ajusto el SQL de referencia 04 para rechazar NULL/retornos distintos
   de 0/1; mantiene el flag de escritura requerido. Es la unica modificacion de
   logica a los scripts originales de propuesta en esta fase; NO se ejecuto.
   Retornos revisados en [Microsoft sp_getapplock](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-getapplock-transact-sql?view=sql-server-ver17).
8. Login compara con la misma expresion SQL LOWER/LTRIM/RTRIM que EmailNormalizado.
   El indice y las FK permanecen propuestos; normalizacion/collation reales aun
   necesitan el motor. No se presupone que el CHECK de longitud valide bcrypt.
9. FlowIA operativo ya limitaba datos antes/despues de IA, pero motivoFallback
   podia transmitir texto interno del proveedor. Ahora entrega un motivo operativo
   generico. No cambian recomendaciones, canales, conflictos o limpiezas.
10. El primer fallo del Dashboard dejaba un loader infinito y una promesa sin
    manejar. Ahora muestra error recuperable, Reintentar y salida, conserva sesion
    ante fallos temporales. Login previene envios repetidos mientras esta pendiente.
    Logout tiene timeout 10 s y mantiene la proteccion contra respuestas viejas.
11. Se eliminaron tres parametros catch no usados y se estabilizo el array vacio
    de FlowIA para su useMemo. Sin cambio en filtros o comportamiento operativo.

## Modelo y autorizacion revisados

- Solo Administrador/Operador activos autentican; rol actual viene del JOIN SQL,
  no del token o de IDs del cliente. Propietario no es asignable y se conserva.
- JWT HS256/2h/origen/version, usuario activo y VersionSesion comprobados en cada
  peticion. Tokens mock/SQL no se intercambian. SQL caido da 503 sin fallback.
- Cambio de rol/email/estado/password y logout revocan. Cambio de nombre mantiene
  sesiones. DTO no devuelve hash ni VersionSesion interna.
- Alta/reset obliga a cambiar password; no se monta Dashboard ni se ejecuta GET
  de negocio antes de completarlo. Reset no reactiva cuentas ni sustituye cambio
  propio con password actual. Usuarios no se elimina fisicamente.
- Transaccion comun y bloqueo exclusivo, retorno verificado, actor revalidado,
  ultimo Administrador y rowversion. La proteccion no cubre modificaciones SQL
  manuales fuera del protocolo. No hay CRUD de Roles ni cambios de su catalogo.
- Matriz de etapa 2 intacta, incluidos importes iniciales operativos de reservas y
  restriccion temporal de observaciones. Los filtros economicos siguen activos.

## SQL y bootstrap: estado exacto

`01_modelo_roles_usuarios.sql` conserva contenido y flags ModeloAprobado=0,
EscrituraAutorizada=0. Solo Usuarios/FK/indices; no crea Roles ni cuentas. No se
carga al iniciar. Revisado estaticamente contra metadatos confirmados por el
titular; no certificado por compilacion/ejecucion en SQL real.

Bootstrap implementado, independiente de HTTP y arranque. Sin opciones/help no
lee .env ni conecta. Check/verify son lectura; apply exige autorizacion previa,
flag, terminal oculta y confirmacion textual. Comparte repositorio/transaccion,
requiere Usuarios vacia y resuelve Administrador por nombre. No se ejecutaron
check/verify/apply contra Azure. El SQL 04 es referencia, no un autorunner.

Se detecto servicio MSSQLSERVER local Running; no se consulto ese motor ni se
identifico una base de pruebas autorizada. No se crearon bases/servicios/users.
Runner listo en tests/integration: npm.cmd run test:sql, omitido por defecto.

Guardas independientes: opt-in, autorizacion de escritura local, host loopback,
nombre HostFlow_Test_…, motor EngineEdition 2/3/4 (rechaza Azure incluso por tunel),
marca HostFlowTestIsolation y ninguna tabla de usuario al comenzar. No lee .env
ni reutiliza DB_SERVER/DB_DATABASE de la app. No crea bases. Trabaja con copia en
memoria de la migracion y fixture Roles; intenta limpiar solo sus tablas creadas,
revalidando destino/marca. Si limpieza falla, revisar la base aislada; nunca DROP
de HostFlow ni de una base. Mantener el entorno de prueba de uso exclusivo.

## Como habilitar las pruebas SQL, solo tras autorizacion

1. Acordar una base SQL Server LOCAL vacia, de uso exclusivo, con nombre como
   HostFlow_Test_Seguridad. Autorizar por separado su provision y escrituras.
   Usar una identidad local existente apropiada; no cambiar permisos de Azure.
2. En esa base autorizada revisar tests/integration/00_marcar_base_aislada.sql;
   solo tras autorizar la marca habilitar su flag y ejecutarlo. No crea la base.
3. Cargar en un proceso privado variables HOSTFLOW_SQL_TEST_SERVER (localhost),
   HOSTFLOW_SQL_TEST_DATABASE, HOSTFLOW_SQL_TEST_USER y HOSTFLOW_SQL_TEST_PASSWORD.
   Nunca passwords literales en argumentos, historial, capturas o el repositorio.
4. En ese proceso, y con autorizacion explicita de DDL/DML/limpieza de fixtures:

   ```powershell
   $env:HOSTFLOW_SQL_TEST_ENABLED = '1'
   $env:HOSTFLOW_SQL_TEST_WRITE_APPROVED = 'YES_LOCAL_DISPOSABLE'
   npm.cmd run test:sql
   ```

5. Comprueba migracion, indice/unicidad incluso inactivos, bootstrap concurrente,
   password/revocacion, rowversion, ultimo Admin concurrente y FKs. No sustituye
   pruebas de permisos con una cuenta limitada ni valida Azure por extrapolacion.
   El certificado autofirmado solo se acepta en este runner loopback; conexiones
   de app/bootstrap a Azure conservan validacion TLS.

## Verificaciones realizadas y limites

Resultado final: 79 tests backend, 19 frontend y 7 casos en Edge pasaron.
Build exitoso; lint sin errores ni advertencias. Solo persiste la advertencia
de bundle mayor a 500 kB. La suite SQL real fue ejecutada SIN habilitarla y
reporto 1 caso OMITIDO; no se contabiliza como prueba SQL aprobada.

Backend: pruebas JWT/roles/cuentas/IA originales mas hardening, errores reales de
controlador, guardas SQL y resultados de bloqueo invalidos. Frontend: pruebas
unitarias/SSR de sesiones/formularios/politica y build/lint.

Browser real Edge: login correcto/incorrecto, perfil por Enter, sin opcion duplicada, sidebar colapsado,
menu movil y cierre del menu, cambio de nombre, alta/edicion/estado/reset, password
invalida, cambio obligatorio sin peticiones de negocio, rotacion del token,
fallos temporales/me/dashboard, expiracion, Operador sin Usuarios y navegacion
Propiedades/Reservas/Huespedes/Calendario/Limpiezas/Alertas/Reportes/FlowIA/logout.

Browser conecta exclusivamente a Vite local y API interceptada; no inicia backend,
abre SQL o llama proveedores externos. Browser no es prueba del repositorio SQL.
Primer intento en sandbox no inicio Edge; ejecucion fuera del sandbox, autorizada
por la revision automatica, completo los flujos. No se instalo dependencia nueva.
Los fixtures operativos vacios verifican renderizado/navegacion, no equivalencia
de calculos ni procesos con datos reales; las pruebas backend cubren permisos y
filtrado. La validacion operativa completa con datos SQL aislados sigue pendiente.
Los tests, el inventario de cambios y las comprobaciones de sintaxis/whitespace
no detectaron .env ni credenciales reales nuevos en los cambios. Las consultas
originales de metadatos y la migracion 01 conservan sus guardas; no hubo SQL real.

## Pendientes antes de activar o desplegar

- Autorizar/ejecutar pruebas SQL reales y revisar SQL definitivo por separado.
- Confirmar permisos SELECT Roles, SELECT/INSERT/UPDATE Usuarios, bloqueo y las
  opciones SET de indice calculado con la cuenta efectiva. No hay GRANT automatico.
- Revisar proxy real antes de configurar trust proxy: false hoy evita spoofing.
  En varias instancias el limite en memoria es independiente y se pierde al
  reiniciar; acordar limite compartido o en gateway antes de escalar, sin Redis
  agregado a este alcance. IP compartida/NAT cuenta intentos del mismo origen.
- Configurar produccion con SQL, CORS HTTPS explicito y secreto aleatorio fuerte,
  y retirar credenciales/codigo demo del paquete de produccion. No se hizo ahora.
- Acordar almacenamiento de sesion; ver sesion-localstorage-cookies.md. No hay MFA,
  recuperacion por email, sesiones por dispositivo o auditoria historica completa.
- Mantener restriccion temporal de autor de observaciones; no confiar AutorNombre.
- Bundle frontend aun supera 500 kB; no se cambio arquitectura por esa advertencia.

Procedimiento de Azure en puesta-en-marcha-seguridad.md, checklist de validacion
manual en checklist-seguridad-manual.md e inventario en archivos-estabilizacion.json.
