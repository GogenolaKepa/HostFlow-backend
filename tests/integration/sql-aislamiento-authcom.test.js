const {test}=require('node:test');
const assert=require('node:assert/strict');
const {laboratorioSqlcmd}=require('./sqlComercialCli');

// SOLO laboratorio marcado, compartido en memoria y vacío. No carga .env ni driver nativo.
// Toda identidad, rol y objeto adicional vive en una transacción que se revierte.
test('aislamiento authcom: permisos reales, excepciones y propietario separado',{
  skip:process.env.HOSTFLOW_AUTHCOM_AISLAMIENTO_SQL_TEST!=='1',timeout:90000,
},async t=>laboratorioSqlcmd(async({ejecutar,runId})=>{
  const sufijo=runId.replaceAll('-','').slice(0,16);
  const app='hf_authcom_app_'+sufijo,cuentas='hf_authcom_cuentas_'+sufijo,owner='hf_authcom_owner_'+sufijo;
  const tablas={Contactos:['IdUsuario','int'],Desafios:['Id','uniqueidentifier'],Cuotas:['Cuenta','int'],
    Outbox:['Id','uniqueidentifier'],Auditoria:['Tipo','varchar(40)'],Ingresos:['Id','uniqueidentifier'],IngresoFallos:['Id','uniqueidentifier']};
  const operacion=(tabla,[col,tipo])=>[
    `SELECT COUNT_BIG(*) AS n FROM authcom.${tabla};`,
    `INSERT authcom.${tabla}(${col}) SELECT CONVERT(${tipo},NULL) WHERE 1=0;`,
    `UPDATE authcom.${tabla} SET ${col}=${col} WHERE 1=0;`,
    `DELETE authcom.${tabla} WHERE 1=0;`,
  ];
  const denegada=sql=>`SET @denegada=0;BEGIN TRY EXEC(N'${sql.replaceAll("'","''")}');END TRY BEGIN CATCH IF ERROR_NUMBER() IN(229,230) SET @denegada=1;ELSE THROW;END CATCH;
    IF @denegada<>1 THROW 51960,'Se permitió una operación que debía estar denegada.',1;`;
  const negocio=`SELECT COUNT_BIG(*) AS n FROM dbo.Empresas;INSERT dbo.Empresas(Activo) SELECT CONVERT(bit,1) WHERE 1=0;
    UPDATE dbo.Empresas SET Activo=Activo WHERE 1=0;DELETE dbo.Empresas WHERE 1=0;`;
  const inicio=`SET XACT_ABORT OFF;BEGIN TRY BEGIN TRANSACTION;CREATE USER [${app}] WITHOUT LOGIN;
    ALTER ROLE db_datareader ADD MEMBER [${app}];ALTER ROLE db_datawriter ADD MEMBER [${app}];`;
  const fin=`IF USER_NAME()<>N'dbo' REVERT;ROLLBACK;
    IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name IN(N'${app}',N'${cuentas}',N'${owner}')) THROW 51961,'Principal residual.',1;
    END TRY BEGIN CATCH IF USER_NAME()=N'${app}' OR USER_NAME()=N'${cuentas}' REVERT;IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;`;
  const negar=`DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::authcom TO [${app}];`;
  await t.test('los roles generales alcanzan las siete tablas antes del aislamiento',async()=>{
    const r=await ejecutar(inicio+`EXECUTE AS USER=N'${app}';`+negocio+Object.entries(tablas).flatMap(([n,v])=>operacion(n,v)).join('\n')+fin+"SELECT N'BASELINE_7_TABLAS_28_OPERACIONES' AS Evidencia;");
    assert.match(r,/BASELINE_7_TABLAS_28_OPERACIONES/);
  });
  await t.test('DENY de esquema bloquea28 operaciones y conserva CRUD operativo de dbo',async()=>{
    const r=await ejecutar(inicio+negar+`EXECUTE AS USER=N'${app}';DECLARE @denegada bit;`+negocio+
      Object.entries(tablas).flatMap(([n,v])=>operacion(n,v)).map(denegada).join('\n')+fin+"SELECT N'DENY_28_DBO_4_OK' AS Evidencia;");
    assert.match(r,/DENY_28_DBO_4_OK/);
  });
  await t.test('excepción de columna: DENY de tabla pierde ante GRANT; DENY de esquema debe resistir',async()=>{
    const r=await ejecutar(inicio+`DENY SELECT ON OBJECT::authcom.Contactos TO [${app}];
      GRANT SELECT ON OBJECT::authcom.Contactos(VersionContacto) TO [${app}];
      EXECUTE AS USER=N'${app}';SELECT VersionContacto FROM authcom.Contactos;REVERT;`+
      negar+`GRANT SELECT ON OBJECT::authcom.Contactos TO [${app}];GRANT UPDATE ON OBJECT::authcom.Contactos(VersionContacto) TO [${app}];
      EXECUTE AS USER=N'${app}';DECLARE @denegada bit;`+
      denegada('SELECT VersionContacto FROM authcom.Contactos;')+
      denegada('UPDATE authcom.Contactos SET VersionContacto=VersionContacto WHERE 1=0;')+
      fin+"SELECT N'EXCEPCION_COLUMNA_COMPROBADA' AS Evidencia;");
    assert.match(r,/EXCEPCION_COLUMNA_COMPROBADA/);
  });
  await t.test('objeto futuro también queda protegido por la denegación de esquema',async()=>{
    const r=await ejecutar(inicio+negar+`CREATE TABLE authcom.FuturaAislamiento(Id int NOT NULL);EXECUTE AS USER=N'${app}';DECLARE @denegada bit;`+
      operacion('FuturaAislamiento',['Id','int']).map(denegada).join('\n')+fin+
      "IF OBJECT_ID(N'authcom.FuturaAislamiento') IS NOT NULL THROW 51962,'Objeto residual.',1;SELECT N'FUTURA_PROTEGIDA' AS Evidencia;");
    assert.match(r,/FUTURA_PROTEGIDA/);
  });
  await t.test('propiedad común permite puente dbo; propietario sin login separado corta la cadena',async()=>{
    const r=await ejecutar(inicio+negar+
      `EXEC(N'CREATE VIEW dbo.PuenteAislamiento AS SELECT VersionContacto FROM authcom.Contactos;');
      EXECUTE AS USER=N'${app}';SELECT COUNT_BIG(*) FROM dbo.PuenteAislamiento;REVERT;
      CREATE USER [${owner}] WITHOUT LOGIN;ALTER AUTHORIZATION ON SCHEMA::authcom TO [${owner}];`+negar+
      `CREATE USER [${cuentas}] WITHOUT LOGIN;GRANT SELECT ON OBJECT::authcom.Contactos(VersionContacto) TO [${cuentas}];
      EXECUTE AS USER=N'${app}';DECLARE @denegada bit;`+
      denegada('SELECT COUNT_BIG(*) FROM dbo.PuenteAislamiento;')+
      denegada('SELECT VersionContacto FROM authcom.Contactos;')+
      `REVERT;EXECUTE AS USER=N'${cuentas}';SELECT VersionContacto FROM authcom.Contactos;REVERT;`+
      fin+"IF OBJECT_ID(N'dbo.PuenteAislamiento') IS NOT NULL THROW 51963,'Puente residual.',1;SELECT N'PROPIETARIO_SEPARADO_OK' AS Evidencia;");
    assert.match(r,/PROPIETARIO_SEPARADO_OK/);
  });
  await t.test('un módulo EXECUTE AS OWNER sigue siendo privilegiado: no confundir DENY con sandbox de dbo',async()=>{
    const r=await ejecutar(inicio+`CREATE USER [${owner}] WITHOUT LOGIN;ALTER AUTHORIZATION ON SCHEMA::authcom TO [${owner}];`+negar+
      `EXEC(N'CREATE PROCEDURE dbo.PuentePrivilegiado WITH EXECUTE AS OWNER AS SELECT COUNT_BIG(*) FROM authcom.Contactos;');
      GRANT EXECUTE ON OBJECT::dbo.PuentePrivilegiado TO [${app}];EXECUTE AS USER=N'${app}';EXEC dbo.PuentePrivilegiado;REVERT;`+
      fin+"IF OBJECT_ID(N'dbo.PuentePrivilegiado') IS NOT NULL THROW 51959,'Módulo residual.',1;SELECT N'EXCEPCION_CONTEXTO_PRIVILEGIADO' AS Evidencia;");
    assert.match(r,/EXCEPCION_CONTEXTO_PRIVILEGIADO/);
  });
}));

