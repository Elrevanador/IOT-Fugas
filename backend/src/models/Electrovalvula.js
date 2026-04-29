const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Electrovalvula = sequelize.define(
    "Electrovalvula",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      device_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        validate: {
          min: 1
        }
      },
      estado: {
        type: DataTypes.ENUM("ABIERTA", "CERRADA", "DESCONOCIDO"),
        allowNull: false,
        defaultValue: "DESCONOCIDO"
      },
      modo: {
        type: DataTypes.ENUM("AUTO", "MANUAL", "BLOQUEADA"),
        allowNull: false,
        defaultValue: "AUTO"
      },
      ultima_accion_at: { type: DataTypes.DATE, allowNull: true },
      // Campos adicionales para control y monitoreo
      ultima_verificacion_at: { type: DataTypes.DATE, allowNull: true },
      ciclos_operacion: { type: DataTypes.INTEGER, defaultValue: 0 },
      tiempo_abierto_horas: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
      alertas_activas: { type: DataTypes.INTEGER, defaultValue: 0 },
      mantenimiento_requerido: { type: DataTypes.BOOLEAN, defaultValue: false },
      ultima_mantenimiento_at: { type: DataTypes.DATE, allowNull: true },
      // Campos de seguridad
      bloqueo_emergencia: { type: DataTypes.BOOLEAN, defaultValue: false },
      razon_bloqueo: { type: DataTypes.STRING(200), allowNull: true }
    },
    {
      tableName: "electrovalvulas",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { unique: true, fields: ["device_id"] },
        { fields: ["estado"] },
        { fields: ["modo"] },
        { fields: ["mantenimiento_requerido"] },
        { fields: ["bloqueo_emergencia"] },
        { fields: ["alertas_activas"] },
        { fields: ["ultima_verificacion_at"] }
      ],
      // Hooks para lógica de negocio
      hooks: {
        beforeUpdate: (valvula) => {
          // Si se cambia el estado, actualizar ultima_accion_at
          if (valvula.changed('estado') && valvula.estado !== 'DESCONOCIDO') {
            valvula.ultima_accion_at = new Date();
            valvula.ultima_verificacion_at = new Date();

            // Incrementar contador de ciclos si se abre/cierra
            if (valvula.previous('estado') !== valvula.estado) {
              valvula.ciclos_operacion = (valvula.ciclos_operacion || 0) + 1;
            }
          }

          // Validar bloqueo de emergencia
          if (valvula.bloqueo_emergencia && valvula.modo !== 'BLOQUEADA') {
            throw new Error('No se puede cambiar el modo mientras hay bloqueo de emergencia');
          }
        },
        beforeCreate: (valvula) => {
          // Inicializar campos de monitoreo
          valvula.ultima_verificacion_at = new Date();
        }
      }
    }
  );

  return Electrovalvula;
};
