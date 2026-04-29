const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const IncidenteFuga = sequelize.define(
    "IncidenteFuga",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      device_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      detected_at: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isDate: true,
          isAfter: "2020-01-01"
        }
      },
      ended_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: true,
          isAfter(value) {
            if (value && this.detected_at && value <= this.detected_at) {
              throw new Error('ended_at debe ser posterior a detected_at');
            }
          }
        }
      },
      flow_promedio_lmin: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          min: 0,
          max: 10000
        }
      },
      duracion_minutos: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 525600 // 1 año en minutos
        }
      },
      volumen_estimado_l: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          min: 0,
          max: 1000000
        }
      },
      estado: {
        type: DataTypes.ENUM("ABIERTO", "CONFIRMADO", "FALSO_POSITIVO", "CERRADO"),
        allowNull: false,
        defaultValue: "ABIERTO"
      },
      umbral_flow_lmin: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          min: 0.1,
          max: 1000
        }
      },
      ventana_minutos: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 1440 // 24 horas
        }
      },
      resuelto_por_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1
        }
      },
      resuelto_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: true
        }
      },
      observaciones: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: [0, 2000]
        }
      },
      // Campos adicionales para análisis y seguimiento
      severidad_calculada: {
        type: DataTypes.ENUM("BAJA", "MEDIA", "ALTA", "CRITICA"),
        allowNull: true
      },
      costo_estimado: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: {
          min: 0
        }
      },
      alertas_generadas: { type: DataTypes.INTEGER, defaultValue: 0 },
      acciones_tomadas: { type: DataTypes.JSON, allowNull: true }
    },
    {
      tableName: "incidente_fuga",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["device_id", "detected_at"] },
        { fields: ["estado"] },
        { fields: ["detected_at"] },
        { fields: ["severidad_calculada"] },
        { fields: ["resuelto_por_user_id"] },
        { fields: ["device_id", "estado"] }
      ],
      // Hooks para lógica de negocio
      hooks: {
        beforeCreate: (incidente) => {
          // Calcular severidad basada en flujo promedio
          if (incidente.flow_promedio_lmin) {
            if (incidente.flow_promedio_lmin > 100) {
              incidente.severidad_calculada = 'CRITICA';
            } else if (incidente.flow_promedio_lmin > 50) {
              incidente.severidad_calculada = 'ALTA';
            } else if (incidente.flow_promedio_lmin > 20) {
              incidente.severidad_calculada = 'MEDIA';
            } else {
              incidente.severidad_calculada = 'BAJA';
            }
          }

          // Calcular duración si ended_at está presente
          if (incidente.ended_at && incidente.detected_at) {
            incidente.duracion_minutos = Math.round(
              (incidente.ended_at - incidente.detected_at) / (1000 * 60)
            );
          }
        },
        beforeUpdate: (incidente) => {
          // Recalcular duración si se actualiza ended_at
          if (incidente.changed('ended_at') && incidente.ended_at && incidente.detected_at) {
            incidente.duracion_minutos = Math.round(
              (incidente.ended_at - incidente.detected_at) / (1000 * 60)
            );
          }

          // Validar que solo incidentes cerrados tengan resuelto_at
          if (incidente.estado !== 'CERRADO' && incidente.resuelto_at) {
            throw new Error('Solo incidentes cerrados pueden tener fecha de resolución');
          }
        }
      }
    }
  );

  return IncidenteFuga;
};
