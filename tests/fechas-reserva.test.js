const {test}=require('node:test'),assert=require('node:assert/strict');
const {fechaReservaValida,rangoReservaValido}=require('../src/security/validacionReserva');
test('fechas reales ISO: bisiestos, límites, días imposibles y rango estrictamente creciente',()=>{
 for(const valor of ['2024-02-29','2026-12-31','0001-01-01','9999-12-31'])assert.equal(fechaReservaValida(valor),true,valor);
 for(const valor of [null,undefined,{},0,'','2026-02-29','2026-02-30','2026-04-31','2026-13-01','2026-00-10','0000-01-01','2026-1-01','no-es-fecha','2026-01-01T00:00:00Z'])assert.equal(fechaReservaValida(valor),false);
 assert.equal(rangoReservaValido('2024-02-29','2024-03-01'),true);
 assert.equal(rangoReservaValido('2026-01-01','2026-01-01'),false);
 assert.equal(rangoReservaValido('2026-01-02','2026-01-01'),false);
});
