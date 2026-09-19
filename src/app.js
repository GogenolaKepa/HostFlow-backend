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
  "/api/auth",
  authRoutes
);

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