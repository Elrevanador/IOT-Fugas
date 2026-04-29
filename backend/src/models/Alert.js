const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Alert = sequelize.define(
    "Alert",
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
          isAfter: "2020-01-01"
        }
      },
      severity: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "ALERTA",
        validate: {
          isIn: [["ALERTA", "FUGA", "ERROR", "LOW", "MEDIUM", "HIGH", "CRITICAL"]]
        }
      },
      message: {
        type: DataTypes.STRING(500),
        allowNull: false,
        validate: {
          len: [10, 500]
        }
      },
      acknowledged: { type: DataTypes.BOOLEAN, defaultValue: false },
      ack_at: { type: DataTypes.DATE, allowNull: true },
      incidente_id: { type: DataTypes.BIGINT, allowNull: true },
      ack_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1
        }
      },
      ack_note: {
        type: DataTypes.STRING(500),
        allowNull: true,
        validate: {
          len: [0, 500]
        }
      },
      tipo: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "FUGA",
        validate: {
          isIn: [[
            "ALERTA",
            "FUGA",
            "ERROR",
            "BAJA_PRESION",
            "ALTO_CONSUMO",
            "DISPOSITIVO_OFFLINE",
            "ERROR_SENSOR",
            "MANTENIMIENTO"
          ]]
        }
      },
      // Campos adicionales para gestión de alertas
      auto_resolved: { type: DataTypes.BOOLEAN, defaultValue: false },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
      escalation_level: { type: DataTypes.INTEGER, defaultValue: 0 },
      notification_sent: { type: DataTypes.BOOLEAN, defaultValue: false }
    },
    {
      tableName: "alerts",
      timestamps: false,
      indexes: [
        { fields: ["device_id"] },
        { fields: ["ts"] },
        { fields: ["acknowledged"] },
        { fields: ["severity"] },
        { fields: ["device_id", "ts"] },
        { fields: ["tipo"] },
        { fields: ["incidente_id"] },
        { fields: ["ack_by_user_id"] },
        { fields: ["auto_resolved"] },
        { fields: ["notification_sent"] },
        // Índice para alertas activas no reconocidas
        { fields: ["device_id", "acknowledged", "severity"] }
      ],
      // Hooks para lógica de negocio
      hooks: {
        beforeCreate: (alert) => {
          // Validar que acknowledged sea false inicialmente
          alert.acknowledged = false;

          // Asignar severidad basada en tipo si no está especificada
          if (!alert.severity) {
            const severityMap = {
              'FUGA': 'FUGA',
              'BAJA_PRESION': 'ALERTA',
              'ALTO_CONSUMO': 'ALERTA',
              'DISPOSITIVO_OFFLINE': 'ERROR',
              'ERROR_SENSOR': 'ERROR',
              'MANTENIMIENTO': 'ALERTA',
              'ALERTA': 'ALERTA',
              'ERROR': 'ERROR'
            };
            alert.severity = severityMap[alert.tipo] || 'ALERTA';
          }
        },
        beforeUpdate: (alert) => {
          // Si se marca como acknowledged, registrar timestamp
          if (alert.acknowledged && !alert.ack_at) {
            alert.ack_at = new Date();
          }
        }
      }
    }
  );

  return Alert;
};
