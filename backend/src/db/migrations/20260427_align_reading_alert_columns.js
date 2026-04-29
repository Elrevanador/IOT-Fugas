const ensureColumn = async (queryInterface, transaction, tableName, columnName, definition) => {
  const table = await queryInterface.describeTable(tableName);
  if (table[columnName]) return;
  await queryInterface.addColumn(tableName, columnName, definition, { transaction });
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    await ensureColumn(queryInterface, transaction, "readings", "quality_score", {
      type: "INTEGER",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "readings", "is_anomaly", {
      type: "BOOLEAN",
      allowNull: false,
      defaultValue: false
    });
    await ensureColumn(queryInterface, transaction, "readings", "processed_at", {
      type: "DATETIME",
      allowNull: true
    });

    await ensureColumn(queryInterface, transaction, "alerts", "auto_resolved", {
      type: "BOOLEAN",
      allowNull: false,
      defaultValue: false
    });
    await ensureColumn(queryInterface, transaction, "alerts", "resolved_at", {
      type: "DATETIME",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "alerts", "escalation_level", {
      type: "INTEGER",
      allowNull: false,
      defaultValue: 0
    });
    await ensureColumn(queryInterface, transaction, "alerts", "notification_sent", {
      type: "BOOLEAN",
      allowNull: false,
      defaultValue: false
    });
  }
};
