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
    await ensureColumn(queryInterface, "houses", "total_devices", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }, transaction);

    await ensureColumn(queryInterface, "houses", "active_devices", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }, transaction);

    await ensureColumn(queryInterface, "houses", "last_reading_at", {
      type: DataTypes.DATE,
      allowNull: true
    }, transaction);

    await ensureColumn(queryInterface, "houses", "alert_count", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }, transaction);

    await ensureColumn(queryInterface, "sensores", "ultima_calibracion", {
      type: DataTypes.DATE,
      allowNull: true
    }, transaction);

    await ensureColumn(queryInterface, "sensores", "proxima_calibracion", {
      type: DataTypes.DATE,
      allowNull: true
    }, transaction);

    await ensureColumn(queryInterface, "sensores", "factor_calibracion", {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
      defaultValue: 1.0
    }, transaction);

    await ensureColumn(queryInterface, "sensores", "offset_calibracion", {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
      defaultValue: 0.0
    }, transaction);

    await ensureColumn(queryInterface, "sensores", "alertas_activas", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }, transaction);

    await ensureColumn(queryInterface, "sensores", "precision", {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true
    }, transaction);

    await ensureColumn(queryInterface, "ubicacion_instalacion", "coordenadas", {
      type: DataTypes.JSON,
      allowNull: true
    }, transaction);

    await ensureColumn(queryInterface, "ubicacion_instalacion", "tipo_ubicacion", {
      type: DataTypes.STRING(32),
      allowNull: true
    }, transaction);

    await ensureColumn(queryInterface, "ubicacion_instalacion", "activo", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }, transaction);

    await ensureColumn(queryInterface, "ubicacion_instalacion", "dispositivos_conectados", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }, transaction);
  }
};