test('propuestas12/13 exactas: propietario y DCL separados, guardas y fases posteriores',{
  skip:process.env.HOSTFLOW_AUTHCOM_AISLAMIENTO_SQL_TEST!=='1',timeout:90000,
},async()=>laboratorioSqlcmd(async({ejecutar,runId,propuesta})=>{
  const fs=require('node:fs'),path=require('node:path');
  const s=runId.replaceAll('-','').slice(0,16),app='hf_authcom_app_'+s,owner='hf_authcom_owner_'+s;
  const marca=n=>`EXEC sys.sp_addextendedproperty @name=N'HostFlowTestRun',@value=N'${runId}',@level0type=N'USER',@level0name=N'${n}';`;
  const ddl=propuesta('12_propietario_bloqueado.sql').replaceAll('hostflow_authcom_owner',owner);
  const dcl=propuesta('13_aislamiento_bloqueado.sql').replaceAll('hostflow_authcom_owner',owner).replaceAll('hostflow_app',app);
  for(const [f,c] of [['12_propietario_bloqueado.sql',51860],['13_aislamiento_bloqueado.sql',51870]]){
    await assert.rejects(ejecutar(fs.readFileSync(path.join(__dirname,'../../sql/proposals/autenticacion_comercial',f),'utf8')),e=>e.codigosSQL.includes(c));
  }
  try{
    await ejecutar(`BEGIN TRANSACTION;CREATE USER [${app}] WITHOUT LOGIN;${marca(app)}ALTER ROLE db_datareader ADD MEMBER [${app}];ALTER ROLE db_datawriter ADD MEMBER [${app}];COMMIT;`);
    await ejecutar(ddl+marca(owner));
    await ejecutar(`ALTER ROLE db_ddladmin ADD MEMBER [${app}];`);
    await assert.rejects(ejecutar(dcl),e=>e.codigosSQL.includes(51873));
    await ejecutar(`ALTER ROLE db_ddladmin DROP MEMBER [${app}];`);
    await ejecutar(dcl);
    await assert.rejects(ejecutar(dcl),e=>e.codigosSQL.includes(51873));
    for(const f of ['04_ingreso_bloqueado.sql','06_ventana_correo_bloqueada.sql','08_resiliencia_bloqueada.sql'])await ejecutar(propuesta(f));
    const r=await ejecutar(`IF NOT EXISTS(SELECT 1 FROM sys.schemas WHERE name=N'authcom' AND principal_id=DATABASE_PRINCIPAL_ID(N'${owner}')) THROW 51964,'Propietario incorrecto.',1;
      IF(SELECT COUNT(*) FROM sys.database_permissions WHERE class=3 AND major_id=SCHEMA_ID(N'authcom') AND grantee_principal_id=DATABASE_PRINCIPAL_ID(N'${app}') AND state=N'D')<>8 THROW 51965,'DENY incompleto.',1;
      EXECUTE AS USER=N'${app}';DECLARE @n bit;`+
      ['Contactos','Desafios','Cuotas','Outbox','Auditoria','Ingresos','IngresoFallos'].map(n=>`
        SET @n=0;BEGIN TRY EXEC(N'SELECT COUNT_BIG(*) FROM authcom.${n}');END TRY BEGIN CATCH IF ERROR_NUMBER() IN(229,230) SET @n=1;ELSE THROW;END CATCH;
        IF @n<>1 THROW 51966,'Acceso heredado presente.',1;`).join('\n')+
      `SELECT COUNT_BIG(*) FROM dbo.Empresas;REVERT;SELECT N'PROPUESTAS_12_13_FASES_OK' AS Evidencia;`);
    assert.match(r,/PROPUESTAS_12_13_FASES_OK/);
  }finally{
    await ejecutar(`IF USER_NAME()<>N'dbo' REVERT;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name IN(N'${owner}',N'${app}') AND principal_id NOT IN
       (SELECT major_id FROM sys.extended_properties WHERE class=4 AND name=N'HostFlowTestRun' AND CONVERT(nvarchar(100),value)=N'${runId}'))
       THROW 51967,'Principal ajeno: no limpiar.',1;
      IF EXISTS(SELECT 1 FROM sys.schemas WHERE principal_id=DATABASE_PRINCIPAL_ID(N'${owner}') AND name<>N'authcom')
       OR EXISTS(SELECT 1 FROM sys.objects WHERE principal_id IN(DATABASE_PRINCIPAL_ID(N'${owner}'),DATABASE_PRINCIPAL_ID(N'${app}')))
       THROW 51968,'Propiedad ajena: no limpiar.',1;
      BEGIN TRANSACTION;IF EXISTS(SELECT 1 FROM sys.schemas WHERE name=N'authcom' AND principal_id=DATABASE_PRINCIPAL_ID(N'${owner}')) ALTER AUTHORIZATION ON SCHEMA::authcom TO dbo;
      IF DATABASE_PRINCIPAL_ID(N'${app}') IS NOT NULL DROP USER [${app}];
      IF DATABASE_PRINCIPAL_ID(N'${owner}') IS NOT NULL DROP USER [${owner}];COMMIT;
      IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name IN(N'${owner}',N'${app}')) THROW 51969,'Principal residual.',1;`);
  }
},{soloModeloInicial:true}));
