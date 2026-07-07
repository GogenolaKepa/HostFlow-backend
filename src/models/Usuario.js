class Usuario {
  constructor(idUsuario, nombre, email, passwordHash, estado, rol) {
    this.idUsuario = idUsuario;
    this.nombre = nombre;
    this.email = email;
    this.passwordHash = passwordHash;
    this.estado = estado;
    this.rol = rol;
  }
}

module.exports = Usuario;