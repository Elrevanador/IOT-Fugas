const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Device = sequelize.define(
    "Device",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      house_id: { type: DataTypes.INTEGER, allowNull: true },
      name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      location: { type: DataTypes.STRING(180), allowNull: true },
      device_type: { type: DataTypes.STRING(64), allowNull: true },
      firmware_version: { type: DataTypes.STRING(64), allowNull: true },
      hardware_uid: { type: DataTypes.STRING(120), allowNull: true, unique: true },
      last_seen_at: { type: DataTypes.DATE, allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: true },
      api_key_hash: { type: DataTypes.STRING(255), allowNull: true },
      api_key_hint: { type: DataTypes.STRING(32), allowNull: true }
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
        { fields: ["last_seen_at"] }
      ]
    }
  );

  return Device;
};
