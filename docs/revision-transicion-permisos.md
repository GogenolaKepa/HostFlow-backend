# Revisión local de la transición de permisos

Estado informado por el usuario: 48 concesiones específicas aplicadas y verificadas
48/48/0; db_datareader y db_datawriter siguen asignados. No retirados ni modificados
durante esta tanda. No se ejecutó ningún SQL, tampoco de lectura, en Azure.

## Hallazgo y corrección de propuestas

Las propuestas 02 y 03 comparaban sys.database_permissions.permission_name con
la columna Permiso de una variable de tabla sin COLLATE explícito. Esa unión
puede enfrentar la collation del catálogo con la de los datos de Azure, igual
que el problema informado en la concesión original. Se fija BIN2 explícitamente
en ambos operandos. También se corrige esa misma comparación en 01 y en las tres
plantillas del generador offline, para evitar regenerar la versión vulnerable.
**01 no debe ejecutarse otra vez: las concesiones ya están confirmadas.**

No se recibió como archivo la copia V2 que el usuario ejecutó en su sesión
administrativa: no se afirma equivalencia byte a byte con esa copia externa.
Estas son nuevas revisiones LOCALES bloqueadas, no evidencia de ejecución real.

Las demás comparaciones revisadas entre catálogos usan IDs numéricos; los nombres
de servidor/base/principal ya usan BIN2 y longitud. Los literales de roles no son
un JOIN entre columnas de catálogos y variables. 04 no contiene la comparación
afectada y 05 usa HAS_PERMS_BY_NAME sin ese JOIN. Sus bytes se conservaron.

## Guardas que se mantienen

- Flags de concesión, retiro, inspección, pruebas, ventana y recuperación en 0.
- Servidor exacto, principal esperado y SID pendientes de completar privadamente.
- HostFlow/EngineEdition 5, identidad administrativa distinta y autocommit exigidos.
- 03 exige los 48 GRANT directos sin delegación antes de retirar nada, las dos
  membresías esperadas y ausencia de DENY relevante/propiedad no revisada.
- Retiro de ambos roles en una transacción, comprobación impersonada y REVERT;
  cualquier discrepancia revierte. No cambia filas empresariales u operativas.
- 04 sigue siendo recuperación excepcional autorizable por separado, con snapshot;
  no revoca concesiones específicas y no es el estado final deseado.

Las huellas de los tres SQL modificados se actualizaron en modelo-permisos.json.
Las huellas anteriores y nuevas se conservan en el informe local
revision/tanda-integral/collation-huellas.json. Es una diferencia deliberada,
autorizada sobre propuestas, no una coincidencia con el inventario antiguo.
Los cinco originales de Configuración y sus copias compartibles no se tocaron.

## Alcance de la validación

Pruebas herméticas comprueban las comparaciones explícitas, las guardas y las
huellas del manifiesto. **No prueban T-SQL en un motor Azure o SQL Server real**.
No se creó una nueva base ni un principal local restringido. La regresión de
servicios con repositorios ficticios tampoco demuestra permisos reales del motor.

La nueva validación de fechas y el estado de lectura de Configuración no agregan
consultas o privilegios SQL: permanecen 19 tablas, 48 operaciones y 118 llamadas
SQL en el código auditado. El manifiesto refleja ahora 112 archivos fuente.

## Retomar sin repetir C/D/E

1. Revisar por separado estas propuestas corregidas y sus huellas. No ejecutar
   nuevamente concesiones, migración o vinculación inicial.
2. Completar la prueba de perfil y regresión del motor con una identidad local
   restringida cuando se autorice su preparación. No darla por superada por los
   tests en memoria. Mantener el snapshot administrativo privado y recuperación.
3. Autorizar únicamente consultas necesarias de permisos/identidad en el destino
   y confirmar servidor/ID/SID. 02 revisa concesiones; 05 debe usar conexión nueva
   del backend, no la sesión administrativa.
4. Autorizar por separado ventana, detención manual del tráfico y ejecución de 03
   en una copia revisada. Conservar una sesión administrativa independiente.
   Cualquier resultado NULL/inesperado en permisos exige detener e inspeccionar;
   no convertirlo automáticamente a 0 ni conceder VIEW DEFINITION al backend.
5. Verificar con 05, conexión nueva y login privado seguro. La recuperación 04
   requiere otra autorización y snapshot. No se ejecuta automáticamente por error.

La activación de guardados empresariales permanece separada del retiro de roles:
HOSTFLOW_CONFIGURACION_READ_ONLY=1 se conserva en el comando temporal del usuario.
El primer guardado exige acordar tabla/campo/valor concreto, recargar su revisión,
reiniciar personalmente con READ_ONLY=0 solo tras aprobarlo, confirmar un guardado,
verificar la lectura y volver a =1 si corresponde. No usar reservas para probarlo.
El agente no cambia esas variables ni inicia servicios.
