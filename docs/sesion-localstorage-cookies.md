# Decision pendiente: almacenamiento de sesion

No se cambio localStorage en esta fase. El backend revalida estado, rol y version;
el frontend consulta /auth/me y nunca habilita acceso por el objeto local.

## Riesgos actuales

localStorage es accesible a JavaScript del origen y persiste al cerrar el browser.
Una XSS o script comprometido puede leer y exfiltrar el JWT; CORS no evita esa
lectura. VersionSesion limita validez despues de revocar, pero no previene robo
mientras el token es valido. HTTPS protege transporte, no un script del origen.

React escapa texto por defecto y el codigo revisado no guarda passwords/hashes
en storage. Mantener dependencias revisadas, evitar HTML sin sanitizar y evaluar
CSP en el despliegue. Cierre SQL revoca todas las sesiones; cerrar una pestaña no.

## Alternativas y cambios necesarios

| Alternativa | Beneficio | Costo/limite |
|---|---|---|
| sessionStorage | Reduce persistencia, separa pestañas | Sigue expuesto a XSS; modifica sincronizacion entre pestañas |
| JWT en memoria | Sin token persistente en disco del browser | Reload requiere nuevo login o refresh seguro; XSS puede realizar acciones |
| Cookie HttpOnly/Secure | JavaScript no puede leer la cookie | Browser la envia automaticamente: requiere politica CSRF y SameSite adecuada |

Para cookie: decidir dominios/proxy y duracion; emitir/limpiar cookie desde
login/password/logout, autenticar desde cookie y retirar Bearer de Axios/storage.
Configurar withCredentials, CORS con origenes exactos y credentials=true.
SameSite=Lax/Strict si el despliegue lo permite; dominios entre sitios pueden
requerir None+Secure y defensa CSRF explicita (token, validacion de Origin/Referer
y peticiones mutadoras). GET actuales con escrituras requieren especial revision:
evitar efectos mutadores sin defensa CSRF, preservando reglas de sincronizacion.
Reescribir restauracion/rotacion, pruebas entre pestañas, expiracion y manejo de
cookie al fallar SQL. HttpOnly tampoco impide acciones de una XSS activa.

No se debe activar autenticacion doble cookies+Bearer como fallback automatico.
La decision depende del despliegue y requiere aprobacion funcional/técnica;
no es un cambio de variable ni se implemento parcialmente.

Referencia: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
