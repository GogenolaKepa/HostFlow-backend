// SQL estático de aceptación, sin conexión ni datos de usuarios.
function consultaFronteraUsuarios(perfil){
  if(!['cuentas','ingresoHttp','workerIngreso','correo'].includes(perfil))throw TypeError('Perfil no válido.');
  const excluir=perfil==='cuentas'?"c.name NOT IN(N'PasswordHash',N'DebeCambiarPassword',N'VersionSesion',N'FechaCambioPassword',N'FechaActualizacion',N'IdUsuarioActualizacion') AND ":'';
  return `SELECT CASE WHEN OBJECT_ID(N'dbo.Usuarios') IS NULL
    OR NOT EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Usuarios'))
    OR EXISTS(SELECT 1 FROM sys.columns c WHERE c.object_id=OBJECT_ID(N'dbo.Usuarios') AND ${excluir}
      ISNULL(HAS_PERMS_BY_NAME(N'dbo.Usuarios',N'OBJECT',N'UPDATE',c.name,N'COLUMN'),1)<>0)
    OR ISNULL(HAS_PERMS_BY_NAME(N'dbo.Usuarios',N'OBJECT',N'DELETE'),1)<>0 THEN 1 ELSE 0 END AS excesivo;`;
}
module.exports={consultaFronteraUsuarios};
