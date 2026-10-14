# Seguridad antes del despliegue

- Activar persistencia SQL despues de las autorizaciones y retirar cuentas/codigo mock de la version definitiva. Login ya no precarga ni muestra credenciales demo.
- Configurar/verificar la lista CORS implementada para los origenes HTTPS de produccion.
- Validar limite login implementado (IP, memoria), proxy real y necesidad de limite compartido antes de escalar; errores SQL de login ya son genericos.
- Revisar almacenamiento de sesión; sustituir localStorage si el diseño definitivo requiere cookies HttpOnly/Secure y protección CSRF.
- Incorporar autoría persistente por IdUsuario en observaciones. AutorNombre no demuestra propiedad; no autorizar ediciones/eliminaciones del Operador por coincidencia de nombres.
- Validar en SQL real la revocacion por VersionSesion, cambio de password y gestion de cuentas implementados localmente en etapas 3/4; todavia no estan activados contra Azure.

## Etapa 2

Los roles son fijos y sus permisos se definen en src/config/permisos.js.
Las políticas de endpoints están en src/config/politicasRutas.js. Rutas sin política se rechazan con 403.
Los permisos complementan las reglas existentes de canal, estado y sincronización; no las reemplazan.
Los importes individuales de reservas y precios de referencia siguen disponibles para tareas operativas; se restringen los agregados económicos de Dashboard/Reportes y recomendaciones comerciales de FlowIA.
La exportación actual ocurre en el navegador: se reserva su interfaz al Administrador. No es posible impedir que alguien copie datos operativos que está autorizado a consultar.

El Operador puede registrar el monto inicial de una reserva manual y editar sus fechas/horarios con los campos que soporta hoy el servicio. Los cambios de estado e importe requieren Administrador, incluso por PUT.
La configuración mock actual solo contiene una cuenta Administrador; las pruebas de Operador usan cuentas temporales aisladas, sin agregar credenciales al proyecto.

### Restricción temporal aprobada: observaciones

El Operador puede consultar y crear observaciones. La edición y eliminación quedan reservadas al Administrador hasta incorporar autoría persistente por IdUsuario. Fijar/desfijar continúa siendo exclusivo del Administrador según la matriz de permisos.
La restricción está aplicada en la API y en las pantallas existentes; las pruebas verifican el rechazo con 403 de edición, eliminación y fijado por el Operador. No se utiliza AutorNombre para conceder permisos sobre una observación.

### Revisión final

La proyección operativa de Dashboard limita también los metadatos anidados de alertas. Reportes limita período, filtros e indicadores a sus campos declarados. FlowIA limita tipos, destinos y evidencias operativas antes de consultar IA y vuelve a proyectar la respuesta final; objetos o arrays inesperados en campos escalares no se devuelven.
Estas proyecciones no se aplican al Administrador. Las pruebas usan SQL y proveedores externos sustituidos; la validación visual y los flujos completos sobre una base de pruebas quedan pendientes.
