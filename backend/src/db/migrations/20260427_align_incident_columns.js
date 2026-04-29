const ensureColumn = async (queryInterface, transaction, tableName, columnName, definition) => {
  const table = await queryInterface.describeTable(tableName);
  if (table[columnName]) return;
  await queryInterface.addColumn(tableName, columnName, definition, { transaction });
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    await ensureColumn(queryInterface, transaction, "incidente_fuga", "severidad_calculada", {
      type: "ENUM('BAJA','MEDIA','ALTA','CRITICA')",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "incidente_fuga", "costo_estimado", {
      type: "DECIMAL(10,2)",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "incidente_fuga", "alertas_generadas", {
      type: "INTEGER",
      allowNull: false,
      defaultValue: 0
    });
    await ensureColumn(queryInterface, transaction, "incidente_fuga", "acciones_tomadas", {
      type: "JSON",
      allowNull: true
    });
  }
};
