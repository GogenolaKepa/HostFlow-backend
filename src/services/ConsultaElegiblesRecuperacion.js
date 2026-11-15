// Consultas estáticas. El método local se obtiene como bit, nunca como hash.
const FROM=`FROM dbo.Usuarios u JOIN dbo.Roles r ON r.IdRol=u.IdRol
 JOIN authcom.Contactos c ON c.IdUsuario=u.IdUsuario
  AND c.Email=u.EmailNormalizado COLLATE Latin1_General_100_BIN2`;
const FILTRO=`u.Estado=N'Activo' AND r.Activo=1 AND r.Nombre IN(N'Administrador',N'Operador')
 AND u.VersionSesion>0 AND u.VersionSesion<2147483647
 AND c.RevocadoEn IS NULL AND c.VerificadoEn IS NOT NULL AND c.VerificadoEn<=SYSUTCDATETIME() AND c.VersionContacto>0
 AND authcom.PermitePasswordLocal(u.IdUsuario)=1
 AND EXISTS(SELECT 1 FROM dbo.Empresas WHERE IdEmpresa=1 AND Activo=1)`;
const CAPACIDAD="SELECT HAS_PERMS_BY_NAME(N'authcom.PermitePasswordLocal',N'OBJECT',N'EXECUTE') AS permitido,CONVERT(nvarchar(80),(SELECT value FROM sys.extended_properties WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND name=N'HostFlowAuthPasswordLocal')) AS modelo;";
const CONTEO=`SELECT COUNT_BIG(*) AS elegibles ${FROM} WHERE ${FILTRO};`;
const POR_EMAIL=`SELECT u.IdUsuario AS idUsuario,u.EmailNormalizado AS email,u.Estado AS estado,r.Nombre AS rol,r.Activo AS rolActivo,
 u.DebeCambiarPassword AS debeCambiarPassword,u.VersionSesion AS versionSesion,c.VersionContacto AS versionContacto,c.VerificadoEn AS verificado,
 N'dbo.Usuarios' AS ambitoIdentidad,authcom.PermitePasswordLocal(u.IdUsuario) AS passwordLocalHabilitada ${FROM} WHERE ${FILTRO} AND u.EmailNormalizado=@email;`;
module.exports={CAPACIDAD,CONTEO,POR_EMAIL};
