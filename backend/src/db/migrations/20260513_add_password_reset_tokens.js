"use strict";

const { DataTypes } = require("sequelize");

const tableExists = async (queryInterface, tableName) => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch (error) {
    if (/no.*exist|unknown table/i.test(String(error && error.message))) return false;
    throw error;
  }
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    if (await tableExists(queryInterface, "password_reset_tokens")) return;

    await queryInterface.createTable(
      "password_reset_tokens",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        token_hash: {
          type: DataTypes.STRING(64),
          allowNull: false,
          unique: true
        },
        expires_at: { type: DataTypes.DATE, allowNull: false },
        used_at: { type: DataTypes.DATE, allowNull: true },
        requested_ip: { type: DataTypes.STRING(45), allowNull: true },
        requested_user_agent: { type: DataTypes.STRING(500), allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      { transaction }
    );

    await queryInterface.addIndex("password_reset_tokens", ["user_id"], {
      name: "idx_password_reset_tokens_user",
      transaction
    });
    await queryInterface.addIndex("password_reset_tokens", ["expires_at"], {
      name: "idx_password_reset_tokens_expires",
      transaction
    });
    await queryInterface.addIndex("password_reset_tokens", ["used_at"], {
      name: "idx_password_reset_tokens_used",
      transaction
    });
  }
};
