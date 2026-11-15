const express = require(
  "express"
);

const corsSeguro = require("./middlewares/corsSeguro");
const { respuestasSeguras, manejarErrorSeguro } = require("./security/erroresSeguros");

const {crearImagenesPublicas}=require('./middlewares/imagenesPublicas');

const authRoutes = require(
  "./routes/authRoutes"
);

const autenticacion = require("./middlewares/autenticacion");
const cambioPasswordObligatorio = require("./middlewares/cambioPasswordObligatorio");
const usuarioRoutes = require("./routes/usuarioRoutes");
const rolRoutes = require("./routes/rolRoutes");
const configuracionRoutes = require("./routes/configuracionRoutes");
const notificacionRoutes = require("./routes/notificacionRoutes");
const { autorizarAccion, autorizarCampos } = require("./middlewares/autorizacion");

const dashboardRoutes = require(
  "./routes/dashboardRoutes"
);

const reservaRoutes = require(
  "./routes/reservaRoutes"
);

const propiedadRoutes = require(
  "./routes/propiedadRoutes"
);

const huespedRoutes = require(
  "./routes/huespedRoutes"
);

const alertaRoutes = require(
  "./routes/alertaRoutes"
);

const limpiezaRoutes = require(
  "./routes/limpiezaRoutes"
);

const recomendacionRoutes = require(
  "./routes/recomendacionRoutes"
);

const bookingInboundRoutes = require(
  "./routes/bookingInboundRoutes"
);

const airbnbInboundRoutes = require(
  "./routes/airbnbInboundRoutes"
);

const airbnbPropertyInboundRoutes = require(
  "./routes/airbnbPropertyInboundRoutes"
);

const bookingPropertyInboundRoutes = require(
  "./routes/bookingPropertyInboundRoutes"
);

const airbnbPropertyImageInboundRoutes = require(
  "./routes/airbnbPropertyImageInboundRoutes"
);

const bookingPropertyImageInboundRoutes = require(
  "./routes/bookingPropertyImageInboundRoutes"
);

const calendarioRoutes = require(
  "./routes/calendarioRoutes"
);


