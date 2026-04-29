const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const House = sequelize.define(
    "House",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: {
          len: [2, 120],
          notEmpty: true
        }
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        validate: {
          len: [3, 64],
          is: /^[A-Z0-9\-_]+$/ // Solo mayúsculas, números, guiones y underscores
        }
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: {
          len: [0, 255]
        }
      },
      owner_name: {
        type: DataTypes.STRING(120),
        allowNull: true,
        validate: {
          len: [0, 120]
        }
      },
      contact_phone: {
        type: DataTypes.STRING(40),
        allowNull: true,
        validate: {
          len: [0, 40],
          is: /^[\+]?[0-9\s\-\(\)]*$/ // Formato de teléfono básico
        }
      },
      status: {
        type: DataTypes.ENUM("ACTIVA", "INACTIVA", "MANTENIMIENTO", "SUSPENDIDA"),
        allowNull: false,
        defaultValue: "ACTIVA"
      },
      // Campos adicionales para gestión
      total_devices: { type: DataTypes.INTEGER, defaultValue: 0 },
      active_devices: { type: DataTypes.INTEGER, defaultValue: 0 },
      last_reading_at: { type: DataTypes.DATE, allowNull: true },
      alert_count: { type: DataTypes.INTEGER, defaultValue: 0 }
    },
    {
      tableName: "houses",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["status"] },
        { fields: ["code"], unique: true },
        { fields: ["owner_name"] },
        { fields: ["last_reading_at"] },
        { fields: ["alert_count"] }
      ],
      // Hooks para mantener contadores
      hooks: {
        beforeCreate: (house) => {
          // Generar código si no se proporciona
          if (!house.code) {
            house.code = `H${Date.now().toString(36).toUpperCase()}`;
          }
        }
      }
    }
  );

  return House;
};
