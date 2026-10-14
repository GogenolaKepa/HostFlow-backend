# Comprobacion administrativa de Seguridad: solo lectura

Estado: comprobacion COMPLETADA por el titular y resultados confirmados en la
conversacion: HostFlow, VIEW DEFINITION=1, sin Usuarios/equivalentes en el inventario
completo. Roles activos: Administrador (1), Propietario (2), Operador (3).
No se reejecutaron consultas desde este workspace. Las instrucciones siguientes
son el registro del procedimiento utilizado; no quedan comprobaciones pendientes
sobre esos tres resultados. No autoriza migraciones ni escrituras.

## Opcion mas simple: editor de consultas de Azure Portal

1. Abrir Azure Portal y seleccionar el recurso **SQL database HostFlow** en el servidor de este proyecto. Usar el recurso de la base, no master ni el servidor logico como destino de consultas.
2. Abrir **Query editor / Editor de consultas**. Usar una identidad administrativa que ya tenga acceso SQL: Microsoft Entra si ya esta configurado, o autenticacion SQL con un acceso administrativo existente. Ingresar los datos solo en la herramienta, sin copiarlos al chat ni al .env de HostFlow.
3. Pegar y ejecutar unicamente el bloque 1 de `sql/proposals/seguridad_etapas_3_4/03_comprobacion_administrativa_solo_lectura.sql`, cuando se autorice la comprobacion. Debe devolver BaseActual=HostFlow, PuedeVerEsquemaCompleto=1 y PuedeLeerRoles=1. TieneControlBase es informativo; no se necesita ampliar permisos para este trabajo.
4. Si la base no coincide o cualquiera de esos dos permisos no es 1, detenerse. Acceso al recurso en Azure Portal no acredita por si solo esos permisos de la conexion SQL. Si se requieren cambios de firewall, usuarios, Entra o permisos, no realizarlos dentro de esta comprobacion: utilizar una conexion administrativa existente que funcione o coordinar con quien administra la base.
5. Con el bloque 1 correcto, ejecutar el bloque 2 por separado. Conservar el resultado completo: inventario de tablas, vistas, sinonimos y sus columnas. No seleccionar filas de una tabla Usuarios aunque aparezca.
6. Ejecutar el bloque 3 por separado y conservar exclusivamente IdRol/Nombre/Activo. No ejecutar SELECT * ni ampliar la consulta a cuentas o credenciales.
7. Exportar o copiar solo estos tres resultados. El editor del portal puede mostrar unicamente el ultimo resultado de un lote con varias sentencias, por eso se ejecutan individualmente. Cerrar/desconectar la sesion al terminar.

No configurar nuevas identidades administrativas ni cambiar la cuenta utilizada por HostFlow. Si no hay acceso adecuado disponible, la comprobacion queda pendiente.

## Alternativa con herramienta SQL existente

En SSMS, conectar al mismo servidor con la identidad administrativa ya autorizada. En las opciones de conexion seleccionar la base HostFlow, mantener cifrado y validacion del certificado, abrir una consulta nueva y ejecutar los tres bloques en el mismo orden, verificando primero el destino/permisos. No utilizar exploracion de datos de tablas ni los scripts de migracion de la propuesta.

## Como interpretar los resultados

- **Bloque 1:** valida destino y capacidad de leer metadatos/catalago. Si VIEW DEFINITION no es 1, un resultado vacio no demuestra ausencia de tablas.
- **Bloque 2:** revisar dbo.Usuarios, cualquier objeto Usuario/Users/Cuentas/Accounts/Logins/Identidades y tablas con columnas de identidad, rol, correo o hash. La consulta no filtra por nombre para no omitir equivalentes con otros nombres/esquemas. Huespedes puede tener email sin ser una tabla de autenticacion: la equivalencia se determina con el conjunto de columnas y el uso conocido del proyecto.
- Si aparece una tabla candidata, vista o sinonimo, no se declara ausencia ni se ejecuta CREATE. Se revisan sus metadatos y dependencias en un paso posterior autorizado. Un sinonimo no expone aqui la estructura de su destino.
- Con visibilidad completa, si no aparece Usuarios ni otra candidata y el inventario se confirma, puede cerrarse la variante de creacion de Usuarios. Si hay restricciones explicitas sobre objetos o dudas de visibilidad, la cuenta administradora debe aclararlas antes de concluir.
- **Bloque 3:** confirmar filas canonicas Administrador/Operador con Activo=1 y conservar sus IdRol reales. No asumir 1/2 ni modificar roles adicionales/inactivos. Faltantes o diferencias se informan antes de proponer cualquier escritura.

Las tres sentencias son SELECT. Las funciones del primer bloque solo consultan contexto/permisos. No hay SQL dinamico, SELECT INTO, llamadas EXEC a procedimientos, lectura de cuerpos de modulos, hashes ni filas de usuarios. La unica consulta de datos de aplicacion es el catalogo Roles limitado a IdRol/Nombre/Activo.

## Referencias verificadas

- [Microsoft: editor de consultas de Azure Portal](https://learn.microsoft.com/en-us/azure/azure-sql/database/query-editor?view=azuresql).
- [Microsoft: conectar con SSMS](https://learn.microsoft.com/en-us/azure/azure-sql/database/connect-query-ssms?view=azuresql).
- [Microsoft: visibilidad de metadatos](https://learn.microsoft.com/en-us/sql/relational-databases/security/metadata-visibility-configuration?view=sql-server-ver17).
