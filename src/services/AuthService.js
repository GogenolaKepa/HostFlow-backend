const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { usuarios } = require("../data/mockData");

class AuthService {
  login(email, password) {
    const usuario = usuarios.find((u) => u.email === email);

    if (!usuario) {
      throw new Error("El usuario no existe.");
    }

    if (usuario.estado !== "Activo") {
      throw new Error("El usuario no se encuentra activo.");
    }

    const passwordValida = bcrypt.compareSync(password, usuario.passwordHash);

    if (!passwordValida) {
      throw new Error("La contraseña es incorrecta.");
    }

    const token = jwt.sign(
      {
        idUsuario: usuario.idUsuario,
        email: usuario.email,
        rol: usuario.rol.nombre
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return {
      token,
      usuario: {
        idUsuario: usuario.idUsuario,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol.nombre
      }
    };
  }
}

module.exports = new AuthService();