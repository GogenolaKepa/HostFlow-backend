# Inspeccion Azure y preparacion de publicacion (14/10/2026)

Informe histórico de la inspección anterior a la migración. El titular resolvió
la intervención administrativa y ejecutó la migración; las cuentas SQL reales
ya funcionan en desarrollo. Ver `cierre-seguridad.md` para el estado vigente.
La decisión siguiente se refiere únicamente a migrar con la identidad de app,
no a un bloqueo actual del acceso de usuarios. No repetir migración ni bootstrap.

## Decision en el momento de la inspeccion

NO APTO PARA MIGRAR con la identidad disponible del backend. El modelo paso las
pruebas SQL locales; los bloqueos actuales son acceso administrativo/visibilidad
completa y confirmacion de recuperacion. No se requiere repetir la suite SQL
local ni modificar permisos de la aplicacion.

Este informe es una sintesis publicable, no el volcado privado de Azure.
Servidor exacto, nombres de cuentas, claves, inventario operativo y resultados
crudos no se guardaron en Git. El destino exacto esta en el batch privado local
de revision, fuera de ambos repositorios. No se consultaron filas operativas,
cuentas, passwords ni hashes.

## Lecturas reales ejecutadas

Se revisaron y ejecutaron 06_destino_azure_solo_lectura.sql,
03_comprobacion_administrativa_solo_lectura.sql y 02_verificacion_metadatos.sql.
Solo SELECT de sistema/contexto y catalogo Roles. Se agregaron y ejecutaron
SELECT de permisos/opciones/clave de Roles (07) y se intento consultar metadatos
agregados de backups (08). Sin DDL/DML, procedimientos explicitos ni SQL dinamico.
Tedious transporta sus consultas parametrizadas con el protocolo habitual de
node-mssql; no se ejecutaron procedimientos de negocio ni con efectos de escritura.

Herramienta: scripts/inspeccionarAzureSoloLectura.js --read-only. Solo opciones
explicitas; sin opciones/help no carga .env ni conecta. Lee la configuracion
existente en memoria sin modificarla; no importa server.js/config/database ni
endpoints operativos. No guarda resultados automaticamente y su error CLI es
generico. Las consultas se verifican antes de conectar y el destino antes del
inventario. No es un ejecutor SQL general: acepta solo los artefactos revisados.

Resultados acreditados:

- HostFlow y servidor logico coincidente con la conexion existente; Azure SQL
  Database EngineEdition=5; collation SQL_Latin1_General_CP1_CI_AS.
- mssql 12.7.5/Tedious pudo conectar y consultar Azure. TLS 1.2 negociado, socket
  autorizado y validacion de certificado activa (encrypt=true,
  trustServerCertificate=false). No se extrapola a DML/DDL no ejecutados.
- Sin transacciones abiertas ni implicitas. ANSI_NULLS, ANSI_PADDING,
  ANSI_WARNINGS, ARITHABORT, CONCAT_NULL_YIELDS_NULL y QUOTED_IDENTIFIER=1;
  NUMERIC_ROUNDABORT=0 en la conexion REAL con opciones del backend.
- Roles coincide con el modelo: IdRol int IDENTITY/PK, Nombre nvarchar(50) unico,
  Descripcion nvarchar(200) nullable, Activo bit no nullable. Claves IdRol/Nombre
  habilitadas. Administrador, Propietario y Operador siguen activos e intactos.
- No aparece Usuarios ni candidato de seguridad en el inventario VISIBLE.
  VIEW DEFINITION=0: no se declara ausencia completa a partir de esa lectura.
  La comprobacion administrativa anterior del titular es historica; reconfirmar
  con su acceso administrativo antes de aplicar.

## Permisos y bloqueo concreto

La identidad de app tiene SELECT Roles, permisos generales SELECT/INSERT/UPDATE
en dbo, db_datareader/db_datawriter y capacidad efectiva para sys.sp_getapplock.
No tiene VIEW DEFINITION, CREATE TABLE, ALTER dbo ni REFERENCES Roles. No tiene
db_owner/db_ddladmin. No se intento ejecutar DDL para comprobarlo.

