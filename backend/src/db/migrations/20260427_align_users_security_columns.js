"use strict";

const { DataTypes } = require("sequelize");

const ensureColumn = async (queryInterface, tableName, columnName, definition, transaction) => {
  try {
    const table = await queryInterface.describeTable(tableName);
    if (table[columnName]) return;
    await queryInterface.addColumn(tableName, columnName, definition, { transaction });
  } catch (err) {
    if (!/no.*exist/i.test(String(err && err.message))) throw err;
  }
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    await ensureColumn(queryInterface, "users", "email_verified", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }, transaction);

    await ensureColumn(queryInterface, "users", "last_login_at", {
      type: DataTypes.DATE,
      allowNull: true
    }, transaction);

    await ensureColumn(queryInterface, "users", "failed_login_attempts", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }, transaction);

    await ensureColumn(queryInterface, "users", "locked_until", {
      type: DataTypes.DATE,
      allowNull: true
    }, transaction);

    await ensureColumn(queryInterface, "users", "password_changed_at", {
      type: DataTypes.DATE,
      allowNull: true
    }, transaction);
  }
};
