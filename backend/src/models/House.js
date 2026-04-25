const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const House = sequelize.define(
    "House",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      address: { type: DataTypes.STRING(180), allowNull: true },
      owner_name: { type: DataTypes.STRING(120), allowNull: true },
      contact_phone: { type: DataTypes.STRING(40), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "ACTIVA" }
    },
    {
      tableName: "houses",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [{ fields: ["status"] }]
    }
  );

  return House;
};
