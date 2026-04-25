const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      house_id: { type: DataTypes.INTEGER, allowNull: true },
      role: {
        type: DataTypes.ENUM("admin", "operator", "resident"),
        allowNull: false,
        defaultValue: "resident"
      },
      nombre: { type: DataTypes.STRING(120), allowNull: false },
      email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false }
    },
    {
      tableName: "users",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [{ fields: ["house_id"] }, { fields: ["role"] }]
    }
  );

  return User;
};
