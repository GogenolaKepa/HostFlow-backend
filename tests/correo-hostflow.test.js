const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { CORREO_HOSTFLOW_PROPUESTO, validarRemitente } = require('../src/security/comercial/configuracionCorreo');
const { ResendCorreo } = require('../src/security/comercial/ResendCorreo');
const { crearPlantillaCorreo } = require('../src/security/comercial/plantillasCorreo');
const { crearToken } = require('../src/security/comercial/credencialesTemporales');
const { leerConfiguracionComercial } = require('../src/services/ConfiguracionComercialPreparada');

const origen = CORREO_HOSTFLOW_PROPUESTO.origen;
function mensaje(plantilla) {
  return { plantilla, destinatario: 'persona@example.invalid', idempotencyKey: randomUUID(),
    enlace: `${origen}/cuenta/${plantilla}#token=${crearToken(plantilla).token}` };
}
function proveedor(opciones = {}) {
  return new ResendCorreo({ ...CORREO_HOSTFLOW_PROPUESTO,
    obtenerSecreto: async () => 'CLAVE_FICTICIA_SIN_ACCESO_EXTERNO',
    transportar: () => assert.fail('Transporte no inyectado para este ensayo'), ...opciones });
}

test('remitente central de HostFlow permanece inactivo y exige configuración explícita', async () => {
  assert.equal(CORREO_HOSTFLOW_PROPUESTO.remitente, 'seguridad@hostflow.com.ar');
  assert.ok(Object.isFrozen(CORREO_HOSTFLOW_PROPUESTO));
  assert.deepEqual(leerConfiguracionComercial(), { habilitado: false });
  await assert.rejects(proveedor().enviar(mensaje('recuperacion')), { codigo: 'CORREO_INACTIVO' });
  assert.deepEqual(validarRemitente('Seguridad@HostFlow.com.ar', 'HOSTFLOW.COM.AR'),
    { remitente: 'seguridad@hostflow.com.ar', dominioVerificado: 'hostflow.com.ar' });
});

test('configuración y adaptador rechazan header injection, dominios ajenos y mailboxes ambiguos', () => {
  const env = { HOSTFLOW_AUTH_COMERCIAL_ENABLED: '1', DB_SERVER: 'hostflow.database.windows.net',
    DB_DATABASE: 'HostFlow', HOSTFLOW_EMPRESA_ID: '1', HOSTFLOW_AUTH_COMERCIAL_ORIGEN: origen,
    HOSTFLOW_AUTH_COMERCIAL_DOMINIO: 'hostflow.com.ar' };
  for (const remitente of ['seguridad@otro.invalid', 'HostFlow <seguridad@hostflow.com.ar>',
    'seguridad@hostflow.com.ar\r\nBcc:otra@example.invalid', 'a,b@hostflow.com.ar',
    'a..b@hostflow.com.ar', '.a@hostflow.com.ar', 'a.@hostflow.com.ar',
    '"a"@hostflow.com.ar', 'a@-hostflow.com.ar', 'a'.repeat(65) + '@hostflow.com.ar']) {
    assert.throws(() => proveedor({ remitente }));
    assert.throws(() => leerConfiguracionComercial({ ...env, HOSTFLOW_AUTH_COMERCIAL_REMITENTE: remitente }));
  }
  const r = leerConfiguracionComercial({ ...env, HOSTFLOW_AUTH_COMERCIAL_REMITENTE: 'seguridad@hostflow.com.ar' });
  assert.equal(r.correo.remitente, CORREO_HOSTFLOW_PROPUESTO.remitente);
});

test('los tres correos atraviesan Resend simulado con remitente único, texto y HTML deterministas', async () => {
  const llamadas = [];
  const p = proveedor({ habilitado: true, transportar: async (url, opciones) => {
    llamadas.push({ url, opciones });
    return { status: 200, json: async () => ({ id: randomUUID() }) };
  } });
  for (const plantilla of ['recuperacion', 'invitacion', 'contacto']) {
    const datos = mensaje(plantilla);
    const r = await p.enviar(datos);
    assert.equal(r.estado, 'aceptada');
    const llamada = llamadas.at(-1);
    const cuerpo = JSON.parse(llamada.opciones.body);
    assert.equal(llamada.url, 'https://api.resend.com/emails');
    assert.equal(llamada.opciones.redirect, 'error');
    assert.equal(cuerpo.from, 'HostFlow Seguridad <seguridad@hostflow.com.ar>');
    assert.deepEqual(cuerpo.to, ['persona@example.invalid']);
    assert.ok(cuerpo.html.includes(datos.enlace));
    assert.ok(cuerpo.text.includes(datos.enlace));
    assert.doesNotMatch(cuerpo.html, /<img|<script|<form|<iframe|https?:\/\/[^"\s<>]*fonts/i);
    assert.ok(!JSON.stringify(cuerpo).includes('CLAVE_FICTICIA'));
    assert.match(cuerpo.html, /lang="es"/);
    assert.match(cuerpo.html, /role="presentation"/);
    assert.match(cuerpo.text, /HostFlow nunca te pedirá tu contraseña/);
    assert.deepEqual(crearPlantillaCorreo(datos, origen), crearPlantillaCorreo(datos, origen));
  }
  assert.equal(llamadas.length, 3);
  const contacto = JSON.parse(llamadas[2].opciones.body);
  assert.match(contacto.text, /Mantené iniciada la sesión/);
  assert.match(contacto.subject, /Verificá tu correo/);
});

test('rechazo 403 no lee cuerpo sensible ni reintenta y no acredita recepción', async () => {
  let llamadas = 0;
  const p = proveedor({ habilitado: true, transportar: async () => {
    llamadas++;
    return { status: 403, json: () => assert.fail('No leer detalles del proveedor') };
  } });
  await assert.rejects(p.enviar(mensaje('invitacion')),
    e => e.codigo === 'CONFIGURACION_CORREO_INVALIDA' && e.politica === 'cuarentena');
  assert.equal(llamadas, 1);
});

test('enlaces hostiles y parámetros adicionales se rechazan antes de acceder al secreto', async () => {
  let secretos = 0;
  const p = proveedor({ habilitado: true, obtenerSecreto: () => { secretos++; return 'ficticia'; } });
  const valido = mensaje('recuperacion');
  for (const enlace of [valido.enlace.replace('hostflow.com.ar', 'hostil.example.invalid'),
    valido.enlace.replace('https:', 'http:'), valido.enlace + '&destino=hostil',
    `${origen}/cuenta/recuperacion?token=no-admitido#token=${crearToken('recuperacion').token}`]) {
    await assert.rejects(p.enviar({ ...valido, enlace }), { codigo: 'CONFIGURACION_CORREO_INVALIDA' });
  }
  assert.equal(secretos, 0);
});
