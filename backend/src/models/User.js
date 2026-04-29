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
      email: {
        type: DataTypes.STRING(254), // RFC 5321 max email length
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
          len: [3, 254]
        }
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          len: [8, 255] // Mínimo 8 caracteres para hash
        }
      },
      // Campos de seguridad adicionales
      email_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
      last_login_at: { type: DataTypes.DATE, allowNull: true },
      failed_login_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
      locked_until: { type: DataTypes.DATE, allowNull: true },
      password_changed_at: { type: DataTypes.DATE, allowNull: true }
    },
    {
      tableName: "users",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["house_id"] },
        { fields: ["role"] },
        { fields: ["email"], unique: true },
        { fields: ["email_verified"] },
        { fields: ["last_login_at"] },
        { fields: ["locked_until"] }
      ],
      // Hooks de seguridad
      hooks: {
        beforeCreate: (user) => {
          // Validar email único (aunque ya está en BD)
          if (!user.email || !user.email.includes('@')) {
            throw new Error('Email inválido');
          }
        }
      }
    }
  );

  return User;
};
