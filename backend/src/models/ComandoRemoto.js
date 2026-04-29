const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ComandoRemoto = sequelize.define(
    "ComandoRemoto",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      device_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1
        }
      },
      tipo: {
        type: DataTypes.ENUM(
          "CERRAR_VALVULA",
          "ABRIR_VALVULA",
          "ACTUALIZAR_CONFIG",
          "REINICIAR",
          "SOLICITAR_ESTADO",
          "OTRO"
        ),
        allowNull: false
      },
      payload: {
        type: DataTypes.JSON,
        allowNull: true,
        validate: {
          // Validar que el payload no sea demasiado grande
          isValidPayload(value) {
            if (value && JSON.stringify(value).length > 10000) {
              throw new Error('Payload demasiado grande');
            }
          }
        }
      },
      estado: {
        type: DataTypes.ENUM("PENDIENTE", "ENVIADO", "EJECUTADO", "ERROR", "EXPIRADO"),
        allowNull: false,
        defaultValue: "PENDIENTE"
      },
      prioridad: {
        type: DataTypes.ENUM("BAJA", "NORMAL", "ALTA", "CRITICA"),
        allowNull: false,
        defaultValue: "NORMAL"
      },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isAfter: new Date() // No permitir expiración en el pasado
        }
      },
      executed_at: { type: DataTypes.DATE, allowNull: true },
      error_message: { type: DataTypes.STRING(500), allowNull: true },
      retry_count: { type: DataTypes.INTEGER, defaultValue: 0 },
      max_retries: { type: DataTypes.INTEGER, defaultValue: 3 }
    },
    {
      tableName: "comandos_remotos",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
      indexes: [
        { fields: ["device_id", "estado"] },
        { fields: ["created_at"] },
        { fields: ["tipo"] },
        { fields: ["prioridad"] },
        { fields: ["expires_at"] },
        { fields: ["user_id"] },
        // Índice para comandos pendientes por dispositivo
        { fields: ["device_id", "estado", "prioridad"] }
      ],
      // Hooks de seguridad y validación
      hooks: {
        beforeCreate: (comando) => {
          // Validar comandos críticos requieren usuario
          const criticalCommands = ["CERRAR_VALVULA"];
          const isSystemCommand = comando.payload?.motivo === "auto_cierre_por_fuga";
          if (criticalCommands.includes(comando.tipo) && !comando.user_id && !isSystemCommand) {
            throw new Error(`Comando ${comando.tipo} requiere usuario autenticado`);
          }

          // Establecer expiración por defecto (1 hora)
          if (!comando.expires_at) {
            comando.expires_at = new Date(Date.now() + 3600000);
          }

          // Validar payload según tipo de comando
          if (comando.payload) {
            validateCommandPayload(comando.tipo, comando.payload);
          }
        },
        beforeUpdate: (comando) => {
          // No permitir cambios en comandos ya ejecutados
          if (comando.previous('estado') === 'EJECUTADO' && comando.estado !== 'EJECUTADO') {
            throw new Error('No se puede modificar un comando ya ejecutado');
          }
        }
      }
    }
  );

  // Función auxiliar para validar payloads
  function validateCommandPayload(tipo, payload) {
    const validations = {
      'ACTUALIZAR_CONFIG': (p) => {
        if (!p.config || typeof p.config !== 'object') {
          throw new Error('Configuración inválida');
        }
      },
      'CERRAR_VALVULA': (p) => {
        if (p.force !== undefined && typeof p.force !== 'boolean') {
          throw new Error('Parámetro force debe ser boolean');
        }
      }
    };

    if (validations[tipo]) {
      validations[tipo](payload);
    }
  }

  return ComandoRemoto;
};