function crearApp({ montajeComercial = null, proxiesComerciales = [], montajeClientes = null, politicaPiloto = false, alcancePublico = null, controlPublico = null } = {}) {
if(typeof politicaPiloto!=='boolean'||politicaPiloto&&montajeClientes!==null)throw TypeError('Ventana piloto incompatible con montaje de clientes.');
if(alcancePublico!==null&&(!['recuperacion','recuperacion-habitual'].includes(alcancePublico)||politicaPiloto!==(alcancePublico==='recuperacion')||typeof montajeComercial!=='function'||montajeClientes!==null||proxiesComerciales.length!==0))throw TypeError('Ventana pública incompatible.');
const app = express();
if(!Array.isArray(proxiesComerciales)||proxiesComerciales.length>4||proxiesComerciales.some(ip=>!require('node:net').isIP(ip)))throw TypeError('Proxies comerciales no acreditados.');
if(proxiesComerciales.length){
  if(montajeComercial===null)throw TypeError('Proxy comercial sin montaje.');
  const confiables=new Set(proxiesComerciales);
  // Solo IPs concretas del borde acreditado; no true, comodines ni headers libres.
  app.set('trust proxy',ip=>confiables.has(ip)||ip.startsWith('::ffff:')&&confiables.has(ip.slice(7)));
}


// =========================================================
// MIDDLEWARES
// =========================================================

app.use(respuestasSeguras);
if(alcancePublico==='recuperacion-habitual')app.use(require('./security/comercial/ProteccionRecuperacionHabitual').crearProteccionRecuperacionHabitual({control:controlPublico,activo:()=>app.locals.comercial?.consultar?.()?.disponible===true}));
if(alcancePublico==='recuperacion'){
 const p=require('./security/comercial/ProteccionPublicaPiloto');
 app.use(p.crearProteccionPublicaPiloto({activo:()=>app.locals.comercial?.consultar?.()?.disponible===true}));
 app.post('/api/auth/login',express.json({limit:'8kb'}),p.loginDePrueba);
 app.use(['/api/auth/me','/api/auth/logout'],(req,res,next)=>req.method==='OPTIONS'?next():autenticacion(req,res,()=>p.sesionDePrueba(req,res,next)));
}
if(montajeClientes!==null){
  if(typeof montajeClientes!=='function')throw TypeError('Clientes sin montaje acreditado.');
  app.use('/api/clientes',montajeClientes);
}
app.use(corsSeguro());

// Solo el ensamblado administrativo acreditado puede proporcionar este router.
// No hay rutas comerciales ni pools por el mero hecho de importar la aplicación.
if (montajeComercial !== null) {
  if (typeof montajeComercial !== 'function') throw TypeError('Montaje comercial inválido.');
  app.use('/api/cuentas-comerciales', montajeComercial);
}

// CORS responde a OPTIONS antes de exigir autenticación.
// Login es público; /auth/me verifica la sesión dentro de authRoutes.
app.use("/api/auth", authRoutes);

// Todas las rutas API restantes (presentes y futuras) requieren JWT.
// Se verifica antes de parsear cuerpos o ejecutar procesos de negocio.
app.use("/api", autenticacion);
app.use("/api", cambioPasswordObligatorio);
app.use("/api", autorizarAccion);

app.use(
  express.json()
);

app.use("/api", autorizarCampos);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/roles", rolRoutes);
app.use("/api/configuracion", configuracionRoutes);
app.use('/api/monedas',require('./routes/monedasRoutes'));
app.use("/api/notificaciones", notificacionRoutes);

app.use(
  "/api/calendario",
  calendarioRoutes
);


// =========================================================
// ARCHIVOS ESTÁTICOS - IMÁGENES SUBIDAS
// =========================================================

// El modo operativo existente conserva sus publicaciones públicas. Al montar
// clientes nuevos, ningún archivo de la empresa operativa queda disponible
// anónimamente ni mediante la cookie de clientes. Se exige el JWT operativo.
// Antes de habilitar clientes, adaptar <img>/canales a la entrega autenticada;
// no debilitar esta barrera para conservar URLs históricas.
// Durante el piloto no publicar imágenes operativas, ni siquiera sin JWT.
// Quitar Authorization no puede eludir la cuarentena de archivos.
if(politicaPiloto)app.use('/uploads',(_req,res)=>res.status(403).set('Cache-Control','no-store').json({codigo:'ARCHIVOS_NO_DISPONIBLES_EN_PILOTO'}));
else if(montajeClientes!==null)app.use('/uploads',autenticacion);

app.use(
  "/uploads",
  crearImagenesPublicas()
);


// =========================================================
// RUTA BASE
// =========================================================

app.get(
  "/",
  (
    req,
    res
  ) => {
    res.json({
      mensaje:
        "API HostFlow funcionando correctamente.",
    });
  }
);


// =========================================================
// RUTAS PRINCIPALES
// =========================================================

app.use(
  "/api/dashboard",
  dashboardRoutes
);

app.use(
  "/api/reservas",
  reservaRoutes
);

app.use(
  "/api/propiedades",
  propiedadRoutes
);

app.use(
  "/api/huespedes",
  huespedRoutes
);

app.use(
  "/api/alertas",
  alertaRoutes
);

app.use(
  "/api/limpiezas",
  limpiezaRoutes
);

app.use(
  "/api/recomendaciones",
  recomendacionRoutes
);


// =========================================================
// INTEGRACIÓN BOOKING - RESERVAS
// =========================================================

app.use(
  "/api/integraciones/booking",
  bookingInboundRoutes
);


// =========================================================
// INTEGRACIÓN BOOKING - PROPIEDADES
// =========================================================

app.use(
  "/api/integraciones/booking",
  bookingPropertyInboundRoutes
);


// =========================================================
// INTEGRACIÓN BOOKING - IMÁGENES DE PROPIEDADES
// =========================================================

app.use(
  "/api/integraciones/booking",
  bookingPropertyImageInboundRoutes
);


// =========================================================
// INTEGRACIÓN AIRBNB - RESERVAS
// =========================================================

app.use(
  "/api/integraciones/airbnb",
  airbnbInboundRoutes
);


// =========================================================
// INTEGRACIÓN AIRBNB - PROPIEDADES
// =========================================================

app.use(
  "/api/integraciones/airbnb",
  airbnbPropertyInboundRoutes
);


// =========================================================
// INTEGRACIÓN AIRBNB - IMÁGENES DE PROPIEDADES
// =========================================================

app.use(
  "/api/integraciones/airbnb",
  airbnbPropertyImageInboundRoutes
);


// No devolver cuerpos malformados que puedan contener contraseñas.
app.use((error, _req, res, next) => {
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return res.status(error.status).json({ mensaje: "El cuerpo de la solicitud no es válido." });
  }
  return manejarErrorSeguro(error, _req, res, next);
});

return app;
}

module.exports = crearApp();
module.exports.crearApp = crearApp;
