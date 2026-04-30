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

const indexExists = async (queryInterface, tableName, indexName) => {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    return indexes.some((index) => index.name === indexName);
  } catch {
    return false;
  }
};

const ensureIndex = async (queryInterface, tableName, fields, options, transaction) => {
  if (options?.name && (await indexExists(queryInterface, tableName, options.name))) return;

  try {
    await queryInterface.addIndex(tableName, fields, { ...options, transaction });
  } catch (err) {
    if (!/duplicate|exists/i.test(String(err && err.message))) throw err;
  }
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    await ensureColumn(
      queryInterface,
      "users",
      "apellido",
      {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      transaction
    );

    await ensureColumn(
      queryInterface,
      "users",
      "username",
      {
        type: DataTypes.STRING(80),
        allowNull: true,
        unique: true
      },
      transaction
    );

    await ensureColumn(
      queryInterface,
      "users",
      "estado",
      {
        type: DataTypes.ENUM("ACTIVO", "INACTIVO", "BLOQUEADO"),
        allowNull: false,
        defaultValue: "ACTIVO"
      },
      transaction
    );

    await ensureIndex(queryInterface, "users", ["username"], { name: "users_username_idx", unique: true }, transaction);
    await ensureIndex(queryInterface, "users", ["estado"], { name: "users_estado_idx" }, transaction);
  }
};
