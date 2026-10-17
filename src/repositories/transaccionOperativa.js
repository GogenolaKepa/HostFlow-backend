// No conecta al importar. Solo los comandos explícitos usan esta transacción.
async function transaccionOperativa(recurso, ejecutar) {
  const { poolPromise, sql } = require('../config/database');
  const tx = new sql.Transaction(await poolPromise);
  let iniciada = false, revertida = false, confirmando = false;
  tx.on?.('rollback', () => { revertida = true; });
  try {
    await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    iniciada = true;
    const { recordset } = await tx.request()
      .input('recurso', sql.NVarChar(255), recurso)
      .query(`DECLARE @resultado int;
        EXEC @resultado = sys.sp_getapplock @Resource=@recurso,
          @LockMode='Exclusive', @LockOwner='Transaction', @DbPrincipal='public', @LockTimeout=10000;
        SELECT @resultado AS bloqueo;`);
    if (!Number.isInteger(recordset?.[0]?.bloqueo) || recordset[0].bloqueo < 0) {
      throw new Error('La operación está ocupada. Reintentá más tarde.');
    }
    const resultado = await ejecutar(tx);
    confirmando = true;
    await tx.commit();
    return resultado;
  } catch (error) {
    let rollbackIncierto = false;
    if (iniciada && !revertida) {
      try { await tx.rollback(); } catch { rollbackIncierto = true; }
    }
    if (confirmando || rollbackIncierto) throw Object.assign(
      new Error('No se pudo confirmar el resultado del guardado. Recargá los datos antes de reintentar.'),
      { codigo: 'OPERACION_RESULTADO_INCIERTO' });
    throw error;
  }
}
module.exports = { transaccionOperativa };
