const {test}=require('node:test');const assert=require('node:assert/strict');
const m=require('../src/domain/monedas');
const q=(valor='1000.00000000',fecha='2026-10-16')=>({fuente:'BCRA',tipo:'BCRA_TIPO_COTIZACION',valor,fecha});
test('Monedas: conversión decimal exacta, ceros, centavos, redondeo half-up y grandes importes',()=>{
 assert.equal(m.convertir('100.00','USD','ARS','1500.12345678'),'150012.35');
 assert.equal(m.convertir('1.00','ARS','USD','3.00000000'),'0.33');
 assert.equal(m.convertir('0.01','USD','ARS','0.50000000'),'0.01');
 assert.equal(m.convertir('0','USD','ARS','1000'),'0.00');
 assert.equal(m.convertir('9999999999999999.99','ARS','ARS',null),'9999999999999999.99');
 assert.throws(()=>m.convertir('9999999999999999.99','USD','ARS','2'));
});
test('Monedas: no acepta tasas, divisas o decimales inválidos ni convierte una moneda desconocida',()=>{
 for(const v of ['0','-1','NaN','Infinity','1,5','1e3','','10000000000','1.000000001'])assert.throws(()=>m.convertir('1','USD','ARS',v));
 for(const v of ['-1','1.001','01','NaN'])assert.throws(()=>m.convertir(v,'USD','ARS','1000'));
 assert.throws(()=>m.convertir('1',null,'ARS','1000'));assert.throws(()=>m.convertir('1','EUR','ARS','1000'));
});
test('Monedas: nunca mezcla totales ARS/USD ni atribuye moneda a registros antiguos/canales',()=>{
 const items=[{importe:'100.05',moneda:'ARS'},{importe:'0.05',moneda:'ARS'},{importe:'100',moneda:'USD'},{importe:200,canal:'Booking'},{importe:300,canal:'Airbnb'}];
 const copia=JSON.stringify(items);assert.deepEqual(m.totalesSeparados(items),{ARS:'100.10',USD:'100.00',sinMoneda:2});assert.equal(JSON.stringify(items),copia);
});
test('Check-in: fechas reales, zona Buenos Aires y ausencia de cotizaciones futuras',()=>{
 assert.equal(m.fechaNegocio(new Date('2026-10-17T01:00:00Z')),'2026-10-16');
 assert.equal(m.fechaValida('2028-02-29'),true);assert.equal(m.fechaValida('2026-02-29'),false);
 assert.equal(m.cotizacionValida(q('1000','2026-10-18'),'2026-10-17'),false);
 assert.equal(m.cotizacionValida({...q(),tipo:'VENTA'}),false);
});
test('Check-in: acuerdo explícito manual, snapshot inmutable y última oficial solo por aceptación',()=>{
 const datos={canal:'Manual',moneda:'USD',importe:'100',pagoEquivalenteARS:true,fechaIngreso:'2026-10-17',cotizacion:q(),ahora:new Date('2026-10-17T15:00:00Z')};
 assert.throws(()=>m.fijarCheckin(datos),/última oficial/);
 const fijacion=m.fijarCheckin({...datos,aceptarUltimaOficial:true});assert.equal(fijacion.equivalenteARS,'100000.00');assert.equal(fijacion.fechaEfectiva,'2026-10-16');assert.equal(Object.isFrozen(fijacion),true);
 for(const cambio of [{canal:'Booking'},{canal:'Airbnb'},{moneda:'ARS'},{pagoEquivalenteARS:false},{fechaIngreso:'2026-10-18'},
  {cotizacion:null},{cotizacion:q('1000','2026-10-18')},{cotizacion:{fuente:'MANUAL',tipo:'MANUAL',valor:'1000',fecha:'2026-10-16'}}])assert.throws(()=>m.fijarCheckin({...datos,aceptarUltimaOficial:true,...cambio}));
 assert.equal(m.fijarCheckin({...datos,cotizacion:q('1000','2026-10-17')}).usoUltimaOficial,false);
});
test('Tarifas: alerta al 15% de equivalencia, misma fuente/tipo y clave estable; no cambia precios',()=>{
 const t={idPropiedad:5,nombre:'Ficticia',moneda:'ARS',precio:'100000',versionRegistro:'01',referencia:q()};const copia=JSON.stringify(t);
 assert.equal(m.alertaTarifa(t,q('1100'),'2026-10-17'),null);
 const a=m.alertaTarifa(t,q('1250'),'2026-10-17');assert.equal(a.variacionPorcentaje,'-20.00');assert.deepEqual(a,m.alertaTarifa(t,q('1250'),'2026-10-17'));
 assert.deepEqual(a.destino,{seccion:'configuracion',apartado:'monedas'});assert.equal(JSON.stringify(t),copia);
 for(const cambio of [{moneda:'USD'},{referencia:null},{referencia:{...q(),fuente:'MANUAL',tipo:'MANUAL'}}])assert.equal(m.alertaTarifa({...t,...cambio},q('1250'),'2026-10-17'),null);
 assert.equal(m.alertaTarifa(t,q('1250','2026-10-15'),'2026-10-17'),null);
});
test('Tarifas: umbral exacto de 15%, sin activar por redondeo visual inferior al umbral',()=>{
 const t={idPropiedad:5,moneda:'ARS',precio:'100000',versionRegistro:'01',referencia:q('1150')};
 assert.equal(m.alertaTarifa(t,q('1000'),'2026-10-17').variacionPorcentaje,'15.00');
 assert.equal(m.alertaTarifa({...t,referencia:q('1149.99999999')},q('1000'),'2026-10-17'),null);
 assert.equal(m.alertaTarifa({...t,referencia:q('850')},q('1000'),'2026-10-17').variacionPorcentaje,'-15.00');
});
