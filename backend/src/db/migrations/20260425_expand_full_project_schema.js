const { DataTypes } = require("sequelize");

const tableExists = async (queryInterface, tableName) => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
};

const indexExists = async (queryInterface, tableName, indexName, transaction) => {
  try {
    const indexes = await queryInterface.showIndex(tableName, { transaction });
    return indexes.some((idx) => idx.name === indexName);
  } catch {
    return false;
  }
};

const ensureTable = async (queryInterface, tableName, definition, options, transaction) => {
  if (await tableExists(queryInterface, tableName)) return;
  await queryInterface.createTable(tableName, definition, { ...options, transaction });
};

const ensureColumn = async (queryInterface, tableName, columnName, definition, transaction) => {
  const table = await queryInterface.describeTable(tableName);
  if (table[columnName]) return;
  await queryInterface.addColumn(tableName, columnName, definition, { transaction });
};

const ensureIndex = async (queryInterface, tableName, fields, options, transaction) => {
