const ensureColumn = async (queryInterface, transaction, columnName, definition) => {
  const table = await queryInterface.describeTable("devices");
  if (table[columnName]) return;
  await queryInterface.addColumn("devices", columnName, definition, { transaction });
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    await ensureColumn(queryInterface, transaction, "device_type", {
      type: "VARCHAR(64)",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "firmware_version", {
      type: "VARCHAR(64)",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "hardware_uid", {
      type: "VARCHAR(120)",
      allowNull: true,
      unique: true
    });
    await ensureColumn(queryInterface, transaction, "last_seen_at", {
      type: "DATETIME",
      allowNull: true
    });
  }
};
