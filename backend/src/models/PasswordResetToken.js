const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PasswordResetToken = sequelize.define(
    "PasswordResetToken",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      token_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
      },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      used_at: { type: DataTypes.DATE, allowNull: true },
      requested_ip: { type: DataTypes.STRING(45), allowNull: true },
      requested_user_agent: { type: DataTypes.STRING(500), allowNull: true }
    },
    {
      tableName: "password_reset_tokens",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["user_id"] },
        { fields: ["token_hash"], unique: true },
        { fields: ["expires_at"] },
        { fields: ["used_at"] }
      ]
    }
  );

  return PasswordResetToken;
};
