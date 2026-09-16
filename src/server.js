require("dotenv").config();
const { poolPromise } = require("./config/database");
const app = require("./app");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Servidor HostFlow ejecutándose en http://localhost:${PORT}`);
});