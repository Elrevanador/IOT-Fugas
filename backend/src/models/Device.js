const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Device = sequelize.define(
    "Device",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      house_id: { type: DataTypes.INTEGER, allowNull: true },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true,
        validate: {
          len: [2, 120],
          is: /^[a-zA-Z0-9\-_\s]+$/
        }
      },
      location: {
        type: DataTypes.STRING(180),
        allowNull: true,
        validate: {
          len: [0, 180]
        }
      },
      device_type: {
        type: DataTypes.STRING(64),
        allowNull: true,
        validate: {
          len: [0, 64]
        }
      },
      firmware_version: {
        type: DataTypes.STRING(64),
        allowNull: true,
        validate: {
          len: [0, 64]
        }
      },
      hardware_uid: {
        type: DataTypes.STRING(120),
        allowNull: true,
        unique: true,
        validate: {
          len: [8, 120]
        }
      },
      last_seen_at: { type: DataTypes.DATE, allowNull: true },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        validate: {
          len: [0, 45]
        }
      },
      wifi_ssid: {
        type: DataTypes.STRING(120),
        allowNull: true,
        validate: {
          len: [0, 120]
        }
      },
      internet_connected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      last_connection_at: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: "INACTIVO",
        validate: {
          len: [0, 32]
        }
      },
      api_key_hash: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: {
          len: [32, 255] // SHA-256 mínimo
        }
      },
      api_key_hint: {
        type: DataTypes.STRING(32),
        allowNull: true,
        validate: {
          len: [4, 32]
        }
      },
      // Campos de seguridad adicionales
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      last_config_update: { type: DataTypes.DATE, allowNull: true },
      security_flags: { type: DataTypes.JSON, defaultValue: {} }
    },
    {
      tableName: "devices",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["house_id"] },
        { fields: ["status"] },
        { fields: ["device_type"] },
        { fields: ["last_seen_at"] },
        { fields: ["internet_connected"] },
        { fields: ["hardware_uid"], unique: true },
        { fields: ["name"], unique: true },
        { fields: ["is_active"] },
        { fields: ["house_id", "status"] }
      ],
      // Hooks de validación
      hooks: {
        beforeCreate: (device) => {
          if (!device.name || device.name.length < 2) {
            throw new Error('Nombre de dispositivo inválido');
          }
        },
        beforeUpdate: (device) => {
          // Actualizar last_config_update cuando cambian campos críticos
          const criticalFields = ['firmware_version', 'api_key_hash'];
          const changedFields = device.changed();

          if (changedFields && criticalFields.some(field => changedFields.includes(field))) {
            device.last_config_update = new Date();
          }
        }
      }
    }
  );

  return Device;
};
