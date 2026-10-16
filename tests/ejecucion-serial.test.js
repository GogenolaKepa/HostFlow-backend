const {test}=require('node:test');
const assert=require('node:assert/strict');
const {crearEjecucionSerial}=require('../src/utils/ejecucionSerial');
const {cantidadReserva,montoReserva}=require('../src/security/validacionReserva');

test('cola por clave: mantiene orden, admite paralelismo entre claves y libera errores',async()=>{
 const serial=crearEjecucionSerial(),traza=[];let liberar;
 const bloqueo=new Promise(resolve=>{liberar=resolve;});
 const uno=serial('a',async()=>{traza.push('a1');await bloqueo;throw Error('fallo ficticio');});
 const dos=serial('a',()=>{traza.push('a2');return 2;});
 const tres=serial('b',()=>{traza.push('b');return 3;});
 assert.equal(await tres,3);assert.deepEqual(traza,['a1','b']);liberar();
 await assert.rejects(uno,/ficticio/);assert.equal(await dos,2);assert.deepEqual(traza,['a1','b','a2']);
 assert.equal(await serial('a',()=>4),4);
});
test('valores de reserva: numeros finitos, enteros positivos SQL int y valores opcionales',()=>{
 assert.equal(cantidadReserva(),1);assert.equal(cantidadReserva('4'),4);assert.equal(cantidadReserva(2147483647),2147483647);
 for(const valor of [-1,0,1.5,2147483648,NaN,Infinity,[],[1],{},true,' ', 'NaN'])assert.throws(()=>cantidadReserva(valor));
 assert.equal(montoReserva(),0);assert.equal(montoReserva('0'),0);assert.equal(montoReserva('12.50'),12.5);
 for(const valor of [-1,Infinity,NaN,'Infinity','NaN',{},[],[1],true,' '])assert.throws(()=>montoReserva(valor));
});
