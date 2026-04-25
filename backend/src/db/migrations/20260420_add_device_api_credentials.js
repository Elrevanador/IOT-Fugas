const ensureDeviceCredentialColumns = async (queryInterface, transaction) => {
  const table = await queryInterface.describeTable("devices");

  if (!table.api_key_hash) {
    await queryInterface.addColumn(
      "devices",
      "api_key_hash",
      {
        type: "VARCHAR(255)",
        allowNull: true
      },
      { transaction }
    );
  }

  if (!table.api_key_hint) {
    await queryInterface.addColumn(
      "devices",
      "api_key_hint",
      {
        type: "VARCHAR(32)",
        allowNull: true
      },
      { transaction }
    );
  }
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    await ensureDeviceCredentialColumns(queryInterface, transaction);
  }
};
