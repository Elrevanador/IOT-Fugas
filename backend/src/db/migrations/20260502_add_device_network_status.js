const ensureColumn = async (queryInterface, transaction, columnName, definition) => {
  const table = await queryInterface.describeTable("devices");
  if (table[columnName]) return;
  await queryInterface.addColumn("devices", columnName, definition, { transaction });
};

const ensureIndex = async (queryInterface, transaction, indexName, fields) => {
  const indexes = await queryInterface.showIndex("devices");
  if (indexes.some((index) => index.name === indexName)) return;
  await queryInterface.addIndex("devices", fields, { name: indexName, transaction });
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    await ensureColumn(queryInterface, transaction, "ip_address", {
      type: "VARCHAR(45)",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "wifi_ssid", {
      type: "VARCHAR(120)",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "internet_connected", {
      type: "BOOLEAN",
      allowNull: false,
      defaultValue: false
    });
    await ensureColumn(queryInterface, transaction, "last_connection_at", {
      type: "DATETIME",
      allowNull: true
    });
    await ensureIndex(queryInterface, transaction, "devices_internet_connected_idx", ["internet_connected"]);
  }
};
