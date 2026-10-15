const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const bcrypt=require('bcryptjs');
const {configuracionSQLAislada}=require('./sqlAislado');
const aislado=require('./sqlConfiguracionAislada');
const {ConfiguracionRepository}=require('../../src/repositories/ConfiguracionRepository');
const {ConfiguracionService}=require('../../src/services/ConfiguracionService');
const UsuarioRepository=require('../../src/repositories/UsuarioRepository');
const {numerosErrorSQL}=require('../../src/security/seguridadUsuarios');

test('SQL local aislado: configuración empresarial, concurrencia, restricciones y limpieza',{
 skip:process.env.HOSTFLOW_SQL_TEST_ENABLED!=='1',timeout:120000,
},async(t)=>{
  const config=configuracionSQLAislada(process.env),driver=require('mssql/msnodesqlv8');
  const contexto={runId:randomUUID(),vacia:true},protegido=aislado.driverProtegido(driver,contexto,process.env);
  let pool;
  try {
    pool=await new driver.ConnectionPool(config).connect();
    pool.request=()=>new protegido.Request(pool);
    await aislado.ejecutar(pool,contexto,async()=>{
      contexto.faseOperacion='resolver rol';
      const usuarios=new UsuarioRepository({getPool:async()=>pool,driver:protegido});
      const rol=await usuarios.roles.resolverActivo('Administrador');
      contexto.faseOperacion='crear fixture usuario';
      let admin=await usuarios.crear({nombre:'Administrador aislado',email:'configuracion@example.invalid',passwordHash:await bcrypt.hash(randomBytes(20).toString('hex'),4),idRol:rol.idRol});
      contexto.faseOperacion='habilitar fixture usuario';
      admin=await usuarios.actualizar(admin.idUsuario,admin.versionRegistro.toString('hex'),{debeCambiarPassword:false},null);
      contexto.faseOperacion='crear empresas ficticias';
      await t.test('vinculación explícita crea una fila vacía y horarios originales; no admite repetirla',async()=>{
        await pool.request().batch(aislado.vinculacionInicial(contexto));
        await assert.rejects(pool.request().batch(aislado.vinculacionInicial(contexto)),e=>numerosErrorSQL(e).includes(51513));
        assert.equal((await pool.request().query('SELECT COUNT(*) AS cantidad FROM dbo.Empresas;')).recordset[0].cantidad,1);
      });
      await new protegido.Request(pool).query(`INSERT INTO dbo.Empresas DEFAULT VALUES;
       INSERT INTO dbo.PreferenciasOperativas(IdEmpresa,HoraIngreso,HoraEgreso,ZonaHoraria)
       SELECT IdEmpresa,CONVERT(time(0),'15:00'),CONVERT(time(0),'10:00'),N'America/Argentina/Buenos_Aires' FROM dbo.Empresas WHERE IdEmpresa=2;`);
      const repo=new ConfiguracionRepository({getPool:async()=>pool,driver:protegido});
      const service=new ConfiguracionService({repository:repo,contexto:()=>({idEmpresa:1})});
      await t.test('datos y horas persisten; se recupera revisión sin afectar la empresa ajena',async()=>{
        const empresa=await service.obtener('empresa');assert.equal(empresa.nombreComercial,'');
        const ajena=await repo.leer(2,'empresa');
        const saved=await service.guardar(admin,'empresa',{...empresa,nombreComercial:"Negocio '; SELECT 1; --",correoContacto:'contacto@example.invalid'});
        assert.equal((await service.obtener('empresa')).nombreComercial,saved.nombreComercial);
        assert.deepEqual(await repo.leer(2,'empresa'),ajena);
        const prefs=await service.obtener('operativas');
        const actual=await service.guardar(admin,'operativas',{horaIngreso:'17:30',horaEgreso:'09:15',versionRegistro:prefs.versionRegistro});
        assert.deepEqual(await service.obtener('operativas'),actual);
      });
      await t.test('dos revisiones concurrentes: una gana y la otra obtiene 409',async()=>{
        const actual=await service.obtener('empresa');
        const resultados=await Promise.allSettled([service.guardar(admin,'empresa',{...actual,nombreComercial:'Primera'}),service.guardar(admin,'empresa',{...actual,nombreComercial:'Segunda'})]);
        assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);assert.equal(resultados.find(r=>r.status==='rejected').reason.status,409);
      });
      await t.test('CHECK, FK y zona fija efectivos; revisión stale no altera datos',async()=>{
        const query=sql=>new protegido.Request(pool).query(sql);
        for(const sql of ["UPDATE dbo.PreferenciasOperativas SET ZonaHoraria=N'UTC' WHERE IdEmpresa=1;","UPDATE dbo.PreferenciasOperativas SET HoraIngreso=CONVERT(time(0),'12:00:30') WHERE IdEmpresa=1;",'UPDATE dbo.Empresas SET IdUsuarioActualizacion=999999 WHERE IdEmpresa=1;'])await assert.rejects(query(sql));
        const before=await service.obtener('empresa');
        await assert.rejects(service.guardar(admin,'empresa',{...before,versionRegistro:'ffffffffffffffff'}),e=>e.status===409);
        assert.deepEqual(await service.obtener('empresa'),before);
      });
      await t.test('rollback real después de UPDATE, actor revocado y Operador no cambian la empresa', async()=>{
        const before = await service.obtener('empresa');
        await assert.rejects(repo.transaccion(async tx=>{
          await tx.actualizar(1,'empresa',{...before,nombreComercial:'Cambio que debe revertirse'},before.versionRegistro,admin.idUsuario);
          throw Error('Fallo aislado después del UPDATE.');
        }),e=>e.status===503);
        assert.deepEqual(await service.obtener('empresa'),before);
        await assert.rejects(service.guardar({...admin,versionSesion:admin.versionSesion+1},'empresa',before),e=>e.status===401);
        const rolOperador = await usuarios.roles.resolverActivo('Operador');
        let operador = await usuarios.crear({nombre:'Operador aislado',email:'operador-configuracion@example.invalid',passwordHash:await bcrypt.hash(randomBytes(20).toString('hex'),4),idRol:rolOperador.idRol});
        operador = await usuarios.actualizar(operador.idUsuario,operador.versionRegistro.toString('hex'),{debeCambiarPassword:false},null);
        await assert.rejects(service.guardar(operador,'empresa',before),e=>e.status===403);
        assert.deepEqual(await service.obtener('empresa'),before);
        const horas = await service.obtener('operativas');
        for(const hora of ['24:00','12:60','9:00','12:00:30']) await assert.rejects(service.guardar(admin,'operativas',{horaIngreso:hora,horaEgreso:'10:00',versionRegistro:horas.versionRegistro}),e=>e.status===400);
        assert.deepEqual(await service.obtener('operativas'),horas);
      });
    });
    assert.equal((await pool.request().query('SELECT COUNT(*) AS cantidad FROM sys.tables WHERE is_ms_shipped=0;')).recordset[0].cantidad,0);
  }catch(error){throw Error(`Falló integración de configuración SQL local en ${error.faseLocal||'conexión'}; códigos SQL ${(error.codigosSQL||[]).join(',')||'no disponibles'}; código seguro ${error.codigoSeguro||'ninguno'}; tipo ${error.tipoError||'no disponible'}; ejecución ${contexto.runId}. Sin detalles privados.`);}
  finally{await pool?.close();}
});