Los permisos actuales sobre Usuarios no acreditan una tabla que no esta visible.
Los derechos generales sugieren herencia sobre objetos nuevos, pero se deben
comprobar SELECT/INSERT/UPDATE efectivos DESPUES de crearla con 05; no se prometen
permisos futuros ni se ejecutan GRANT. No se amplio ningun permiso existente.

En esta tanda se utilizo solo la conexion existente del backend; no se valido
una segunda conexion administrativa SQL disponible para este agente.
El titular intentara usar su conexion administrativa existente en Portal/SSMS;
no se solicitan ni extraen contraseñas de herramientas o almacenes privados.

08: no se pudo consultar la vista de backups. No se pudo certificar retencion,
ventana PITR ni permisos ARM de restauracion. Azure CLI/Az no disponibles aqui;
no se instalaron ni se inicio autenticacion adicional. Confirmar desde Portal.
[La visibilidad de backups depende de servicio y permisos](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-objects/sys-dm-database-backups-azure-sql-database?view=azuresqldb-current).

## Migracion y recuperacion preparadas

01_modelo_roles_usuarios.sql conserva exactamente la version probada localmente:
SHA-256 b0abdc66531d7022f7fd74f1094065b7b5406f50d8cb699a3190a51e763f7053.
ModeloAprobado=0 y EscrituraAutorizada=0. Solo crea Usuarios, indices, defaults,
CHECK y tres FKs; no altera/inserta Roles ni tablas operativas, no importa mocks.

Se genero, SIN CONECTAR, una copia futura .sql.txt en revision fuera de Git.
Incluye destino exacto, motor/collation, transacciones y permisos de migracion
en el mismo batch, antes del modelo. Sus dos flags 1 son material de revision
para una autorizacion posterior; el original permanece bloqueado. No se ejecuto.
Tambien hay comando futuro sqlcmd/SSMS, SHA-256 y consultas posteriores.
La copia no sustituye la comprobacion administrativa ni la confirmacion PITR.

Verificacion futura: 06/02 con identidad administrativa, comprobar columnas,
indices y FKs/CHECK confiables. 05 con identidad/conexion efectiva del backend,
separada de la administrativa. No certificar app por un SELECT como administrador.

Recuperacion: XACT_ABORT y TRY/CATCH con rollback del DDL en la migracion. Ante
timeout/resultado incierto, inspeccionar metadatos y transacciones antes de
reintentar; no DROP ni aplicar de nuevo a ciegas. Si Usuarios existe, conservarla
y revisar si el modelo quedo completo. Mantener mock durante esta fase y no
crear Admin hasta autorizacion separada. Si se requiere PITR, recuperar a base
nueva por decision autorizada, verificar y acordar corte; no reemplazar la base
operativa ni revertir datos posteriores automaticamente.

Instrucciones breves: comprobacion-azure-administrativa.md.
Secuencia completa: activacion-azure-controlada.md.

## Codigo y commits propuestos

No se cambio codigo de negocio ni seguridad de src en esta inspeccion. Los
cambios de ejecucion SQL local y frontend conservan su version validada.
Herramienta nueva de inspeccion: cinco pruebas hermeticas nuevas; backend total
106 aprobadas. No se repitieron pruebas SQL reales ni se iniciaron endpoints.
El frontend conserva las mismas cuatro fuentes del paquete revisado; sus
21 pruebas, 8 casos de browser, build/lint anteriores son la evidencia vigente.

Pendientes Git y huellas en archivos-preparacion-sql.json y
publicacion-seguridad-propuesta.md. No .env, secretos ni paquetes instalados.
Solo codigo, propuestas SQL SELECT y documentacion sanitizada. Batch con
destino privado y ZIPs/resultados locales quedan fuera de ambos repositorios.
No hubo commit, push, deploy, migracion, bootstrap ni activacion SQL.

Paso siguiente concreto: cuenta administrativa ejecuta 06/03/07 y confirma
PITR. Si coincide, habilitar la autorizacion de publicacion/migracion acordada;
no realizar otra auditoria general ni otorgar privilegios DDL a la app.
