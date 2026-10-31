const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const bcrypt=require('bcryptjs');
const local=require('./sqlAislado');
const {ejecutar}=require('./sqlComercialAislado');
const UsuarioRepository=require('../../src/repositories/UsuarioRepository');
const {AutenticacionComercialSql}=require('../../src/repositories/AutenticacionComercialSql');
const {IngresoComercialSql}=require('../../src/repositories/IngresoComercialSql');
const {AutenticacionComercialService}=require('../../src/services/AutenticacionComercialService');
const {IngresoRecuperacionService}=require('../../src/services/IngresoRecuperacionService');
const {EntregaCorreoSeguridad}=require('../../src/security/comercial/EntregaCorreoSeguridad');
const {crearProtectorCorreo,crearIndicePrivado}=require('../../src/security/comercial/credencialesTemporales');
test('authcom: propuestas y adaptadores en SQL Server local descartable REAL',{
  skip:process.env.HOSTFLOW_AUTHCOM_ADAPTER_SQL_TEST!=='1',timeout:120000,
},async t=>{
  const env={HOSTFLOW_SQL_TEST_ENABLED:'1',HOSTFLOW_SQL_TEST_AUTH:'windows',HOSTFLOW_SQL_TEST_SERVER:'localhost',HOSTFLOW_SQL_TEST_DATABASE:local.BASE,HOSTFLOW_SQL_TEST_WRITE_APPROVED:process.env.HOSTFLOW_SQL_TEST_WRITE_APPROVED};
  const driver=require('mssql/msnodesqlv8');const pool=await new driver.ConnectionPool(local.configuracionSQLAislada(env)).connect();
  const runId=randomUUID();
  try{await ejecutar(pool,driver,runId,async(sql,request)=>{
    const repo=new IngresoComercialSql({habilitado:true,repository:new AutenticacionComercialSql({pool,driver:sql,baseEsperada:local.BASE,servidorEsperado:local.EQUIPO,idEmpresa:1,habilitado:true})});
    const protector=crearProtectorCorreo({clave:randomBytes(32),keyId:'prueba-local'}),indicePrivado=crearIndicePrivado(randomBytes(32));
    const opciones={repository:repo,protector,indicePrivado,idEmpresa:1,origen:'https://cuentas.example.invalid',hashPassword:p=>bcrypt.hash(p,4)};
    const cuentas=new AutenticacionComercialService(opciones),ingreso=new IngresoRecuperacionService({...opciones,cuentas});
    const correos=[],worker=new EntregaCorreoSeguridad({repository:repo,protector,proveedor:{enviar:async m=>correos.push(m)}});
    const usuarios=new UsuarioRepository({getPool:async()=>pool,driver:sql});
    const password=randomBytes(24).toString('hex');
    const crear=async(idRol,email)=>usuarios.crear({nombre:'Persona ficticia SQL',email,passwordHash:await bcrypt.hash(password,4),idRol});
    const admin=await crear(1,'admin@example.invalid'),operador=await crear(3,'operador@example.invalid');
    await request().input('id',admin.idUsuario).query('UPDATE dbo.Usuarios SET DebeCambiarPassword=0 WHERE IdUsuario=@id;');
    await request().input('id',operador.idUsuario).query("INSERT authcom.Contactos(IdUsuario,Email,VersionContacto,VerificadoEn) SELECT IdUsuario,Email,1,SYSUTCDATETIME() FROM dbo.Usuarios WHERE IdUsuario=@id;");
    const actor=await repo.transaccion(tx=>tx.usuario(admin.idUsuario));
    const contexto={ip:'127.0.0.1'};let token;
    await t.test('DDL, restricciones confiables y cola durable con sobres cifrados',async()=>{
      const checks=await request().query("SELECT name FROM sys.check_constraints WHERE parent_object_id IN (SELECT object_id FROM sys.tables WHERE schema_id=SCHEMA_ID(N'authcom')) AND (is_disabled=1 OR is_not_trusted=1); SELECT COUNT(*) AS n FROM sys.tables WHERE schema_id=SCHEMA_ID(N'authcom');");
      assert.equal(checks.recordsets[0].length,0);assert.equal(checks.recordsets[1][0].n,7);
      await ingreso.solicitar({email:'operador@example.invalid'},contexto);
      const sobres=await request().query('SELECT Sobre FROM authcom.Ingresos;');assert.ok(!JSON.stringify(sobres.recordset).includes('operador@example.invalid'));
      const r=await Promise.all([ingreso.procesarUna(),ingreso.procesarUna()]);assert.deepEqual(r.map(v=>v.estado).sort(),['procesada','sin-pendientes']);
      assert.equal((await worker.procesarUna()).estado,'entregada');assert.equal(correos.length,1);
      token=new URLSearchParams(new URL(correos[0].enlace).hash.slice(1)).get('token');
    });
    await t.test('rollback real conserva token y password; consumo concurrente único invalida sesiones',async()=>{
      const falla={transaccion:fn=>repo.transaccion(tx=>{const scope=Object.create(tx);scope.encolar=()=>{throw Error('fallo de outbox simulado');};return fn(scope);})};
      const roto=new AutenticacionComercialService({...opciones,repository:falla});
      const nueva=randomBytes(24).toString('hex');
      await assert.rejects(roto.confirmarRecuperacion({token,passwordNueva:nueva},contexto),{codigo:'CUENTAS_RESULTADO_INCIERTO'});
      const previo=await repo.transaccion(tx=>tx.usuario(operador.idUsuario));assert.equal(previo.versionSesion,1);assert.equal(await bcrypt.compare(password,previo.passwordHash),true);
      const resultados=await Promise.allSettled([cuentas.confirmarRecuperacion({token,passwordNueva:nueva},contexto),cuentas.confirmarRecuperacion({token,passwordNueva:nueva},contexto)]);
      assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(resultados.filter(r=>r.status==='rejected'&&r.reason.codigo==='ENLACE_INVALIDO').length,1);
      const u=await repo.transaccion(tx=>tx.usuario(operador.idUsuario));assert.equal(u.versionSesion,2);assert.equal(await bcrypt.compare(nueva,u.passwordHash),true);
      await assert.rejects(cuentas.validarEnlace('recuperacion',token,contexto),{codigo:'ENLACE_INVALIDO'});
    });
    await t.test('invitaciones duplicadas, aceptación y revocación usan SQL real',async()=>{
      const body={nombre:'Operador invitado',email:'invitado@example.invalid'};
      await Promise.all([cuentas.invitar(actor,body,contexto),cuentas.invitar(actor,body,{ip:'127.0.0.2'})]);
      assert.equal((await cuentas.listarInvitaciones(actor)).invitaciones.length,1);
      for(let n=0;n<3;n++)await worker.procesarUna();
      const mail=correos.find(m=>m.plantilla==='invitacion');assert.ok(mail);
      const tokenInv=new URLSearchParams(new URL(mail.enlace).hash.slice(1)).get('token');
      await cuentas.aceptarInvitacion({token:tokenInv,passwordNueva:randomBytes(24).toString('hex')},contexto);
      const invitado=await repo.transaccion(tx=>tx.buscarUsuario(body.email));assert.equal(invitado.rol,'Operador');assert.equal((await cuentas.listarInvitaciones(actor)).invitaciones[0].estado,'Aceptada');
      await assert.rejects(cuentas.aceptarInvitacion({token:tokenInv,passwordNueva:randomBytes(24).toString('hex')},contexto),{codigo:'ENLACE_INVALIDO'});
      await cuentas.invitar(actor,{nombre:'Revocación ficticia',email:'revocada@example.invalid'},contexto);
      const pendiente=(await cuentas.listarInvitaciones(actor)).invitaciones.find(i=>i.estado==='Pendiente');
      await cuentas.revocarInvitacion(actor,pendiente.id);assert.equal((await cuentas.listarInvitaciones(actor)).invitaciones.find(i=>i.id===pendiente.id).estado,'Revocada');
      await assert.rejects(cuentas.listarInvitaciones(invitado),{codigo:'SIN_PERMISO'});
    });
    await t.test('lease concurrente no duplica entrega y ventana de deduplicación descarta reenvíos antiguos',async()=>{
      const id=randomUUID();await repo.transaccion(tx=>tx.encolar({id,desafioId:null,expiraEn:Date.now()+7*86400000,sobre:protector.sellar({destinatario:'operador@example.invalid',plantilla:'seguridad-cuenta',evento:'recuperacion'},id)}));
      const antes=correos.length;await Promise.all([worker.procesarUna(),worker.procesarUna()]);assert.equal(correos.length,antes+1);
      const otro=randomUUID();await repo.transaccion(tx=>tx.encolar({id:otro,desafioId:null,expiraEn:Date.now()+7*86400000,sobre:protector.sellar({destinatario:'operador@example.invalid',plantilla:'seguridad-cuenta',evento:'recuperacion'},otro)}));
      await request().input('id',otro).query("UPDATE authcom.Outbox SET Estado='fallida',Intentos=1,PrimerIntentoEn=DATEADD(day,-1,SYSUTCDATETIME()) WHERE Id=@id;");
      assert.equal((await worker.procesarUna()).estado,'sin-pendientes');
      const r=await request().input('id',otro).query('SELECT Estado,Sobre,EnCuarentena FROM authcom.Outbox WHERE Id=@id;');assert.equal(r.recordset[0].EnCuarentena,true);assert.ok(r.recordset[0].Sobre);
    });
  });}finally{await pool.close();}
});
