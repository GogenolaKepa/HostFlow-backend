# Checklist manual, siempre en entorno autorizado

No probar altas, estados, resets o GET operativos contra Azure real sin autorizacion.
Algunos GET sincronizan y escriben. Elegir fixtures/base de pruebas aislada.

## Preparacion

- [ ] Destino verificado, esquema revisado y permisos efectivos, nunca asumidos.
- [ ] Primer Admin creado y credenciales verificadas en paso separado autorizado.
- [ ] Origen exclusivo correcto; desarrollo mock, produccion SQL explicito.
- [ ] CORS local/HTTPS de produccion; preflight permitido y origen ajeno rechazado.
- [ ] Login incorrecto generico; exceso de intentos 429/Retry-After, luego recupera.
- [ ] Ningun log/respuesta contiene passwords, JWT, hashes o mensajes SQL internos.

## Administrador

- [ ] Ingresar con temporal: solo formulario obligatorio, sin sidebar ni negocio.
- [ ] Password actual incorrecta, nueva corta/mas de 72 bytes/controles/repetida
      se rechazan. Cambiar correctamente permite acceso e invalida JWT anteriores.
- [ ] Perfil abre Mi cuenta por click/Enter/Espacio en sidebar expandido/colapsado.
- [ ] Menu movil: perfil abre cuenta y cierra menu. Cerrar sesion es otro boton.
- [ ] Editar nombre actualiza perfil; guardar sesion no devuelve hash ni version interna.
- [ ] Listar/buscar/paginar usuarios. Solo dos nombres de rol, sin Propietario.
- [ ] Alta valida email unico por mayusculas/espacios, incluso si la cuenta es inactiva.
- [ ] Editar nombre/email/rol; email/rol revoca sesiones. Cambiar estado revoca.
- [ ] Reset a tercero obliga cambio, revoca y no activa cuenta inactiva.
- [ ] Reset propio usa Mi cuenta/password actual, no reset administrativo.
- [ ] Ultimo Admin no se degrada/desactiva. Dos cambios simultaneos dejan al menos
      uno; actor revocado mientras espera no escribe; revision vieja devuelve 409.
- [ ] Mantiene gestion de propiedades, canales, reservas/cancelaciones/importes,
      integraciones simuladas, reportes/exportacion e IA comercial.

## Operador

- [ ] Ingresar/perfil/password propia funcionan; Usuarios no aparece.
- [ ] Llamadas directas Usuarios/Roles/propiedades/integraciones/cancelaciones y
      cambios de importe/estado prohibidos dan 403 sin ejecutar controladores.
- [ ] Inyectar rol/IdRol/estado/hash/VersionSesion en Mi cuenta se rechaza.
- [ ] Acciones operativas de reservas/huespedes/calendario/limpiezas/alertas conservadas.
- [ ] Dashboard/Reportes/FlowIA sin agregados economicos, historicos comerciales ni
      datos ocultos anidados, aun al consultar API directamente.
- [ ] Observaciones consulta/alta; edicion/eliminacion/fijado siguen reservados.

## Sesion, fallos y regresion

- [ ] JWT ausente/invalido/vencido/revocado, usuario/rol inactivo y Propietario: 401.
- [ ] Cerrar sesion confirma revocacion global; fallos del servidor cierran localmente
      e informan que la revocacion no fue confirmada.
- [ ] Reload valida servidor; manipular usuario de localStorage no eleva permisos.
- [ ] Backend temporalmente caido: no borrar token por 503; Reintentar recupera.
- [ ] Fallo de primera carga Dashboard muestra error/reintento, no loader infinito.
- [ ] Respuesta tardia de sesion anterior no borra/sobrescribe un login nuevo.
- [ ] Navegar todas las pantallas y FlowIA sin excepciones ni peticiones externas
      inesperadas. Validar tambien reservas con estados/canales reales SOLO en
      fixtures de prueba aprobadas: conflicto, horarios, limpieza y sincronizacion.
- [ ] SQL caido no revive mocks; produccion sin SQL/CORS/secreto adecuado no arranca.
