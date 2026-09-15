const bcrypt = require("bcryptjs");

const passwordHash = bcrypt.hashSync("123456", 10);

const roles = [
  {
    idRol: 1,
    nombre: "Administrador",
    descripcion: "Usuario con acceso completo al sistema."
  },
  {
    idRol: 2,
    nombre: "Operador",
    descripcion: "Usuario encargado de la gestión operativa diaria."
  },
  {
    idRol: 3,
    nombre: "Propietario",
    descripcion: "Usuario que consulta información de sus propiedades."
  }
];

const usuarios = [
  {
    idUsuario: 1,
    nombre: "Administrador HostFlow",
    email: "admin@hostflow.com",
    passwordHash,
    estado: "Activo",
    rol: roles[0]
  }
];

const propiedades = [
  {
    idPropiedad: 1,
    nombre: "Depto Centro A",
    direccion: "Córdoba 1234",
    ciudad: "Rosario",
    tipoInmueble: "Departamento",
    capacidadMaxima: 4,
    estado: "Activa",
    precioBase: 45000
  },
  {
    idPropiedad: 2,
    nombre: "Casa Funes",
    direccion: "San Sebastián",
    ciudad: "Funes",
    tipoInmueble: "Casa",
    capacidadMaxima: 6,
    estado: "Activa",
    precioBase: 80000
  },
  {
    idPropiedad: 3,
    nombre: "Loft Norte",
    direccion: "Av. Alberdi 900",
    ciudad: "Rosario",
    tipoInmueble: "Loft",
    capacidadMaxima: 2,
    estado: "En mantenimiento",
    precioBase: 38000
  }
];

const huespedes = [
  {
    idHuesped: 1,
    nombre: "Juan",
    apellido: "Pérez",
    email: "juan@email.com",
    telefono: "+54 9 341 1234567",
    estado: "Activo"
  },
  {
    idHuesped: 2,
    nombre: "María",
    apellido: "Gómez",
    email: "maria@email.com",
    telefono: "+54 9 341 7654321",
    estado: "Activo"
  },
  {
    idHuesped: 3,
    nombre: "Carlos",
    apellido: "López",
    email: "carlos@email.com",
    telefono: "+54 9 341 5555555",
    estado: "Activo"
  }
];

const reservas = [
  {
    idReserva: 1,
    propiedad: propiedades[0],
    huesped: huespedes[0],
    canal: "Airbnb",
    estado: "Confirmada",
    fechaIngreso: "2026-06-10",
    fechaEgreso: "2026-06-15",
    cantidadHuespedes: 2,
    montoEstimado: 225000,
    idExterno: "AIR-100001",
    estadoSincronizacion: "Sincronizada",
  },
  {
    idReserva: 2,
    propiedad: propiedades[1],
    huesped: huespedes[1],
    canal: "Booking",
    estado: "Confirmada",
    fechaIngreso: "2026-06-12",
    fechaEgreso: "2026-06-18",
    cantidadHuespedes: 4,
    montoEstimado: 480000,
    idExterno: "BKG-200001",
    estadoSincronizacion: "Sincronizada",
  },
  {
    idReserva: 3,
    propiedad: propiedades[0],
    huesped: huespedes[2],
    canal: "Manual",
    estado: "Pendiente",
    fechaIngreso: "2026-06-20",
    fechaEgreso: "2026-06-22",
    cantidadHuespedes: 2,
    montoEstimado: 90000,
    idExterno: null,
    estadoSincronizacion: "Solo HostFlow",
  },
];

const alertas = [
  {
    idAlerta: 1,
    tipo: "Check-in",
    mensaje: "Próximo check-in en Depto Centro A.",
    fecha: "2026-06-10",
    leida: false
  },
  {
    idAlerta: 2,
    tipo: "Limpieza",
    mensaje: "Limpieza programada posterior al check-out.",
    fecha: "2026-06-15",
    leida: false
  },
  {
    idAlerta: 3,
    tipo: "Mantenimiento",
    mensaje: "Loft Norte se encuentra en mantenimiento.",
    fecha: "2026-06-08",
    leida: true
  }
];

module.exports = {
  roles,
  usuarios,
  propiedades,
  huespedes,
  reservas,
  alertas
};