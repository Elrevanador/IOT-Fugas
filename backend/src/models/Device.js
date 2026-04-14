const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Device = sequelize.define(
    "Device",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      location: { type: DataTypes.STRING(180), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: true }
    },
    {
      tableName: "devices",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  return Device;
};
