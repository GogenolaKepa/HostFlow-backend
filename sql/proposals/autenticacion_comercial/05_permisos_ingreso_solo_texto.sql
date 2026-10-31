-- SOLO TEXTO. NO APLICA GRANT NI CAMBIA ROLES.
SELECT Perfil,Objeto,Accion FROM (VALUES
 (N'Ingreso HTTP',N'authcom.Ingresos',N'INSERT'),
 (N'Ingreso HTTP',N'authcom.Cuotas',N'SELECT, INSERT, UPDATE'),
 (N'Worker ingreso',N'authcom.Ingresos',N'SELECT, UPDATE'),
 (N'Worker ingreso',N'authcom.IngresoFallos',N'SELECT, INSERT, UPDATE; cuarentena/backoff/leases de08'),
 (N'Worker ingreso',N'authcom.Desafios',N'SELECT, INSERT, UPDATE'),
 (N'Worker ingreso',N'authcom.Outbox',N'INSERT'),
 (N'Worker ingreso',N'authcom.Auditoria',N'INSERT'),
 (N'Worker ingreso',N'authcom.Cuotas',N'SELECT, INSERT, UPDATE'),
 (N'Worker ingreso',N'dbo.Usuarios',N'SELECT IdUsuario,Nombre,Email,EmailNormalizado,IdRol,Estado,DebeCambiarPassword,VersionSesion,VersionRegistro; SIN PasswordHash'),
 (N'Worker ingreso',N'dbo.Roles',N'SELECT IdRol,Nombre,Activo'),
 (N'Worker ingreso',N'dbo.Empresas',N'SELECT IdEmpresa,Activo'),
 (N'Worker ingreso',N'authcom.Contactos',N'SELECT'),
 (N'Worker correo',N'authcom.Outbox',N'SELECT, UPDATE; incluye PrimerIntentoEn de propuesta06'),
 (N'Worker correo',N'authcom.Desafios',N'SELECT para descartar enlaces consumidos/revocados'),
 (N'Worker correo',N'authcom.Cuotas',N'SELECT, INSERT, UPDATE para presupuesto compartido de salida'),
 (N'Confirmación e invitaciones',N'Puerto cuentas',N'Matriz03; INSERT Outbox, sin SELECT/UPDATE Outbox ni acceso a Ingresos'),
 (N'Todos los puertos SQL',N'SCHEMA::authcom',N'VIEW DEFINITION limitado al esquema; marcas visibles y permisos negativos acreditables'),
 (N'Todos los puertos SQL',N'dbo.Usuarios / dbo.Roles / dbo.Empresas',N'VIEW DEFINITION de estos objetos; metadatos, sin conceder SELECT de credenciales'),
 (N'Cuentas y workers',N'sys.sp_getapplock',N'EXECUTE del bloqueo compartido; el ingreso HTTP no lo invoca')
) p(Perfil,Objeto,Accion);
-- Instancias y pools independientes para ingreso HTTP/worker; no dar UPDATE Usuarios
-- al worker de solicitud ni al de correo. Validar mínimos efectivos en motor aislado.
-- Sin db_owner, db_datawriter, db_ddladmin ni db_securityadmin. La factoría rechaza
-- privilegios excesivos o negativos no acreditables (NULL). No reutilizar los
-- cuatro pools de hostflow_app con permisos generales como si fuesen segregados.
-- Antes de crear authcom: resolver el acceso HEREDADO de hostflow_app mediante
-- db_datawriter/db_datareader. Agregar tablas ampliaría automáticamente su alcance.
-- No retirar roles ni aplicar DENY aquí: requiere una decisión/autorización DCL aparte
-- para aislar el nuevo esquema, conservando los derechos operativos sobre dbo.
-- Propuesta12/13: propietario exclusivo SIN LOGIN + DENY de esquema solo al principal
-- operativo. No aplicar DENY a public ni a los cuatro perfiles comerciales.
-- Mantenimiento07: identidad separada, UPDATE Ingresos/Outbox y DELETE Cuotas
-- únicamente tras aprobar retención. Ningún perfil HTTP/worker recibe DELETE.
