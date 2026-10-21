// Aritmetica decimal exacta: importes en centavos, ARS/USD con ocho decimales.
const MONEDAS = Object.freeze(['ARS', 'USD']);
function unidades(valor, escala = 2) {
  const texto = String(valor ?? '');
  const maxEnteros = 18 - escala;
  if (!new RegExp(`^(0|[1-9]\\d{0,${maxEnteros-1}})(?:\\.(\\d{1,${escala}}))?$`).test(texto)) throw Error('Decimal inválido. Usá punto y hasta '+escala+' decimales.');
  const [entero, parte = ''] = texto.split('.');
  return BigInt(entero) * 10n ** BigInt(escala) + BigInt(parte.padEnd(escala, '0'));
}
function decimal(valor, escala = 2) {
  const base = 10n ** BigInt(escala), n = BigInt(valor);
  if (n < 0n || n >= 10n ** 18n) throw Error('Importe fuera del rango decimal.');
  return `${n/base}.${String(n%base).padStart(escala,'0')}`;
}
function dividirRedondeado(numerador, denominador) {
  if (denominador <= 0n || numerador < 0n) throw Error('Conversión inválida.');
  return (numerador + denominador/2n) / denominador;
}
function convertir(importe, origen, destino, valor) {
  if (!MONEDAS.includes(origen) || !MONEDAS.includes(destino)) throw Error('Moneda no declarada o no admitida.');
  const monto = unidades(importe);
  if (origen === destino) return decimal(monto);
  const tasa = unidades(valor, 8);
  if (tasa <= 0n) throw Error('La cotización debe ser positiva.');
  return decimal(origen === 'USD' ? dividirRedondeado(monto*tasa,100000000n) : dividirRedondeado(monto*100000000n,tasa));
}
function fechaValida(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith('0000')) return false;
  const d = new Date(fecha+'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === fecha;
}
function fechaNegocio(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ahora);
  const p = Object.fromEntries(partes.map(x=>[x.type,x.value])); return `${p.year}-${p.month}-${p.day}`;
}
function cotizacionValida(c, hoy = fechaNegocio()) {
  try { return Boolean(c && ['MANUAL','BCRA'].includes(c.fuente) && c.tipo === (c.fuente==='MANUAL'?'MANUAL':'BCRA_TIPO_COTIZACION') &&
    unidades(c.valor,8)>0n && fechaValida(c.fecha) && c.fecha<=hoy); } catch { return false; }
}
function fijarCheckin({canal, moneda, importe, pagoEquivalenteARS, fechaIngreso, cotizacion, aceptarUltimaOficial = false, ahora = new Date()}) {
  const hoy = fechaNegocio(ahora);
  if (canal !== 'Manual' || moneda !== 'USD' || pagoEquivalenteARS !== true) throw Error('Se requiere un acuerdo manual explícito en USD con pago equivalente en ARS.');
  if (!fechaValida(fechaIngreso) || fechaIngreso>hoy) throw Error('Todavía no llegó el día de check-in.');
  if (!cotizacionValida(cotizacion,hoy) || cotizacion.fecha>fechaIngreso) throw Error('No hay una cotización válida para ese check-in.');
  if (cotizacion.fecha!==fechaIngreso && !(aceptarUltimaOficial === true && cotizacion.fuente==='BCRA')) throw Error('Falta la cotización de ese día. Confirmá explícitamente la última oficial disponible y su fecha real.');
  return Object.freeze({moneda,importe:decimal(unidades(importe)),pagoEquivalenteARS:true,
    fuente:cotizacion.fuente,tipo:cotizacion.tipo,valor:decimal(unidades(cotizacion.valor,8),8),fechaEfectiva:cotizacion.fecha,
    fechaCheckin:fechaIngreso,fijadoEn:ahora.toISOString(),equivalenteARS:convertir(importe,'USD','ARS',cotizacion.valor),
    usoUltimaOficial:cotizacion.fecha!==fechaIngreso});
}
function alertaTarifa(tarifa, actual, hoy = fechaNegocio()) {
  const ref = tarifa?.referencia;
  if (tarifa?.moneda!=='ARS' || !cotizacionValida(ref,hoy) || !cotizacionValida(actual,hoy) ||
    ref.fuente!==actual.fuente || ref.tipo!==actual.tipo || actual.fecha<ref.fecha) return null;
  if (unidades(tarifa.precio)<=0n) return null;
  const a=unidades(ref.valor,8), b=unidades(actual.valor,8), dif=a-b, abs=dif<0n?-dif:dif;
  if (abs*100n < b*15n) return null;
  const puntos=dividirRedondeado(abs*10000n,b), variacion=`${dif<0n?'-':''}${puntos/100n}.${String(puntos%100n).padStart(2,'0')}`;
  return {id:`tarifa:${tarifa.idPropiedad}:${tarifa.versionRegistro}:${actual.fuente}:${actual.tipo}:${actual.fecha}:${actual.valor}`,
    idPropiedad:tarifa.idPropiedad,propiedad:tarifa.nombre,variacionPorcentaje:variacion,fuente:actual.fuente,tipo:actual.tipo,fecha:actual.fecha,
    titulo:'Revisar tarifa en ARS',mensaje:`La equivalencia de referencia en USD varió ${variacion} %. Revisá la tarifa; su precio original no cambió.`,
    destino:{seccion:'configuracion',apartado:'monedas'}};
}
function totalesSeparados(items) {
  const suma={ARS:0n,USD:0n};let sinMoneda=0;
  for(const item of items) { if(!MONEDAS.includes(item.moneda)){sinMoneda++;continue;} suma[item.moneda]+=unidades(item.importe); }
  return {ARS:decimal(suma.ARS),USD:decimal(suma.USD),sinMoneda};
}
module.exports={MONEDAS,unidades,decimal,convertir,fechaValida,fechaNegocio,cotizacionValida,fijarCheckin,alertaTarifa,totalesSeparados};
