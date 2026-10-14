# Implementacion local conjunta: Seguridad, etapas 3 y 4

## Resultado y alcance

Backend/frontend de persistencia y gestion preparados con origen mock activo por
defecto. Sin conexion de pruebas a Azure, DDL aplicado, cuentas reales, cambios de
permisos, .env o deploy. Publicacion de codigo autorizada por separado, manteniendo
mock. Scripts propuestas SQL siguen fuera del
arranque. No se modificaron repositorios/controladores/reglas del negocio.

## Archivos backend

- `src/config/autenticacion.js`: origen exclusivo mock/sql, invalidos rechazados.
- `.gitignore`: excluye variantes .env (permite .env.example) y el reporte crudo
  de metadatos Azure, que se conserva exclusivamente local.
- `src/security/seguridadUsuarios.js`: DTO sin hashes, validaciones, passwords,
  roles permitidos, revision y errores seguros.
- `src/repositories/UsuarioRepository.js`, `RolRepository.js`: parametros tipados,
  whitelist SQL, lectura separada de hashes, paginacion, rowversion y transaccion
  con bloqueo exclusivo comun. Roles solo lectura; IDs se resuelven por nombre.
- `src/services/UsuarioService.js`: altas, edicion, estado, reset, nombre propio,
  password actual/nueva, logout y bootstrap. Revalida actor/destinatario dentro
  del bloqueo; ultimo Admin y revisiones; bcrypt fuera del bloqueo.
- `src/services/AuthService.js`: bcrypt asincrono, activos/roles SQL, VersionSesion,
  claim de origen, sesiones nuevas y preflight SQL. Mock conserva acceso separado.
- `src/controllers/AuthController.js`, `UsuarioController.js` y rutas
  `authRoutes.js`, `usuarioRoutes.js`, `rolRoutes.js`: contratos de cuentas.
- `src/middlewares/autenticacion.js`, `cambioPasswordObligatorio.js`: JWT real,
  401/503 diferenciados y bloqueo antes de procesos de negocio.
- `src/config/permisos.js`, `politicasRutas.js`, `app.js`: permisos de seguridad,
  proteccion 403 y parser seguro; acciones de etapa 2 conservadas.
- `src/config/database.js`: mensajes de conexion genericos sin errores del driver.
- `src/server.js`: arranque SQL condicionado a destino/permisos/roles/primer Admin.
- `scripts/bootstrapAdministrador.js`: ayuda segura, check/verify de lectura,
  apply protegido, password oculta sin historial y sin registro publico.
- `package.json`: npm test, test:security y admin:bootstrap, sin nuevas dependencias.
- `docs/seguridad-pendientes.md`: actualiza implementado versus activacion pendiente.
- `tests/auth.test.js`: adapta el contrato de perfil ampliado; mismo chequeo JWT.
- `tests/security-api.test.js`, `security-cuentas.test.js`,
  `security-repositories.test.js`, `security-bootstrap.test.js`,
  `security-mock.test.js`, `tests/helpers/usuariosAislados.js`: pruebas aisladas.

## Archivos frontend

- `src/pages/Usuarios.jsx`: lista/paginacion/filtros, alta, edicion/rol, estados,
  reset privado y recarga ante conflicto. Sin opciones Propietario/borrado fisico.
- `src/pages/MiCuenta.jsx`: perfil, nombre y password; modo obligatorio aislado.
- `src/services/cuentas.js`: politica Unicode/bytes y disponibilidad administrativa.
- `src/services/session.js`: flags verificados, sesiones posteriores a cambios,
  respuestas antiguas, logout global y 403 que requiere cambiar password.
- `src/App.jsx`: no monta negocio con cambio pendiente; nueva sesion y logout.
- `src/pages/Dashboard.jsx`: navegacion Usuarios por permiso/SQL y Mi cuenta.
- `src/pages/Login.jsx`: campos vacios, sin credenciales precargadas ni mostradas.
- `src/App.css`: estilos de cuentas integrados, formularios/table responsive.
- `package.json`, `tests/session.test.js`, `tests/cuentas.test.js`: regresion y
  nuevos contratos de sesion/password/permisos, sin dependencias nuevas.
- `tests/cuentas-ui.test.js`: renderizado SSR local de formularios/roles/Login,
  sin cargar .env ni realizar peticiones API.

## API implementada

| Metodo | Ruta | Acceso |
|---|---|---|
| POST | /api/auth/login | Publico; origen exclusivo configurado |
| GET | /api/auth/me | Perfil autenticado, incluso cambio obligatorio |
| PATCH | /api/auth/me | Nombre/revision propios; no cambio pendiente |
| POST | /api/auth/cambiar-password | Actual/nueva/revision propios; admite obligatorio |
| POST | /api/auth/logout | Autenticado; revoca TODAS las sesiones SQL |
| GET | /api/roles | Admin, solo nombres Administrador/Operador activos |
| GET | /api/usuarios y /api/usuarios/:id | Admin; sin hashes/version interna |
| POST | /api/usuarios | Admin; nombre/email/rol/passwordTemporal |
| PUT | /api/usuarios/:id | Admin; nombre/email/rol/versionRegistro |
| PATCH | /api/usuarios/:id/estado | Admin; estado/versionRegistro |
| POST | /api/usuarios/:id/restablecer-password | Admin a terceros; temporal/revision |

Campos extra se rechazan. Sin roles por ID, hashes aportados, DELETE Usuarios,
CRUD Roles, autor desde cliente o VersionSesion mutable. Estado inicia Activo;
reset no reactiva. Cambios de email/rol/estado/password revocan; Nombre conserva
sesiones. Propietario/inactivos no acceden. Password temporal fuerza cambio antes
de todos los GET/HEAD/POST de negocio, aunque puedan sincronizar.

## Pruebas y limites de verificacion

Ultima ejecucion: 64 tests backend y 19 frontend pasaron; build exitoso y lint sin
errores. Conserva cuatro advertencias preexistentes en Huespedes/Propiedades/
Reservas/FlowIA y advertencia de bundle mayor a 500 kB.

Tests usan app/routers/controladores reales de seguridad y dobles de SQL/negocio,
fixtures aleatorias, sin dotenv ni cuentas reales. Cubren llamadas API prohibidas,
campos/roles, bcrypt, activos, tokens mock/SQL, revocacion, cambio obligatorio,
ultimo Admin, dos solicitudes simultaneas, actor revocado mientras espera,
revisiones/reset concurrentes, bootstrap simultaneo y prompt sin salida sensible.
Los contratos del repositorio comprueban parametros, transaccion compartida,
bloqueo previo y rollback ante fallo. No certifican concurrencia de Azure.

Pendientes: compilar/ejecutar DDL en motor autorizado de pruebas; indice calculado,
FK/defaults/colacion, opciones de sesion mssql, permisos y sp_getapplock reales;
concurrencia SQL real y pruebas visuales/interactivas de las nuevas pantallas.
Ninguna prueba se hizo navegando modulos operativos de produccion.

Pasos y permisos minimos exactos en `puesta-en-marcha-seguridad.md`. La migracion
01 conserva sus flags en cero y su contenido no se cambio durante implementacion.
