const AuthService = require("../services/AuthService");
const { ErrorSeguridad, validarCampos, perfilSeguro, responderError } = require("../security/seguridadUsuarios");

function idDe(req) {
  if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
    throw new ErrorSeguridad(400, "VALIDACION", "Identificador de cuenta no válido.");
  }
  return Number(req.params.id);
}

async function ejecutar(res, operacion, status = 200) {
  res.set("Cache-Control", "no-store");
  try { AuthService.exigirSQL(); return res.status(status).json(await operacion()); }
  catch (error) { return responderError(res, error); }
}

class UsuarioController {
  listar(req, res) {
    return ejecutar(res, async () => {
      validarCampos(req.query, ["busqueda", "estado", "pagina", "limite"], []);
      const { busqueda = "", estado = "", pagina = "1", limite = "25" } = req.query;
      if (typeof busqueda !== "string" || busqueda.length > 120 || !["", "Activo", "Inactivo"].includes(estado) ||
          !/^[1-9]\d{0,5}$/.test(pagina) || !/^[1-9]\d?$/.test(limite) || Number(limite) > 50) {
        throw new ErrorSeguridad(400, "VALIDACION", "Los filtros no son válidos.");
      }
      const resultado = await AuthService.repository.listar({ busqueda: busqueda.trim(), estado, pagina: Number(pagina), limite: Number(limite) });
      return { ...resultado, usuarios: resultado.usuarios.map((u) => perfilSeguro(u)) };
    });
  }
  obtener(req, res) {
    return ejecutar(res, async () => {
      const usuario = await AuthService.repository.obtener(idDe(req));
      if (!usuario) throw new ErrorSeguridad(404, "USUARIO_NO_ENCONTRADO", "La cuenta no existe.");
      return { usuario: perfilSeguro(usuario) };
    });
  }
  roles(_req, res) { return ejecutar(res, async () => ({ roles: await AuthService.repository.roles.listarAsignables() })); }
  crear(req, res) { return ejecutar(res, async () => ({ usuario: await AuthService.cuentas.crear(req.usuario, req.body) }), 201); }
  editar(req, res) { return ejecutar(res, () => AuthService.cuentas.editar(req.usuario, idDe(req), req.body)); }
  estado(req, res) { return ejecutar(res, () => AuthService.cuentas.cambiarEstado(req.usuario, idDe(req), req.body)); }
  restablecer(req, res) { return ejecutar(res, async () => ({ usuario: await AuthService.cuentas.restablecer(req.usuario, idDe(req), req.body) })); }
}

module.exports = new UsuarioController();
