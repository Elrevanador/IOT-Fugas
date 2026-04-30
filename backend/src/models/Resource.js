const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Resource = sequelize.define(
    "Resource",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      nombre: { type: DataTypes.STRING(120), allowNull: false },
      backend_path: { type: DataTypes.STRING(160), allowNull: true },
      frontend_path: { type: DataTypes.STRING(160), allowNull: true },
      icono: { type: DataTypes.STRING(80), allowNull: true },
      orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      parent_id: { type: DataTypes.INTEGER, allowNull: true },
      estado: {
        type: DataTypes.ENUM("ACTIVO", "INACTIVO"),
        allowNull: false,
        defaultValue: "ACTIVO"
      }
    },
    {
      tableName: "resources",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { unique: true, fields: ["code"] },
        { fields: ["parent_id"] },
        { fields: ["estado"] },
        { fields: ["orden"] }
      ]
    }
  );

  return Resource;
};
