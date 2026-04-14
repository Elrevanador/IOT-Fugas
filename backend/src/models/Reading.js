const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Reading = sequelize.define(
    "Reading",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      device_id: { type: DataTypes.INTEGER, allowNull: false },
      ts: { type: DataTypes.DATE, allowNull: false },
      flow_lmin: { type: DataTypes.FLOAT, allowNull: false },
      pressure_kpa: { type: DataTypes.FLOAT, allowNull: false },
      risk: { type: DataTypes.INTEGER, allowNull: false },
      state: { type: DataTypes.STRING(16), allowNull: false }
    },
    {
      tableName: "readings",
      timestamps: false
    }
  );

  return Reading;
};
