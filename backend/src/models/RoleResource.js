const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const RoleResource = sequelize.define(
    "RoleResource",
    {
      resource_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
      role_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
      can_view: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      can_create: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      can_update: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      can_delete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      assigned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    {
      tableName: "role_resources",
      timestamps: false,
      indexes: [
        { fields: ["role_id"] },
        { fields: ["resource_id"] }
      ]
    }
  );

  return RoleResource;
};
