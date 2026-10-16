// Todas las variables del catálogo actual son IDs positivos, no slugs.
// Se ejecuta antes de los controladores: GET/HEAD de reservas pueden escribir.
function identificadoresRutaValidos(politica, path) {
  const partes = path.replace(/\/$/, '').split('/');
  return politica.path.split('/').every((campo, indice) => {
    if (!campo.startsWith(':')) return true;
    try {
      const valor = decodeURIComponent(partes[indice]);
      const maximo = politica.path === '/notificaciones/personales/:id/lectura' ? 9223372036854775807n : 2147483647n;
      return /^[1-9]\d{0,18}$/.test(valor) && BigInt(valor) <= maximo;
    } catch {
      return false;
    }
  });
}
module.exports = {identificadoresRutaValidos};
