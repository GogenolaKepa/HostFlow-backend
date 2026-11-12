const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

function crearProveedorCorreoClixml({ habilitado = false, archivo, raizPrivada, cuentaEsperada,
  formato, usuarioCredencial, ejecutable, sha256, timeoutMs = 10000 } = {}) {
  if (habilitado !== true) return Object.freeze({ abrir: async () => { throw Error('Proveedor de correo inactivo.'); } });
  if (process.platform !== 'win32' || !path.isAbsolute(archivo || '') || !path.isAbsolute(raizPrivada || '') ||
      !/^[A-Za-z]:[\\/]/.test(archivo) || !/^[A-Za-z]:[\\/]/.test(raizPrivada) ||
      path.dirname(path.resolve(archivo)).toLowerCase() !== path.resolve(raizPrivada).toLowerCase() ||
      typeof cuentaEsperada !== 'string' || !cuentaEsperada.trim() || !['securestring', 'pscredential'].includes(formato) ||
      formato === 'pscredential' && (typeof usuarioCredencial !== 'string' || !usuarioCredencial.trim()) ||
      !path.isAbsolute(ejecutable || '') || !/^[A-Za-z]:[\\/]/.test(ejecutable) || path.extname(ejecutable).toLowerCase() !== '.exe' ||
      !/^[a-f0-9]{64}$/.test(sha256 || '') ||
      !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw Error('Proveedor de correo no acreditado.');
  let abierto = false, cerrado = false;
  const controles = new Set(), pendientes = new Set();
  function consultar(accion, signal) {
    return new Promise((resolve, reject) => {
      const fallo = () => Error('Credencial privada de correo no acreditada.');
      if (cerrado || signal?.aborted) { reject(fallo()); return; }
      let hijo, timer, abortado = false, total = 0;
      const partes = [];
      const abortar = () => { abortado = true; hijo?.kill(); };
      const limpiar = () => {
        clearTimeout(timer); signal?.removeEventListener('abort', abortar); controles.delete(abortar);
        partes.forEach(b => b.fill(0));
      };
      try {
        if (!fs.lstatSync(ejecutable).isFile() || fs.lstatSync(ejecutable).isSymbolicLink() ||
            createHash('sha256').update(fs.readFileSync(ejecutable)).digest('hex') !== sha256) throw fallo();
        hijo = spawn(ejecutable, [], {
          windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
          env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', TEMP: os.tmpdir(), TMP: os.tmpdir() },
        });
      } catch { limpiar(); reject(fallo()); return; }
      controles.add(abortar); signal?.addEventListener('abort', abortar, { once: true });
      timer = setTimeout(abortar, timeoutMs);
      hijo.stdout.on('data', bytes => {
        total += bytes.length;
        if (total > (accion === 'leer' ? 256 : 2048)) { bytes.fill(0); abortar(); }
        else partes.push(bytes);
      });
      // Consumir y borrar stderr. Nunca propagar mensajes de PowerShell o del archivo.
      hijo.stderr.on('data', bytes => bytes.fill(0));
      hijo.stdin.on('error', abortar);
      hijo.once('error', () => { limpiar(); reject(fallo()); });
      hijo.once('close', code => {
        let unido;
        try {
          if (code !== 0 || abortado) throw fallo();
          unido = Buffer.concat(partes);
          if (accion === 'leer') {
            if (unido.length < 16 || unido.length > 256 || unido.some(b => b < 33 || b > 126)) throw fallo();
            resolve(unido); unido = undefined; // Propiedad transferida, el consumidor debe borrar el Buffer.
          } else resolve(JSON.parse(unido.toString('utf8')));
        } catch { reject(fallo()); }
        finally { unido?.fill(0); limpiar(); }
      });
      hijo.stdin.end(JSON.stringify({ accion, archivo: path.resolve(archivo), raizPrivada: path.resolve(raizPrivada),
        cuenta: cuentaEsperada, dominio: 'hostflow.com.ar', proposito: 'resend-envio', formato, usuarioCredencial }) + '\n');
    });
  }
  function seguir(accion, signal) {
    const p = consultar(accion, signal);
    pendientes.add(p); p.then(() => pendientes.delete(p), () => pendientes.delete(p));
    return p;
  }
  return Object.freeze({
    async abrir(binding) {
      if (abierto || cerrado || binding?.cuenta?.toLowerCase() !== cuentaEsperada.toLowerCase() ||
          binding.dominio !== 'hostflow.com.ar' || binding.proposito !== 'resend-envio') throw Error('Proveedor de correo no acreditado.');
      abierto = true;
      const metadata = await seguir('verificar');
      return { ...metadata, leer: ({ signal } = {}) => seguir('leer', signal),
        async cerrar() {
          cerrado = true; controles.forEach(abortar => abortar());
          await Promise.allSettled([...pendientes]);
        } };
    },
  });
}
module.exports = { crearProveedorCorreoClixml };
