const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Reading = sequelize.define(
    "Reading",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      device_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      ts: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isDate: true,
          isAfter: "2020-01-01" // No permitir fechas muy antiguas
        }
      },
      flow_lmin: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: 0,
          max: 10000 // Máximo razonable para caudal
        }
      },
      pressure_kpa: {
        type: DataTypes.FLOAT,
        allowNull: true, // Cambiar a true si no siempre está disponible
        validate: {
          min: 0,
          max: 10000 // Máximo razonable para presión
        }
      },
      risk: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 100
        }
      },
      state: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "NORMAL",
        validate: {
          isIn: [["NORMAL", "ALERTA", "FUGA", "ERROR", "SIN_DATOS"]]
        }
      },
      sensor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1
        }
      },
      // Campos adicionales para calidad de datos
      quality_score: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 0,
          max: 100
        }
      },
      is_anomaly: { type: DataTypes.BOOLEAN, defaultValue: false },
      processed_at: { type: DataTypes.DATE, allowNull: true }
    },
    {
      tableName: "readings",
      timestamps: false, // Usar ts como timestamp principal
      indexes: [
        { fields: ["device_id"] },
        { fields: ["ts"] },
        { fields: ["state"] },
        { fields: ["device_id", "ts"] },
        { fields: ["sensor_id"] },
        { fields: ["is_anomaly"] },
        { fields: ["processed_at"] },
        // Índice compuesto para queries de análisis
        { fields: ["device_id", "ts", "state"] }
      ],
      // Hooks para validación y procesamiento
      hooks: {
        beforeCreate: (reading) => {
          // Validar que el timestamp no sea futuro extremo
          if (reading.ts > new Date(Date.now() + 300000)) {
            throw new Error('Timestamp demasiado en el futuro');
          }

          // Marcar como procesado inicialmente como null
          reading.processed_at = null;
        },
        afterCreate: (reading) => {
          // Aquí se podría agregar lógica de procesamiento asíncrono
          // Por ahora solo marcamos como procesado
          reading.update({ processed_at: new Date() });
        }
      }
    }
  );

  return Reading;
};
