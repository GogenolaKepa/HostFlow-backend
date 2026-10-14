const cors = require("cors");
const { configuracionHttp, permiteOrigen } = require("../config/httpSeguridad");

function corsSeguro(config = configuracionHttp()) {
  const middleware = cors({ origin: true, credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type"], maxAge: 600 });
  return (req, res, next) => {
    if (!permiteOrigen(req.get("Origin"), config)) {
      return res.status(403).json({ codigo: "ORIGEN_NO_PERMITIDO", mensaje: "Origen no permitido." });
    }
    return middleware(req, res, next);
  };
}
module.exports = corsSeguro;
