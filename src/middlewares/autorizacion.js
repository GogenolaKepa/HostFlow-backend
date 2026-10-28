const { tienePermiso } = require("../config/permisos");
const { politicaPara } = require("../config/politicasRutas");
const { proyectarRespuesta } = require("../security/proyecciones");
const { identificadoresRutaValidos } = require("../security/identificadoresRuta");

function prohibido(res) {
  return res.status(403).json({ mensaje: "No tiene permiso para realizar esta acción." });
}

function autorizarAccion(req, res, next) {
  const politica = politicaPara(req.method, req.path);
  if (!politica || !tienePermiso(req.usuario, politica.permiso)) return prohibido(res);
  if (!identificadoresRutaValidos(politica, req.path)) {
    return res.status(400).json({ mensaje: "El identificador indicado no es válido." });
  }

  req.politicaAcceso = politica;
  const json = res.json;
  // Capturar el path antes de que Express lo vuelva relativo al router.
  const contexto = { path: req.path, usuario: req.usuario };
  res.json = (datos) => json.call(res, proyectarRespuesta(contexto, datos));
  return next();
}

function autorizarCampos(req, res, next) {
  const politica = req.politicaAcceso;
  if (!politica) return prohibido(res);

  const body = req.body || {};
  if (req.usuario.rol === "Operador") {
    let campos;
    if (politica.path === "/reservas" && req.method === "POST") {
      campos = ["idPropiedad", "idHuesped", "fechaIngreso", "horaIngreso", "fechaEgreso", "horaEgreso", "cantidadHuespedes", "montoEstimado", "acuerdoMonetario"];
    }
    if (politica.path === "/reservas/:id" && req.method === "PUT") {
      campos = ["fechaIngreso", "horaIngreso", "fechaEgreso", "horaEgreso", "versionEdicion"];
      if (tienePermiso(req.usuario, "reservas.importes")) campos.push("montoEstimado");
      if (tienePermiso(req.usuario, "reservas.estado")) campos.push("estado");
    }
    if (politica.path === "/reservas/:id/observaciones" && req.method === "POST") {
      campos = ["categoria", "observacion", "fijada"];
      if (!tienePermiso(req.usuario, "observaciones.fijar") &&
          Object.hasOwn(body, "fijada") && body.fijada !== false) return prohibido(res);
    }
    if (campos && Object.keys(body).some((campo) => !campos.includes(campo))) return prohibido(res);
  }

  // La identidad del autor no se acepta desde el cuerpo de la solicitud.
  if (politica.permiso === "observaciones.crear") {
    req.body = { ...body, autorNombre: req.usuario.nombre };
  }
  if (politica.permiso === "observaciones.modificar") {
    req.body = { ...body };
    delete req.body.autorNombre;
  }

  return next();
}

module.exports = { autorizarAccion, autorizarCampos };
