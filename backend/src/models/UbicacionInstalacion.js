const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const UbicacionInstalacion = sequelize.define(
    "UbicacionInstalacion",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      house_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      nombre: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: {
          len: [2, 120],
          notEmpty: true
        }
      },
      descripcion: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: {
          len: [0, 255]
        }
      },
      area: {
        type: DataTypes.STRING(80),
        allowNull: true,
        validate: {
          len: [0, 80]
        }
      },
      piso: {
        type: DataTypes.STRING(40),
        allowNull: true,
        validate: {
          len: [0, 40]
        }
      },
      // Campos adicionales para gestión
      coordenadas: {
        type: DataTypes.JSON,
        allowNull: true,
        validate: {
          // Validar formato de coordenadas GPS
          isValidCoordinates(value) {
            if (value) {
              if (typeof value !== 'object' || !value.lat || !value.lng) {
                throw new Error('Coordenadas deben tener lat y lng');
              }
              if (value.lat < -90 || value.lat > 90 || value.lng < -180 || value.lng > 180) {
                throw new Error('Coordenadas fuera de rango válido');
              }
            }
          }
        }
      },
      tipo_ubicacion: {
        type: DataTypes.ENUM("INTERIOR", "EXTERIOR", "SOTANO", "AZOTEA", "JARDIN", "GARAJE"),
        allowNull: true
      },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
      dispositivos_conectados: { type: DataTypes.INTEGER, defaultValue: 0 }
    },
    {
      tableName: "ubicacion_instalacion",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["house_id"] },
        { fields: ["tipo_ubicacion"] },
        { fields: ["activo"] },
        { fields: ["house_id", "activo"] }
      ],
      // Hooks para validaciones
      hooks: {
        beforeCreate: (ubicacion) => {
          // Generar descripción por defecto si no se proporciona
          if (!ubicacion.descripcion && ubicacion.area && ubicacion.piso) {
            ubicacion.descripcion = `${ubicacion.area} - ${ubicacion.piso}`;
          }
        }
      }
    }
  );

  return UbicacionInstalacion;
};
