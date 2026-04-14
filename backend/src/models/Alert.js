const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Alert = sequelize.define(
    "Alert",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      device_id: { type: DataTypes.INTEGER, allowNull: false },
      ts: { type: DataTypes.DATE, allowNull: false },
      severity: { type: DataTypes.STRING(16), allowNull: false },
      message: { type: DataTypes.STRING(255), allowNull: false },
      acknowledged: { type: DataTypes.BOOLEAN, defaultValue: false },
      ack_at: { type: DataTypes.DATE, allowNull: true }
    },
    {
      tableName: "alerts",
      timestamps: false
    }
  );

  return Alert;
};
