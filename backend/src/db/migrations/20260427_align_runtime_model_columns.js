const ensureColumn = async (queryInterface, transaction, tableName, columnName, definition) => {
  const table = await queryInterface.describeTable(tableName);
  if (table[columnName]) return;
  await queryInterface.addColumn(tableName, columnName, definition, { transaction });
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    await ensureColumn(queryInterface, transaction, "devices", "is_active", {
      type: "BOOLEAN",
      allowNull: false,
      defaultValue: true
    });
    await ensureColumn(queryInterface, transaction, "devices", "last_config_update", {
      type: "DATETIME",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "devices", "security_flags", {
      type: "JSON",
      allowNull: true
    });

    await ensureColumn(queryInterface, transaction, "comandos_remotos", "executed_at", {
      type: "DATETIME",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "comandos_remotos", "error_message", {
      type: "VARCHAR(500)",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "comandos_remotos", "retry_count", {
      type: "INTEGER",
      allowNull: false,
      defaultValue: 0
    });
    await ensureColumn(queryInterface, transaction, "comandos_remotos", "max_retries", {
      type: "INTEGER",
      allowNull: false,
      defaultValue: 3
    });

    await ensureColumn(queryInterface, transaction, "electrovalvulas", "ultima_verificacion_at", {
      type: "DATETIME",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "electrovalvulas", "ciclos_operacion", {
      type: "INTEGER",
      allowNull: false,
      defaultValue: 0
    });
    await ensureColumn(queryInterface, transaction, "electrovalvulas", "tiempo_abierto_horas", {
      type: "DECIMAL(10,2)",
      allowNull: false,
      defaultValue: 0
    });
    await ensureColumn(queryInterface, transaction, "electrovalvulas", "alertas_activas", {
      type: "INTEGER",
      allowNull: false,
      defaultValue: 0
    });
    await ensureColumn(queryInterface, transaction, "electrovalvulas", "mantenimiento_requerido", {
      type: "BOOLEAN",
      allowNull: false,
      defaultValue: false
    });
    await ensureColumn(queryInterface, transaction, "electrovalvulas", "ultima_mantenimiento_at", {
      type: "DATETIME",
      allowNull: true
    });
    await ensureColumn(queryInterface, transaction, "electrovalvulas", "bloqueo_emergencia", {
      type: "BOOLEAN",
      allowNull: false,
      defaultValue: false
    });
    await ensureColumn(queryInterface, transaction, "electrovalvulas", "razon_bloqueo", {
      type: "VARCHAR(200)",
      allowNull: true
    });
  }
};
