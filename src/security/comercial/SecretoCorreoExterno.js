// Puerto para el proveedor local aprobado. No incluye lector DPAPI, rutas de
// almacenes, variables de entorno ni acceso implícito a credenciales.
function crearSecretoCorreoExterno({ proveedor, cuenta, dominio } = {}) {
  if (typeof proveedor?.abrir !== 'function' || typeof cuenta !== 'string' ||
      !cuenta.trim() || dominio !== 'hostflow.com.ar') throw Error('Proveedor externo no acreditado.');
  let estado = 'inactivo';
  let recurso;
  let apertura;
  let cierre;
  let cierreRecurso;
  const controladores = new Set();
  const pendientes = new Set();
  const liberarRecurso = () => cierreRecurso ??= Promise.resolve().then(() => {
    if (recurso === undefined) return;
    if (typeof recurso?.cerrar !== 'function') throw Error('Cierre del proveedor no acreditado.');
    return recurso.cerrar();
  });

  async function inicializar() {
    if (apertura && ['preparando', 'preparado'].includes(estado)) return apertura;
    if (estado !== 'inactivo') throw Error('Proveedor de correo cerrado.');
    estado = 'preparando';
    apertura = (async () => {
      try {
        const abierto = await proveedor.abrir({ cuenta, dominio, proposito: 'resend-envio' });
        recurso = abierto;
        if (abierto?.cuenta?.toLowerCase() !== cuenta.toLowerCase() || abierto.dominio !== dominio ||
            abierto.proposito !== 'resend-envio' || abierto.permisosAcreditados !== true ||
            typeof abierto.leer !== 'function' || typeof abierto.cerrar !== 'function') {
          throw Error('Identidad del proveedor no acreditada.');
        }
        if (estado !== 'preparando') throw Error('Apertura cancelada.');
        estado = 'preparado';
      } catch {
        estado = 'fallido';
        try { await liberarRecurso(); } catch { estado = 'cierre-incierto'; }
        throw Error('Proveedor de correo no disponible.');
      }
    })();
    return apertura;
  }

  async function obtener({ signal } = {}) {
    if (estado !== 'preparado' || signal?.aborted) throw Error('Credencial de correo no disponible.');
    const controller = new AbortController();
    const abortar = () => controller.abort();
    signal?.addEventListener('abort', abortar, { once: true });
    controladores.add(controller);
    let lectura;
    let bytes;
    try {
      lectura = Promise.resolve().then(() => recurso.leer({ signal: controller.signal }));
      pendientes.add(lectura);
      bytes = await lectura;
      if (controller.signal.aborted || estado !== 'preparado' || !Buffer.isBuffer(bytes) ||
          bytes.length < 16 || bytes.length > 256 || bytes.some(b => b < 33 || b > 126)) {
        throw Error('Credencial inválida.');
      }
      return bytes.toString('ascii');
    } catch {
      throw Error('Credencial de correo no disponible.');
    } finally {
      if (Buffer.isBuffer(bytes)) bytes.fill(0);
      signal?.removeEventListener('abort', abortar);
      controladores.delete(controller);
      pendientes.delete(lectura);
    }
  }

  function cerrar() {
    if (cierre) return cierre;
    estado = 'cerrando';
    controladores.forEach(controller => controller.abort());
    cierre = (async () => {
      // El proveedor debe resolver/cancelar sus lecturas antes de cerrar.
      // Si una lectura no coopera, este cierre permanece pendiente, sin declarar éxito.
      try {
        await apertura?.catch(() => {});
        await Promise.allSettled([...pendientes]);
        await liberarRecurso();
        recurso = undefined;
        estado = 'cerrado';
      } catch {
        estado = 'cierre-incierto';
        throw Error('Cierre del proveedor no acreditado.');
      }
    })();
    return cierre;
  }
  return Object.freeze({ inicializar, obtener, cerrar, estado: () => estado });
}
module.exports = { crearSecretoCorreoExterno };
