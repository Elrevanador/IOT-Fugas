const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Sensor = sequelize.define(
    "Sensor",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      device_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      ubicacion_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1
        }
      },
      tipo: {
        type: DataTypes.ENUM("caudal", "presion", "valvula", "temperatura", "otro"),
        allowNull: false,
        defaultValue: "caudal"
      },
      modelo: {
        type: DataTypes.STRING(80),
        allowNull: true,
        validate: {
          len: [0, 80]
        }
      },
      unidad: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          len: [0, 20]
        }
      },
      rango_min: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          min: -999999.99,
          max: 999999.99
        }
      },
      rango_max: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          min: -999999.99,
          max: 999999.99,
          isGreaterThanMin(value) {
            if (this.rango_min !== null && value !== null && value <= this.rango_min) {
              throw new Error('rango_max debe ser mayor que rango_min');
            }
          }
        }
      },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // Campos adicionales para calibración y mantenimiento
      ultima_calibracion: { type: DataTypes.DATE, allowNull: true },
      proxima_calibracion: { type: DataTypes.DATE, allowNull: true },
      factor_calibracion: { type: DataTypes.DECIMAL(10, 6), defaultValue: 1.000000 },
      offset_calibracion: { type: DataTypes.DECIMAL(10, 6), defaultValue: 0.000000 },
      alertas_activas: { type: DataTypes.INTEGER, defaultValue: 0 },
      precision: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
        validate: {
          min: 0.0001,
          max: 1.0000
        }
      }
    },
    {
      tableName: "sensores",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["device_id"] },
        { fields: ["tipo"] },
        { fields: ["activo"] },
        { fields: ["ubicacion_id"] },
        { fields: ["proxima_calibracion"] },
        { fields: ["alertas_activas"] }
      ],
      // Hooks para validaciones de negocio
      hooks: {
        beforeCreate: (sensor) => {
          // Establecer unidad por defecto según tipo
          if (!sensor.unidad) {
            const defaultUnits = {
              'caudal': 'L/min',
              'presion': 'bar',
              'valvula': 'estado',
              'temperatura': '°C',
              'otro': 'unidades'
            };
            sensor.unidad = defaultUnits[sensor.tipo] || 'unidades';
          }

          // Calcular próxima calibración (6 meses por defecto)
          if (!sensor.proxima_calibracion) {
            sensor.proxima_calibracion = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
          }
        },
        beforeUpdate: (sensor) => {
          // Validar que rango_max > rango_min si ambos están definidos
          if (sensor.rango_min !== null && sensor.rango_max !== null) {
            if (sensor.rango_max <= sensor.rango_min) {
              throw new Error('rango_max debe ser mayor que rango_min');
            }
          }
        }
      }
    }
  );

  return Sensor;
};
