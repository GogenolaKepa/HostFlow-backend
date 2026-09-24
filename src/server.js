require("dotenv").config();

const {
  poolPromise,
} = require(
  "./config/database"
);

const app = require(
  "./app"
);

const PORT =
  process.env.PORT ||
  4000;

const HOST =
  process.env.HOST ||
  "0.0.0.0";

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `Servidor HostFlow ejecutándose en el puerto ${PORT}`
    );

    console.log(
      `Acceso local: http://localhost:${PORT}`
    );
  }
);