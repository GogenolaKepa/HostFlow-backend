const { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv } = require("node:crypto");

const PROPOSITOS = Object.freeze(["recuperacion", "invitacion"]);
function hashToken(token, proposito) {
  if (!PROPOSITOS.includes(proposito) || typeof token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token, "base64url").toString("base64url") !== token) return null;
  return createHash("sha256").update(`HostFlow:cuentas:${proposito}:`).update(token).digest("hex");
}
function crearToken(proposito) {
  const token = randomBytes(32).toString("base64url");
  const hash = hashToken(token, proposito);
  if (!hash) throw new TypeError("Propósito no admitido.");
  return { token, hash };
}
function claveValida(clave) {
  if (!Buffer.isBuffer(clave) || clave.length !== 32) throw new TypeError("Se requiere una clave independiente de 32 bytes.");
  return Buffer.from(clave);
}
function crearIndicePrivado(clave) {
  const key = claveValida(clave);
  return (tipo, valor) => createHmac("sha256", key).update(`${tipo}\0${valor}`).digest("hex");
}

// Solo la outbox necesita recuperar el enlace; los desafíos guardan únicamente su hash.
// AAD impide trasladar un sobre cifrado a otra entrega. Claves inyectadas, nunca JWT_SECRET.
function crearProtectorCorreo({ clave, keyId }) {
  const key = claveValida(clave);
  if (typeof keyId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(keyId)) throw new TypeError("keyId no válido.");
  return Object.freeze({
    sellar(payload, idEntrega) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(`HostFlow:correo:${idEntrega}`));
      const contenido = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
      return { keyId, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), contenido: contenido.toString("base64url") };
    },
    abrir(sobre, idEntrega) {
      if (sobre?.keyId !== keyId) throw new Error("Clave de entrega no disponible.");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sobre.iv, "base64url"));
      decipher.setAAD(Buffer.from(`HostFlow:correo:${idEntrega}`));
      decipher.setAuthTag(Buffer.from(sobre.tag, "base64url"));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sobre.contenido, "base64url")), decipher.final()]).toString("utf8"));
    },
  });
}
module.exports = { crearToken, hashToken, crearIndicePrivado, crearProtectorCorreo };
