const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const reservaRoutes = require("./routes/reservaRoutes");
const propiedadRoutes = require("./routes/propiedadRoutes");
const huespedRoutes = require("./routes/huespedRoutes");
const bookingInboundRoutes = require("./routes/bookingInboundRoutes");
const airbnbInboundRoutes = require("./routes/airbnbInboundRoutes");

const app = express();

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
  res.json({
    mensaje: "API HostFlow funcionando correctamente.",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reservas", reservaRoutes);
app.use("/api/propiedades", propiedadRoutes);
app.use("/api/huespedes", huespedRoutes);

app.use(
  "/api/integraciones/booking",
  bookingInboundRoutes
);
app.use(
  "/api/integraciones/airbnb",
  airbnbInboundRoutes
);

module.exports = app;