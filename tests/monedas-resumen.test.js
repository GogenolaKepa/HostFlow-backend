const {test}=require('node:test'),assert=require('node:assert/strict');
const {AcuerdoMonetarioRepository}=require('../src/repositories/AcuerdoMonetarioRepository');
const {AcuerdoMonetarioService}=require('../src/services/AcuerdoMonetarioService');
const periodo={fechaDesde:'2026-10-01',fechaHasta:'2026-10-31'};
test('Resumen: suma solo acuerdos por moneda original, excluye desconocidos y no agrega equivalentes como cobros',async()=>{
 const repo={comprobarModelo:async id=>assert.equal(id,1),resumen:async(id,f)=>{assert.equal(f.idPropiedad,7);assert.equal(id,1);return [{moneda:'USD',importe:'100.25',cantidad:'1'},{moneda:'ARS',importe:'150000.00',cantidad:'2'},{moneda:null,importe:null,cantidad:'3'}];}};
 const s=new AcuerdoMonetarioService({estado:()=>({reservas:true}),contexto:()=>({idEmpresa:1}),repository:()=>repo});
 const r=await s.resumen({...periodo,idPropiedad:'7'});assert.equal(r.criterio,'IMPORTES_ACORDADOS_ORIGINALES_SIN_COBROS');assert.equal(r.sinMoneda,'3');assert.equal(r.totalReservas,'6');assert.deepEqual(r.porMoneda.map(x=>x.moneda),['ARS','USD']);assert.equal(Object.hasOwn(r,'ingresosTotales'),false);
});
test('Resumen: apagado/fechas/filtros inválidos no consultan SQL ni simulan totales',async()=>{
 const s=new AcuerdoMonetarioService({estado:()=>({reservas:false}),repository:()=>{throw Error('SQL prohibido');}});
 const apagado=await s.resumen(periodo);assert.equal(apagado.disponible,false);assert.equal(apagado.porMoneda,undefined);
 for(const cambio of [{fechaDesde:'2026-02-30'},{fechaHasta:'2026-01-01'},{idPropiedad:'0'},{idEmpresa:'2'},{canal:'Otro'},{estado:'Otro'}])await assert.rejects(s.resumen({...periodo,...cambio}),e=>e.status===400);
});
test('SQL resumen: SELECT parametrizado, FK real IdCanalReserva y ninguna mutación/snapshot sumado',async()=>{
 const args={},driver=require('mssql');let sql;
 const req={input(k,_t,v){args[k]=v;return this;},query:async texto=>{sql=texto;return {recordset:[]};}};
 const r=new AcuerdoMonetarioRepository({getPool:async()=>({request:()=>req}),driver});
 await r.resumen(1,{...periodo,idPropiedad:7,canal:'Manual',estado:'Confirmada'});
 assert.equal(args.empresa,1);assert.equal(args.propiedad,7);assert.equal(args.canal,'Manual');assert.match(sql,/c.IdCanalReserva=r.IdCanalReserva/);assert.match(sql,/SUM\(a.Importe\)/);assert.doesNotMatch(sql,/SUM\(.*EquivalenteARS|\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC)\b/i);assert.match(sql,/GROUP BY a.Moneda/);
});
test('Resumen: valores contractuales de alta precisión se conservan como texto; contrato roto falla cerrado',async()=>{
 const repo={comprobarModelo:async()=>{},resumen:async()=>[{moneda:'USD',importe:'19999999999999999.98',cantidad:'2'}]};
 const s=new AcuerdoMonetarioService({estado:()=>({reservas:true}),contexto:()=>({idEmpresa:1}),repository:()=>repo});
 assert.equal((await s.resumen(periodo)).porMoneda[0].importe,'19999999999999999.98');
 repo.resumen=async()=>[{moneda:'ARS',importe:200,cantidad:'1'}];await assert.rejects(s.resumen(periodo),e=>e.status===500);
});
