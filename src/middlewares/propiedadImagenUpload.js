const multer = require("multer");
const path = require("path");
const fs = require("fs");

// =========================================================
// CARPETA BASE
// =========================================================

const carpetaBase = path.join(
  process.cwd(),
  "uploads",
  "propiedades"
);

if (!fs.existsSync(carpetaBase)) {
  fs.mkdirSync(carpetaBase, {
    recursive: true,
  });
}

// =========================================================
// STORAGE
// =========================================================

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const idPropiedad = Number(
      req.params.id
    );

    if (
      !Number.isInteger(idPropiedad) ||
      idPropiedad <= 0
    ) {
      return callback(
        new Error(
          "La propiedad indicada no es válida."
        )
      );
    }

    const carpetaPropiedad =
      path.join(
        carpetaBase,
        String(idPropiedad)
      );

    if (
      !fs.existsSync(
        carpetaPropiedad
      )
    ) {
      fs.mkdirSync(
        carpetaPropiedad,
        {
          recursive: true,
        }
      );
    }

    callback(
      null,
      carpetaPropiedad
    );
  },

  filename: (req, file, callback) => {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    const nombreArchivo =
      `prop-${req.params.id}-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${extension}`;

    callback(
      null,
      nombreArchivo
    );
  },
});

// =========================================================
// TIPOS PERMITIDOS
// =========================================================

const fileFilter = (
  req,
  file,
  callback
) => {
  const tiposPermitidos = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (
    !tiposPermitidos.includes(
      file.mimetype
    )
  ) {
    return callback(
      new Error(
        "Solo se permiten imágenes JPG, PNG o WEBP."
      )
    );
  }

  callback(
    null,
    true
  );
};

// =========================================================
// MULTER
// =========================================================

const propiedadImagenUpload =
  multer({
    storage,

    fileFilter,

    limits: {
      fileSize:
        8 * 1024 * 1024,

      files: 20,
    },
  });

module.exports =
  propiedadImagenUpload;