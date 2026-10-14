const express = require(
  "express"
);

const cors = require(
  "cors"
);

const path = require(
  "path"
);

const authRoutes = require(
  "./routes/authRoutes"
);

const autenticacion = require("./middlewares/autenticacion");

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


const app = express();


// =========================================================
// MIDDLEWARES
// =========================================================

app.use(
  cors()
);

// CORS responde a OPTIONS antes de exigir autenticación.
// Login es público; /auth/me verifica la sesión dentro de authRoutes.
app.use("/api/auth", authRoutes);

// Todas las rutas API restantes (presentes y futuras) requieren JWT.
// Se verifica antes de parsear cuerpos o ejecutar procesos de negocio.
app.use("/api", autenticacion);

app.use(
  express.json()
);

app.use(
  "/api/calendario",
  calendarioRoutes
);


// =========================================================
// ARCHIVOS ESTÁTICOS - IMÁGENES SUBIDAS
// =========================================================

// Las imágenes de publicaciones son públicas para <img> y canales.
// Su subida y administración se realiza por la API autenticada.

app.use(
  "/uploads",
  express.static(
    path.join(
      process.cwd(),
      "uploads"
    )
  )
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


module.exports =
  app;
